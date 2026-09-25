import fs from "node:fs";
import path from "node:path";

import { PaymentMethod, PaymentStatus, Prisma, PrismaClient, TransactionType } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

type SourcePage = "EM_ABERTO" | "EMITIDAS" | "PAGAS" | "ATRASADAS";

type ImportConfig = {
  folderPath: string;
  sourcePage: SourcePage;
  sourceLabel: string;
  templeId?: string;
};

type RowData = {
  ID: string;
  Cliente: string;
  "Data Emissão": string;
  "Data Vencimento": string;
  "Data Liquidação": string;
  "Valor documento": unknown;
  Saldo: unknown;
  Situação: string;
  "Número documento": string;
  "Número no banco": string;
  Categoria: string;
  Histórico: string;
  "Forma de recebimento": string;
  "Meio de recebimento": string;
  Taxas: unknown;
  Competência: string;
  Recebimento: string;
  Recebido: unknown;
  __EMPTY?: string;
  __sourceFile: string;
};

function parseArgs() {
  const [folderPath, sourcePage, sourceLabel, templeId] = process.argv.slice(2);

  if (!folderPath || !sourcePage || !sourceLabel) {
    throw new Error(
      "Uso: npx tsx scripts/import-olist-receivables-manual.ts <pasta> <EM_ABERTO|EMITIDAS|PAGAS|ATRASADAS> <rótulo> [templeId]"
    );
  }

  return {
    folderPath,
    sourcePage: sourcePage as SourcePage,
    sourceLabel,
    templeId,
  } satisfies ImportConfig;
}

function parsePtBrNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value).trim();

  if (!text) {
    return 0;
  }

  if (/^-?\d+([.,]\d+)?$/.test(text)) {
    if (text.includes(",") && text.includes(".")) {
      return Number(text.replace(/\./g, "").replace(",", "."));
    }

    if (text.includes(",")) {
      return Number(text.replace(",", "."));
    }

    return Number(text);
  }

  return Number(
    text
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  ) || 0;
}

function parseDate(value: unknown) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
}

function resolvePaymentMethod(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("pix")) return PaymentMethod.PIX;
  if (normalized.includes("boleto")) return PaymentMethod.BOLETO;
  if (normalized.includes("crédito") || normalized.includes("credito")) return PaymentMethod.CARTAO_CREDITO;
  if (normalized.includes("débito") || normalized.includes("debito")) return PaymentMethod.CARTAO_DEBITO;
  if (normalized.includes("transfer")) return PaymentMethod.TRANSFERENCIA;
  if (normalized.includes("dinheiro") || normalized.includes("espécie") || normalized.includes("especie")) {
    return PaymentMethod.DINHEIRO;
  }

  return null;
}

function statusForSourcePage(sourcePage: SourcePage) {
  switch (sourcePage) {
    case "PAGAS":
      return PaymentStatus.PAID;
    case "ATRASADAS":
      return PaymentStatus.OVERDUE;
    case "EMITIDAS":
    case "EM_ABERTO":
    default:
      return PaymentStatus.PENDING;
  }
}

function sourcePagesFor(sourcePage: SourcePage) {
  const pages = new Set<string>(["TODAS", sourcePage]);

  if (sourcePage === "ATRASADAS") {
    pages.add("EM_ABERTO");
  }

  return [...pages];
}

function buildRowSnapshot(row: RowData, sourceLabel: string) {
  const orderedEntries: Array<[string, unknown]> = [
    ["Origem manual", sourceLabel],
    ["Arquivo", row.__sourceFile],
    ["ID", row.ID],
    ["Cliente", row.Cliente],
    ["Data Emissão", row["Data Emissão"]],
    ["Data Vencimento", row["Data Vencimento"]],
    ["Data Liquidação", row["Data Liquidação"]],
    ["Valor documento", row["Valor documento"]],
    ["Saldo", row.Saldo],
    ["Situação", row.Situação],
    ["Número documento", row["Número documento"]],
    ["Número no banco", row["Número no banco"]],
    ["Categoria", row.Categoria],
    ["Histórico", row.Histórico],
    ["Forma de recebimento", row["Forma de recebimento"]],
    ["Meio de recebimento", row["Meio de recebimento"]],
    ["Taxas", row.Taxas],
    ["Competência", row.Competência],
    ["Recebimento", row.Recebimento],
    ["Recebido", row.Recebido],
  ];

  return orderedEntries
    .map(([key, value]) => `${key}: ${String(value ?? "")}`)
    .join(" | ");
}

async function resolveTempleId(explicitTempleId?: string) {
  if (explicitTempleId) {
    return explicitTempleId;
  }

  const temples = await prisma.temple.findMany({
    select: { id: true },
    take: 2,
  });

  if (temples.length !== 1) {
    throw new Error("Informe o templeId explicitamente.");
  }

  return temples[0].id;
}

async function ensureCategory(templeId: string, categoryName: string) {
  await prisma.financialCategory.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: categoryName,
      },
    },
    update: {
      deletedAt: null,
      ativo: true,
      descricao: "Categoria criada automaticamente pela importação manual do Olist.",
    },
    create: {
      templeId,
      nome: categoryName,
      descricao: "Categoria criada automaticamente pela importação manual do Olist.",
      ativo: true,
    },
  });

  const category = await prisma.financialCategory.findFirstOrThrow({
    where: {
      templeId,
      nome: categoryName,
    },
    select: { id: true },
  });

  return category.id;
}

async function ensureCategories(
  templeId: string,
  categoryNames: string[]
) {
  const uniqueNames = [...new Set(categoryNames.map((name) => name.trim()).filter(Boolean))];

  if (!uniqueNames.length) {
    return new Map<string, string>();
  }

  await prisma.financialCategory.createMany({
    data: uniqueNames.map((name) => ({
      templeId,
      nome: name,
      descricao: "Categoria criada automaticamente pela importação manual do Olist.",
      ativo: true,
    })),
    skipDuplicates: true,
  });

  const categories = await prisma.financialCategory.findMany({
    where: {
      templeId,
      nome: {
        in: uniqueNames,
      },
    },
    select: {
      id: true,
      nome: true,
    },
  });

  return new Map(categories.map((category) => [category.nome, category.id]));
}

function readRows(folderPath: string) {
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => /\.xls$/i.test(file))
    .sort();

  const rows: RowData[] = [];

  for (const file of files) {
    const workbook = XLSX.readFile(path.join(folderPath, file), { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });

    for (const row of sheetRows) {
      rows.push({
        ID: String(row.ID || "").trim(),
        Cliente: String(row.Cliente || "").trim(),
        "Data Emissão": String(row["Data Emissão"] || "").trim(),
        "Data Vencimento": String(row["Data Vencimento"] || "").trim(),
        "Data Liquidação": String(row["Data Liquidação"] || "").trim(),
        "Valor documento": row["Valor documento"] ?? "",
        Saldo: row.Saldo ?? "",
        Situação: String(row.Situação || "").trim(),
        "Número documento": String(row["Número documento"] || "").trim(),
        "Número no banco": String(row["Número no banco"] || "").trim(),
        Categoria: String(row.Categoria || "").trim(),
        Histórico: String(row.Histórico || "").trim(),
        "Forma de recebimento": String(row["Forma de recebimento"] || "").trim(),
        "Meio de recebimento": String(row["Meio de recebimento"] || "").trim(),
        Taxas: row.Taxas ?? "",
        Competência: String(row.Competência || "").trim(),
        Recebimento: String(row.Recebimento || "").trim(),
        Recebido: row.Recebido ?? "",
        __EMPTY: String(row.__EMPTY || "").trim(),
        __sourceFile: file,
      });
    }
  }

  return rows;
}

async function main() {
  const config = parseArgs();
  const folderPath = path.resolve(config.folderPath);
  const templeId = await resolveTempleId(config.templeId);
  const rows = readRows(folderPath);

  if (!rows.length) {
    throw new Error(`Nenhuma linha encontrada em ${folderPath}`);
  }

  const deduped = new Map<string, RowData>();

  for (const row of rows) {
    if (!row.ID) {
      continue;
    }

    deduped.set(row.ID, row);
  }

  const categoryCache = await ensureCategories(
    templeId,
    [...deduped.values()].map((row) => row.Categoria || "Sem categoria")
  );
  const existingRows = await prisma.financialTransaction.findMany({
    where: {
      templeId,
      externalSource: "olist:contas-receber",
      externalId: {
        in: [...deduped.keys()],
      },
    },
    select: {
      id: true,
      externalId: true,
      sourcePages: true,
      sourceFiles: true,
    },
  });
  const existingByExternalId = new Map(
    existingRows
      .filter((row) => row.externalId)
      .map((row) => [row.externalId as string, row])
  );

  let imported = 0;
  const creates: Prisma.FinancialTransactionCreateManyInput[] = [];
  const updates: Array<Promise<unknown>> = [];

  for (const row of deduped.values()) {
    const categoryName = row.Categoria || "Sem categoria";
    const categoryId = categoryCache.get(categoryName);

    if (!categoryId) {
      throw new Error(`Categoria não encontrada para ${categoryName}`);
    }

    const existing = existingByExternalId.get(row.ID);

    const mergedSourcePages = new Set<string>([
      ...(existing?.sourcePages ?? []),
      ...sourcePagesFor(config.sourcePage),
    ]);

    const mergedSourceFiles = new Set<string>([
      ...(existing?.sourceFiles ?? []),
      `manual_olist_receber/${config.sourceLabel}`,
      `manual_olist_receber/${config.sourceLabel}/${row.__sourceFile}`,
    ]);

    const payload = {
      categoryId,
      descricao: row.Histórico || row.Cliente || `Conta a receber manual #${row.ID}`,
      centroCusto: row.Cliente || null,
      tipo: TransactionType.INCOME,
      valor: parsePtBrNumber(row["Valor documento"]),
      metodo: resolvePaymentMethod(row["Forma de recebimento"]),
      status: statusForSourcePage(config.sourcePage),
      issuedAt: parseDate(row["Data Emissão"]),
      competencia: parseDate(row.Competência),
      rawStatus: row.Situação || null,
      amountPaid: parsePtBrNumber(row.Recebido),
      documentNumber: row["Número documento"] || null,
      paymentReference: row["Número no banco"] || null,
      sourcePages: [...mergedSourcePages],
      sourceFiles: [...mergedSourceFiles],
      vencimento: parseDate(row["Data Vencimento"]),
      pagamentoEm: parseDate(row["Data Liquidação"]) ?? parseDate(row.Recebimento),
      observacoes: buildRowSnapshot(row, config.sourceLabel),
      deletedAt: null,
    };

    if (existing) {
      updates.push(
        prisma.financialTransaction.update({
          where: {
            id: existing.id,
          },
          data: payload,
        })
      );
    } else {
      creates.push({
        templeId,
        quantidadeParcelas: null,
        valorParcela: null,
        externalSource: "olist:contas-receber",
        externalId: row.ID,
        ...payload,
      });
    }

    imported += 1;
  }

  for (let index = 0; index < creates.length; index += 250) {
    await prisma.financialTransaction.createMany({
      data: creates.slice(index, index + 250),
      skipDuplicates: true,
    });
  }

  for (let index = 0; index < updates.length; index += 20) {
    await Promise.all(updates.slice(index, index + 20));
  }

  const summary = await prisma.financialTransaction.count({
    where: {
      templeId,
      externalSource: "olist:contas-receber",
      deletedAt: null,
      sourcePages: {
        has: config.sourcePage,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        folder: folderPath,
        sourcePage: config.sourcePage,
        sourceLabel: config.sourceLabel,
        files: fs.readdirSync(folderPath).filter((file) => /\.xls$/i.test(file)).sort(),
        rowsRead: rows.length,
        uniqueIds: deduped.size,
        imported,
        created: creates.length,
        updated: updates.length,
        summary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
