import fs from "node:fs/promises";
import path from "node:path";

import {
  Prisma,
  PaymentMethod,
  PaymentStatus,
  TransactionType,
} from "@prisma/client";
import XLSX from "xlsx";

import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/modules/shared";

const PAGE_FOLDERS = [
  { folderName: "todas", pageLabel: "TODAS" },
  { folderName: "Todas", pageLabel: "TODAS" },
  { folderName: "em aberto", pageLabel: "EM_ABERTO" },
  { folderName: "em  aberto", pageLabel: "EM_ABERTO" },
  { folderName: "emitidas", pageLabel: "EMITIDAS" },
  { folderName: "pagas", pageLabel: "PAGAS" },
  { folderName: "atrasadas", pageLabel: "ATRASADAS" },
  { folderName: "Atrasadas", pageLabel: "ATRASADAS" },
] as const;

type ManualPage = (typeof PAGE_FOLDERS)[number]["pageLabel"];

type RawRow = {
  ID: string | number;
  Fornecedor: string;
  "Data Emissão": string;
  "Data Vencimento": string;
  "Data Liquidação": string;
  "Valor documento": string | number;
  Saldo: string | number;
  Situação: string;
  "Número documento": string;
  Categoria: string;
  Histórico: string;
  Pago: string | number;
  Competência: string;
  "Forma Pagamento": string;
  "Chave PIX/Código boleto": string;
};

type NormalizedRow = {
  externalId: string;
  supplier: string;
  issuedAt: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  amount: number;
  balance: number;
  rawStatus: string;
  documentNumber: string | null;
  categoryName: string;
  history: string | null;
  amountPaid: number;
  competence: Date | null;
  paymentMethodLabel: string | null;
  paymentReference: string | null;
  sourcePage: ManualPage;
  sourceFile: string;
};

function parsePtBrDate(value: string | undefined) {
  if (!value || !value.trim()) {
    return null;
  }

  const [day, month, year] = value.split("/");
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNumber(value: string | number | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value)
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: string, dueDate: Date | null, balance: number) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "paga") {
    return PaymentStatus.PAID;
  }

  if (normalized === "parcial") {
    if (dueDate && dueDate.getTime() < Date.now()) {
      return PaymentStatus.OVERDUE;
    }

    return PaymentStatus.PENDING;
  }

  if (balance <= 0) {
    return PaymentStatus.PAID;
  }

  if (dueDate && dueDate.getTime() < Date.now()) {
    return PaymentStatus.OVERDUE;
  }

  return PaymentStatus.PENDING;
}

function mapPaymentMethod(label: string | null) {
  const normalized = label?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("pix")) {
    return PaymentMethod.PIX;
  }

  if (normalized.includes("boleto")) {
    return PaymentMethod.BOLETO;
  }

  if (normalized.includes("crédito") || normalized.includes("credito")) {
    return PaymentMethod.CARTAO_CREDITO;
  }

  if (normalized.includes("débito") || normalized.includes("debito")) {
    return PaymentMethod.CARTAO_DEBITO;
  }

  if (
    normalized.includes("transfer") ||
    normalized.includes("ted") ||
    normalized.includes("doc")
  ) {
    return PaymentMethod.TRANSFERENCIA;
  }

  if (
    normalized.includes("dinheiro") ||
    normalized.includes("espécie") ||
    normalized.includes("especie")
  ) {
    return PaymentMethod.DINHEIRO;
  }

  return null;
}

async function getOrCreateCategoriesInBulk(
  templeId: string,
  categoryNames: string[]
) {
  const normalizedNames = [...new Set(categoryNames.map((name) => name.trim() || "Sem categoria"))];

  const existing = await prisma.financialCategory.findMany({
    where: {
      templeId,
      nome: {
        in: normalizedNames,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      nome: true,
    },
  });

  const categoryMap = new Map(existing.map((item) => [item.nome, item.id]));
  const missing = normalizedNames.filter((name) => !categoryMap.has(name));

  if (missing.length) {
    await prisma.financialCategory.createMany({
      data: missing.map((name) => ({
        templeId,
        nome: name,
        descricao: "Categoria criada automaticamente pela importação manual de contas a pagar.",
        ativo: true,
      })),
      skipDuplicates: true,
    });

    const created = await prisma.financialCategory.findMany({
      where: {
        templeId,
        nome: {
          in: missing,
        },
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
      },
    });

    created.forEach((item) => {
      categoryMap.set(item.nome, item.id);
    });
  }

  return categoryMap;
}

function normalizeRow(row: RawRow, sourcePage: ManualPage, sourceFile: string) {
  const externalId = String(row.ID || "").trim();
  const supplier = String(row.Fornecedor || "").trim();

  if (!externalId || !supplier) {
    return null;
  }

  return {
    externalId,
    supplier,
    issuedAt: parsePtBrDate(String(row["Data Emissão"] || "")),
    dueDate: parsePtBrDate(String(row["Data Vencimento"] || "")),
    paidAt: parsePtBrDate(String(row["Data Liquidação"] || "")),
    amount: parseNumber(row["Valor documento"]),
    balance: parseNumber(row.Saldo),
    rawStatus: String(row.Situação || "").trim(),
    documentNumber: String(row["Número documento"] || "").trim() || null,
    categoryName: String(row.Categoria || "").trim() || "Sem categoria",
    history: String(row.Histórico || "").trim() || null,
    amountPaid: parseNumber(row.Pago),
    competence: parsePtBrDate(String(row.Competência || "")),
    paymentMethodLabel:
      String(row["Forma Pagamento"] || "").trim() || null,
    paymentReference:
      String(row["Chave PIX/Código boleto"] || "").trim() || null,
    sourcePage,
    sourceFile,
  } satisfies NormalizedRow;
}

async function readManualRows(baseDir: string) {
  const rows: NormalizedRow[] = [];
  const visitedFolders = new Set<string>();

  for (const { folderName, pageLabel } of PAGE_FOLDERS) {
    const folderPath = path.join(baseDir, folderName);
    const normalizedFolderPath = path.resolve(folderPath);

    if (visitedFolders.has(normalizedFolderPath)) {
      continue;
    }

    const folderStat = await fs.stat(folderPath).catch(() => null);

    if (!folderStat?.isDirectory()) {
      continue;
    }

    visitedFolders.add(normalizedFolderPath);

    const files = (await fs.readdir(folderPath))
      .filter((file) => file.toLowerCase().endsWith(".xls"))
      .sort();

    for (const fileName of files) {
      const absolutePath = path.join(folderPath, fileName);
      const workbook = XLSX.readFile(absolutePath, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<RawRow>(worksheet, {
        defval: "",
      });

      data.forEach((row) => {
        const normalized = normalizeRow(
          row,
          pageLabel,
          path.relative(process.cwd(), absolutePath)
        );

        if (normalized) {
          rows.push(normalized);
        }
      });
    }
  }

  return rows;
}

export async function importManualPayablesFromFolder(args: {
  templeId: string;
  baseDir: string;
}) {
  const rows = await readManualRows(args.baseDir);
  const grouped = new Map<string, NormalizedRow[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.externalId) ?? [];
    current.push(row);
    grouped.set(row.externalId, current);
  });

  const latestEntries = new Map<
    string,
    {
      latest: NormalizedRow;
      sourcePages: string[];
      sourceFiles: string[];
    }
  >();

  for (const [externalId, entries] of grouped) {
    const latest = [...entries].sort((a, b) => {
      const issuedDiff =
        (a.issuedAt?.getTime() ?? 0) - (b.issuedAt?.getTime() ?? 0);

      if (issuedDiff !== 0) {
        return issuedDiff;
      }

      return a.sourceFile.localeCompare(b.sourceFile);
    })[entries.length - 1];

    latestEntries.set(externalId, {
      latest,
      sourcePages: [...new Set(entries.map((entry) => entry.sourcePage))],
      sourceFiles: [...new Set(entries.map((entry) => entry.sourceFile))],
    });
  }

  const categoryMap = await getOrCreateCategoriesInBulk(
    args.templeId,
    [...latestEntries.values()].map((entry) => entry.latest.categoryName)
  );

  const existingTransactions = await prisma.financialTransaction.findMany({
    where: {
      templeId: args.templeId,
      externalSource: "manual:contas-pagar",
      externalId: {
        in: [...latestEntries.keys()],
      },
    },
    select: {
      id: true,
      externalId: true,
    },
  });

  const existingMap = new Map(
    existingTransactions
      .filter((item) => item.externalId)
      .map((item) => [item.externalId as string, item.id])
  );

  let created = 0;
  let updated = 0;
  const createBatch: Prisma.FinancialTransactionCreateManyInput[] = [];

  for (const [externalId, entry] of latestEntries) {
    const { latest, sourcePages, sourceFiles } = entry;
    const categoryId = categoryMap.get(latest.categoryName.trim() || "Sem categoria");

    if (!categoryId) {
      throw new Error(`Categoria não encontrada para importação manual: ${latest.categoryName}`);
    }

    const status = normalizeStatus(
      latest.rawStatus,
      latest.dueDate,
      latest.balance
    );

    const data = {
      categoryId,
      descricao: latest.history || latest.supplier,
      centroCusto: latest.supplier,
      tipo: TransactionType.EXPENSE,
      valor: toDecimal(latest.amount),
      metodo: mapPaymentMethod(latest.paymentMethodLabel),
      status,
      issuedAt: latest.issuedAt,
      competencia: latest.competence,
      rawStatus: latest.rawStatus || null,
      amountPaid: toDecimal(latest.amountPaid),
      documentNumber: latest.documentNumber,
      paymentReference: latest.paymentReference,
      sourcePages,
      sourceFiles,
      vencimento: latest.dueDate,
      pagamentoEm: latest.paidAt,
      observacoes: `Importação manual de contas a pagar. Arquivos: ${sourceFiles.join(", ")}`,
      externalSource: "manual:contas-pagar",
      externalId,
    };

    const existingId = existingMap.get(externalId);

    if (existingId) {
      await prisma.financialTransaction.update({
        where: {
          id: existingId,
        },
        data,
      });

      updated += 1;
    } else {
      createBatch.push({
        templeId: args.templeId,
        ...data,
      });
    }
  }

  if (createBatch.length) {
    await prisma.financialTransaction.createMany({
      data: createBatch,
      skipDuplicates: true,
    });

    created += createBatch.length;
  }

  return {
    rowsRead: rows.length,
    uniqueEntries: grouped.size,
    created,
    updated,
  };
}
