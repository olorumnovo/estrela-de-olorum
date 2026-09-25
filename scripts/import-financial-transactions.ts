import fs from "node:fs";
import path from "node:path";

import { PaymentMethod, PaymentStatus, PrismaClient, TransactionType } from "@prisma/client";
import xlsx from "xlsx";

const prisma = new PrismaClient();

const RECEIVABLE_PREFIX = "contas_receber_";
const PAYABLE_PREFIX = "contas_pagar_";
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg?.split("=")[1] ?? "all";
const resume = process.argv.includes("--resume");
const DEFAULT_IMPORT_DIRECTORIES = [process.cwd(), "/home/paulo-pereira/Downloads"];

type PayableSourceGroup =
  | "all"
  | "open"
  | "issued"
  | "paid"
  | "overdue"
  | "canceled";

type ReceivableSourceGroup =
  | "all"
  | "open"
  | "issued"
  | "paid"
  | "overdue"
  | "canceled";

type ReceivableRow = {
  ID?: string | number;
  Cliente?: string;
  "Data Emissão"?: string;
  "Data Vencimento"?: string;
  "Data Liquidação"?: string;
  "Valor documento"?: string | number;
  Saldo?: string | number;
  Situação?: string;
  "Número documento"?: string;
  "Número no banco"?: string;
  Categoria?: string;
  Histórico?: string;
  "Forma de recebimento"?: string;
  "Meio de recebimento"?: string;
  Taxas?: string | number;
  Competência?: string;
  Recebimento?: string | number;
  Recebido?: string | number;
};

type PayableRow = {
  ID?: string | number;
  Fornecedor?: string;
  "Data Emissão"?: string;
  "Data Vencimento"?: string;
  "Data Liquidação"?: string;
  "Valor documento"?: string | number;
  Saldo?: string | number;
  Situação?: string;
  "Número documento"?: string;
  Categoria?: string;
  Histórico?: string;
  Pago?: string | number;
  Competência?: string;
  "Forma Pagamento"?: string;
  "Chave PIX/Código boleto"?: string;
};

function asString(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBrazilianDate(value: unknown) {
  const text = asString(value);

  if (!text) return null;

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(value: string | null, dueDate: Date | null) {
  const normalized = (value || "").trim().toLowerCase();

  if (
    normalized.includes("paga") ||
    normalized.includes("pago") ||
    normalized.includes("recebida") ||
    normalized.includes("recebido") ||
    normalized.includes("liquidada") ||
    normalized.includes("liquidado")
  ) {
    return "PAID" satisfies PaymentStatus;
  }

  if (normalized.includes("cancel")) {
    return "CANCELED" satisfies PaymentStatus;
  }

  if (dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    due.setHours(23, 59, 59, 999);

    if (due < now) {
      return "OVERDUE" satisfies PaymentStatus;
    }
  }

  return "PENDING" satisfies PaymentStatus;
}

function normalizeMethod(value: string | null) {
  const normalized = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) return null;
  if (normalized.includes("pix")) return "PIX" satisfies PaymentMethod;
  if (normalized.includes("dinheiro")) return "DINHEIRO" satisfies PaymentMethod;
  if (normalized.includes("boleto")) return "BOLETO" satisfies PaymentMethod;
  if (normalized.includes("transfer")) return "TRANSFERENCIA" satisfies PaymentMethod;
  if (normalized.includes("debito")) return "CARTAO_DEBITO" satisfies PaymentMethod;
  if (normalized.includes("credito")) return "CARTAO_CREDITO" satisfies PaymentMethod;
  if (normalized.includes("cartao")) return "CARTAO_CREDITO" satisfies PaymentMethod;

  return null;
}

function extractLegacyId(observacoes: string | null) {
  if (!observacoes) {
    return null;
  }

  const match = observacoes.match(/ID legado:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function buildDescription(history: string | null, category: string | null, person: string | null, type: TransactionType) {
  if (history) return history;
  if (category) return category;
  if (person) {
    return type === "INCOME" ? `Recebimento - ${person}` : `Pagamento - ${person}`;
  }

  return type === "INCOME" ? "Conta a receber importada" : "Conta a pagar importada";
}

function listFiles(prefix: string) {
  return fs
    .readdirSync(process.cwd())
    .filter((file) => file.startsWith(prefix) && /\.(xls|xlsx)$/i.test(file))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function listSpreadsheetFiles(directory: string) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((file) => /\.(xls|xlsx)$/i.test(file))
    .map((file) => path.join(directory, file));
}

function normalizeFileName(filePath: string) {
  return path
    .basename(filePath)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveImportPath(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function detectPayableGroup(filePath: string): PayableSourceGroup | null {
  const fileName = normalizeFileName(filePath);

  if (fileName.startsWith(PAYABLE_PREFIX)) {
    return "all";
  }

  if (fileName.includes("cancelad")) {
    return "canceled";
  }

  if (fileName.includes("atrasad")) {
    return "overdue";
  }

  if (fileName.includes("paga")) {
    return "paid";
  }

  if (fileName.includes("emitid")) {
    return "issued";
  }

  if (fileName.includes("em aberto") || fileName.includes("em_aberto") || fileName.includes("aberto")) {
    return "open";
  }

  if (fileName.includes("todas") || fileName.includes("todos")) {
    return "all";
  }

  return null;
}

function detectReceivableGroup(filePath: string): ReceivableSourceGroup | null {
  const fileName = normalizeFileName(filePath);

  if (fileName.startsWith(RECEIVABLE_PREFIX)) {
    return "all";
  }

  if (fileName.includes("cancelad")) {
    return "canceled";
  }

  if (fileName.includes("atrasad")) {
    return "overdue";
  }

  if (
    fileName.includes("recebid") ||
    fileName.includes("pag") ||
    fileName.includes("liquidad")
  ) {
    return "paid";
  }

  if (fileName.includes("emitid")) {
    return "issued";
  }

  if (fileName.includes("em aberto") || fileName.includes("em_aberto") || fileName.includes("aberto")) {
    return "open";
  }

  if (fileName.includes("todas") || fileName.includes("todos")) {
    return "all";
  }

  return null;
}

function listReceivableFiles() {
  const files = DEFAULT_IMPORT_DIRECTORIES.flatMap((directory) => listSpreadsheetFiles(directory));
  const uniqueFiles = [...new Set(files)];

  return uniqueFiles
    .filter((file) => detectReceivableGroup(file))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function listPayableFiles() {
  const files = DEFAULT_IMPORT_DIRECTORIES.flatMap((directory) => listSpreadsheetFiles(directory));
  const uniqueFiles = [...new Set(files)];

  return uniqueFiles
    .filter((file) => detectPayableGroup(file))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function payableGroupPriority(group: PayableSourceGroup) {
  switch (group) {
    case "canceled":
      return 5;
    case "paid":
      return 4;
    case "overdue":
      return 3;
    case "open":
      return 2;
    case "issued":
      return 1;
    case "all":
    default:
      return 0;
  }
}

function receivableGroupPriority(group: ReceivableSourceGroup) {
  switch (group) {
    case "canceled":
      return 5;
    case "paid":
      return 4;
    case "overdue":
      return 3;
    case "open":
      return 2;
    case "issued":
      return 1;
    case "all":
    default:
      return 0;
  }
}

function payableStatusFromGroup(group: PayableSourceGroup, dueDate: Date | null) {
  switch (group) {
    case "canceled":
      return "CANCELED" satisfies PaymentStatus;
    case "paid":
      return "PAID" satisfies PaymentStatus;
    case "overdue":
      return "OVERDUE" satisfies PaymentStatus;
    case "open":
      return "PENDING" satisfies PaymentStatus;
    default:
      return normalizeStatus(null, dueDate);
  }
}

function receivableStatusFromGroup(group: ReceivableSourceGroup, dueDate: Date | null) {
  switch (group) {
    case "canceled":
      return "CANCELED" satisfies PaymentStatus;
    case "paid":
      return "PAID" satisfies PaymentStatus;
    case "overdue":
      return "OVERDUE" satisfies PaymentStatus;
    case "open":
      return "PENDING" satisfies PaymentStatus;
    default:
      return normalizeStatus(null, dueDate);
  }
}

function shouldSkipTransaction(person: string | null, value: number, status: PaymentStatus) {
  if (!person) {
    return true;
  }

  if (value > 0) {
    return false;
  }

  return status !== "CANCELED";
}

async function createTransactionsInBatches(
  data: Array<{
    templeId: string;
    categoryId: string;
    descricao: string;
    centroCusto: string | null;
    tipo: TransactionType;
    valor: number;
    quantidadeParcelas: null;
    valorParcela: null;
    metodo: PaymentMethod | null;
    status: PaymentStatus;
    vencimento: Date | null;
    pagamentoEm: Date | null;
    comprovante: null;
    observacoes: string | null;
  }>,
  batchSize = 200
) {
  for (let index = 0; index < data.length; index += batchSize) {
    const chunk = data.slice(index, index + batchSize);
    await prisma.financialTransaction.createMany({
      data: chunk,
    });
  }
}

async function ensureCategories(templeId: string, names: string[]) {
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  if (uniqueNames.length === 0) {
    return new Map<string, string>();
  }

  const existing = await prisma.financialCategory.findMany({
    where: {
      templeId,
      deletedAt: null,
      nome: { in: uniqueNames },
    },
    select: {
      id: true,
      nome: true,
    },
  });

  const categoryMap = new Map(existing.map((category) => [category.nome, category.id]));
  const missing = uniqueNames.filter((name) => !categoryMap.has(name));

  if (missing.length > 0) {
    await prisma.financialCategory.createMany({
      data: missing.map((nome) => ({
        templeId,
        nome,
        descricao: `Categoria criada automaticamente na importação financeira.`,
      })),
    });

    const created = await prisma.financialCategory.findMany({
      where: {
        templeId,
        deletedAt: null,
        nome: { in: missing },
      },
      select: {
        id: true,
        nome: true,
      },
    });

    created.forEach((category) => categoryMap.set(category.nome, category.id));
  }

  return categoryMap;
}

async function main() {
  const temple = await prisma.temple.findFirst({
    select: { id: true, nome: true },
  });

  if (!temple) {
    throw new Error("Nenhum templo encontrado para importar os lançamentos financeiros.");
  }

  const shouldImportReceivables = mode === "all" || mode === "receivables";
  const shouldImportPayables = mode === "all" || mode === "payables";

  if (!shouldImportReceivables && !shouldImportPayables) {
    throw new Error(`Modo de importação inválido: ${mode}. Use --mode=all, --mode=receivables ou --mode=payables.`);
  }

  const [existingIncome, existingExpense] = await Promise.all([
    prisma.financialTransaction.count({
      where: { templeId: temple.id, deletedAt: null, tipo: "INCOME" },
    }),
    prisma.financialTransaction.count({
      where: { templeId: temple.id, deletedAt: null, tipo: "EXPENSE" },
    }),
  ]);

  if (shouldImportReceivables && existingIncome > 0) {
    if (resume) {
      console.log(`Retomando importação de contas a receber com ${existingIncome} registros já existentes.`);
    } else {
      throw new Error(
        `A importação de contas a receber foi cancelada porque já existem ${existingIncome} lançamentos de receita no CRM.`
      );
    }
  }

  if (shouldImportPayables && existingExpense > 0) {
    if (resume) {
      console.log(`Retomando importação de contas a pagar com ${existingExpense} registros já existentes.`);
    } else {
      throw new Error(
        `A importação de contas a pagar foi cancelada porque já existem ${existingExpense} lançamentos de despesa no CRM.`
      );
    }
  }

  const [existingIncomeTransactions, existingExpenseTransactions] = await Promise.all([
    shouldImportReceivables && resume
      ? prisma.financialTransaction.findMany({
          where: { templeId: temple.id, deletedAt: null, tipo: "INCOME" },
          select: { observacoes: true },
        })
      : Promise.resolve([]),
    shouldImportPayables && resume
      ? prisma.financialTransaction.findMany({
          where: { templeId: temple.id, deletedAt: null, tipo: "EXPENSE" },
          select: { observacoes: true },
        })
      : Promise.resolve([]),
  ]);

  const existingIncomeLegacyIds = new Set(
    existingIncomeTransactions
      .map((transaction) => extractLegacyId(transaction.observacoes))
      .filter((value): value is string => Boolean(value))
  );

  const existingExpenseLegacyIds = new Set(
    existingExpenseTransactions
      .map((transaction) => extractLegacyId(transaction.observacoes))
      .filter((value): value is string => Boolean(value))
  );

  if (shouldImportReceivables && existingIncome > 0 && !resume) {
    throw new Error(
      `A importação de contas a receber foi cancelada porque já existem ${existingIncome} lançamentos de receita no CRM.`
    );
  }

  const receivableFiles = shouldImportReceivables ? listReceivableFiles() : [];
  const payableFiles = shouldImportPayables ? listPayableFiles() : [];

  if (receivableFiles.length === 0 && payableFiles.length === 0) {
    throw new Error("Nenhum arquivo de contas a receber ou contas a pagar foi encontrado nos diretórios de importação.");
  }

  const categoryNames: string[] = [];
  const dedupe = new Set<string>();

  const payload: Array<{
    templeId: string;
    categoryId: string;
    descricao: string;
    centroCusto: string | null;
    tipo: TransactionType;
    valor: number;
    quantidadeParcelas: null;
    valorParcela: null;
    metodo: PaymentMethod | null;
    status: PaymentStatus;
    vencimento: Date | null;
    pagamentoEm: Date | null;
    comprovante: null;
    observacoes: string | null;
  }> = [];

  const categoryPerRow: string[] = [];
  const payableMap = new Map<
    string,
    {
      data: {
        templeId: string;
        categoryId: string;
        descricao: string;
        centroCusto: string | null;
        tipo: TransactionType;
        valor: number;
        quantidadeParcelas: null;
        valorParcela: null;
        metodo: PaymentMethod | null;
        status: PaymentStatus;
        vencimento: Date | null;
        pagamentoEm: Date | null;
        comprovante: null;
        observacoes: string | null;
      };
      category: string;
      priority: number;
    }
  >();
  const receivableMap = new Map<
    string,
    {
      data: {
        templeId: string;
        categoryId: string;
        descricao: string;
        centroCusto: string | null;
        tipo: TransactionType;
        valor: number;
        quantidadeParcelas: null;
        valorParcela: null;
        metodo: PaymentMethod | null;
        status: PaymentStatus;
        vencimento: Date | null;
        pagamentoEm: Date | null;
        comprovante: null;
        observacoes: string | null;
      };
      category: string;
      priority: number;
    }
  >();

  for (const file of receivableFiles) {
    const sourceGroup = detectReceivableGroup(file);

    if (!sourceGroup) {
      continue;
    }

    const workbook = xlsx.readFile(resolveImportPath(file));
    const sheet = workbook.Sheets["Contas a Receber"] || workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) continue;

    const rows = xlsx.utils.sheet_to_json<ReceivableRow>(sheet, { defval: "" });

    for (const row of rows) {
      const sourceId = asString(row.ID);
      const person = asString(row.Cliente);
      const category = asString(row.Categoria) || "Contas a Receber";
      const history = asString(row.Histórico);
      const dueDate = parseBrazilianDate(row["Data Vencimento"]);
      const paymentDate = parseBrazilianDate(row["Data Liquidação"]);
      const rowStatus = normalizeStatus(asString(row.Situação), dueDate);
      const status = sourceGroup === "issued" || sourceGroup === "all"
        ? rowStatus
        : receivableStatusFromGroup(sourceGroup, dueDate);
      const receivedValue = asNumber(row.Recebido ?? row.Recebimento);
      const balanceValue = asNumber(row.Saldo);
      const documentValue = asNumber(row["Valor documento"]);
      const value =
        status === "PAID"
          ? receivedValue > 0
            ? receivedValue
            : documentValue
          : balanceValue > 0
            ? balanceValue
            : documentValue;

      if (shouldSkipTransaction(person, value, status)) {
        continue;
      }

      const dedupeKey = `INCOME:${sourceId || `${person}:${row["Número documento"] || history || value}`}`;

      if (sourceId && existingIncomeLegacyIds.has(sourceId)) {
        continue;
      }

      const observations = [
        sourceId ? `ID legado: ${sourceId}` : null,
        `Grupo origem: ${sourceGroup}`,
        asString(row["Número documento"]) ? `Documento: ${asString(row["Número documento"])}` : null,
        asString(row["Número no banco"]) ? `Número banco: ${asString(row["Número no banco"])}` : null,
        asString(row.Competência) ? `Competência: ${asString(row.Competência)}` : null,
        asString(row["Data Emissão"]) ? `Emissão: ${asString(row["Data Emissão"])}` : null,
        `Arquivo origem: ${file}`,
        documentValue > 0 ? `Valor documento original: ${documentValue.toFixed(2)}` : null,
        balanceValue > 0 ? `Saldo original: ${balanceValue.toFixed(2)}` : null,
        asNumber(row.Taxas) > 0 ? `Taxas: ${asNumber(row.Taxas).toFixed(2)}` : null,
        asString(row["Meio de recebimento"]) ? `Meio de recebimento: ${asString(row["Meio de recebimento"])}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const candidate: {
        templeId: string;
        categoryId: string;
        descricao: string;
        centroCusto: string | null;
        tipo: TransactionType;
        valor: number;
        quantidadeParcelas: null;
        valorParcela: null;
        metodo: PaymentMethod | null;
        status: PaymentStatus;
        vencimento: Date | null;
        pagamentoEm: Date | null;
        comprovante: null;
        observacoes: string | null;
      } = {
        templeId: temple.id,
        categoryId: "",
        descricao: buildDescription(history, category, person, "INCOME"),
        centroCusto: person,
        tipo: "INCOME",
        valor: Number(value.toFixed(2)),
        quantidadeParcelas: null,
        valorParcela: null,
        metodo: normalizeMethod(asString(row["Forma de recebimento"])),
        status,
        vencimento: dueDate,
        pagamentoEm: paymentDate,
        comprovante: null,
        observacoes: observations || null,
      };

      const current = receivableMap.get(dedupeKey);
      const priority = receivableGroupPriority(sourceGroup);

      if (!current || priority >= current.priority) {
        receivableMap.set(dedupeKey, {
          data: candidate,
          category,
          priority,
        });
      }
    }
  }

  for (const [dedupeKey, entry] of receivableMap.entries()) {
    if (dedupe.has(dedupeKey)) {
      continue;
    }

    dedupe.add(dedupeKey);
    categoryNames.push(entry.category);
    categoryPerRow.push(entry.category);
    payload.push(entry.data);
  }

  for (const file of payableFiles) {
    const sourceGroup = detectPayableGroup(file);

    if (!sourceGroup) {
      continue;
    }

    const workbook = xlsx.readFile(resolveImportPath(file));
    const sheet = workbook.Sheets["Contas a Pagar"] || workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) continue;

    const rows = xlsx.utils.sheet_to_json<PayableRow>(sheet, { defval: "" });

    for (const row of rows) {
      const sourceId = asString(row.ID);
      const person = asString(row.Fornecedor);
      const category = asString(row.Categoria) || "Contas a Pagar";
      const history = asString(row.Histórico);
      const dueDate = parseBrazilianDate(row["Data Vencimento"]);
      const paymentDate = parseBrazilianDate(row["Data Liquidação"]);
      const rowStatus = normalizeStatus(asString(row.Situação), dueDate);
      const status = sourceGroup === "issued" || sourceGroup === "all"
        ? rowStatus
        : payableStatusFromGroup(sourceGroup, dueDate);
      const paidValue = asNumber(row.Pago);
      const balanceValue = asNumber(row.Saldo);
      const documentValue = asNumber(row["Valor documento"]);
      const value =
        status === "PAID"
          ? paidValue > 0
            ? paidValue
            : documentValue
          : balanceValue > 0
            ? balanceValue
            : documentValue;

      if (shouldSkipTransaction(person, value, status)) {
        continue;
      }

      const dedupeKey = `EXPENSE:${sourceId || `${person}:${row["Número documento"] || history || value}`}`;

      if (sourceId && existingExpenseLegacyIds.has(sourceId)) {
        continue;
      }

      const observations = [
        sourceId ? `ID legado: ${sourceId}` : null,
        `Grupo origem: ${sourceGroup}`,
        asString(row["Número documento"]) ? `Documento: ${asString(row["Número documento"])}` : null,
        asString(row.Competência) ? `Competência: ${asString(row.Competência)}` : null,
        asString(row["Data Emissão"]) ? `Emissão: ${asString(row["Data Emissão"])}` : null,
        `Arquivo origem: ${file}`,
        documentValue > 0 ? `Valor documento original: ${documentValue.toFixed(2)}` : null,
        balanceValue > 0 ? `Saldo original: ${balanceValue.toFixed(2)}` : null,
        asString(row["Chave PIX/Código boleto"])
          ? `PIX/Boleto: ${asString(row["Chave PIX/Código boleto"])}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const candidate: {
        templeId: string;
        categoryId: string;
        descricao: string;
        centroCusto: string | null;
        tipo: TransactionType;
        valor: number;
        quantidadeParcelas: null;
        valorParcela: null;
        metodo: PaymentMethod | null;
        status: PaymentStatus;
        vencimento: Date | null;
        pagamentoEm: Date | null;
        comprovante: null;
        observacoes: string | null;
      } = {
        templeId: temple.id,
        categoryId: "",
        descricao: buildDescription(history, category, person, "EXPENSE"),
        centroCusto: person,
        tipo: "EXPENSE",
        valor: Number(value.toFixed(2)),
        quantidadeParcelas: null,
        valorParcela: null,
        metodo: normalizeMethod(asString(row["Forma Pagamento"])),
        status,
        vencimento: dueDate,
        pagamentoEm: paymentDate,
        comprovante: null,
        observacoes: observations || null,
      };

      const current = payableMap.get(dedupeKey);
      const priority = payableGroupPriority(sourceGroup);

      if (!current || priority >= current.priority) {
        payableMap.set(dedupeKey, {
          data: candidate,
          category,
          priority,
        });
      }
    }
  }

  for (const [dedupeKey, entry] of payableMap.entries()) {
    if (dedupe.has(dedupeKey)) {
      continue;
    }

    dedupe.add(dedupeKey);
    categoryNames.push(entry.category);
    categoryPerRow.push(entry.category);
    payload.push(entry.data);
  }

  const categoryMap = await ensureCategories(temple.id, categoryNames);

  payload.forEach((transaction, index) => {
    const categoryName = categoryPerRow[index];
    const categoryId = categoryMap.get(categoryName);

    if (!categoryId) {
      throw new Error(`Categoria não encontrada para importação: ${categoryName}`);
    }

    transaction.categoryId = categoryId;
  });

  await createTransactionsInBatches(payload);

  const income = payload.filter((item) => item.tipo === "INCOME");
  const expense = payload.filter((item) => item.tipo === "EXPENSE");

  console.log(
    JSON.stringify(
      {
        temple: temple.nome,
        mode,
        imported: payload.length,
        income: income.length,
        expense: expense.length,
        categories: [...new Set(categoryNames)].length,
        receivableFiles,
        payableFiles,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
