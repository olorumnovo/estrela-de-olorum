import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { BankAccountType } from "@prisma/client";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDecimal } from "@/modules/shared";

type SheetRow = {
  Data?: string;
  Categoria?: string;
  "Histórico"?: string;
  Tipo?: string;
  Valor?: string | number;
  Id?: string | number;
  Contato?: string;
  CNPJ?: string;
  Marcadores?: string;
  Conta?: string;
  "Nº do documento"?: string | number;
};

type FallbackLedgerEntry = {
  id: string;
  accountName: string;
  entryDate: Date;
  category: string | null;
  description: string;
  movementType: string;
  amount: number;
  externalId: string;
  contact: string | null;
  document: string | null;
  documentNumber: string | null;
  sourceFile: string;
  transferFrom: string | null;
  transferTo: string | null;
  isTransfer: boolean;
};

const fallbackLedgerCache = new Map<string, { mtimeMs: number; entries: FallbackLedgerEntry[] }>();

function parseBrazilianDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [day, month, year] = value.split("/");

  if (!day || !month || !year) {
    return null;
  }

  const date = new Date(`${year}-${month}-${day}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBrazilianAmount(value: string | number | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

const MIN_LEDGER_DATE = new Date("2020-01-01T00:00:00.000Z");
const MAX_LEDGER_DATE = new Date("2030-12-31T23:59:59.999Z");
const MAX_LEDGER_AMOUNT = 1_000_000;
const LEDGER_META_PREFIX = "__ESTRELA_META__";
const PDV_ACCOUNT_NAME = "PDV";
const LEGACY_PDV_ACCOUNT_NAME = "Conta PDV";
const PDV_LEDGER_RESET_AT = new Date("2026-08-15T18:55:00.000Z");

type LedgerAccountMeta = {
  openingAdjustment?: number;
  financialClosedAt?: string | null;
  zeroInitialWhenUnfiltered?: boolean;
};

type DefaultLedgerAccountConfig = LedgerAccountMeta & {
  fixedTotalEntries?: number;
  fixedCredits?: number;
  fixedDebits?: number;
  fixedCurrentBalance?: number;
  forceOfficialSummary?: boolean;
};

const DEFAULT_LEDGER_ACCOUNT_META: Record<string, DefaultLedgerAccountConfig> = {
  Santander: {
    openingAdjustment: 314.79,
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 4719,
    fixedCredits: 899_809.29,
    fixedDebits: 897_712.39,
    fixedCurrentBalance: 2_411.69,
    forceOfficialSummary: true,
  },
  Caixa: {
    openingAdjustment: 125_911.9,
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 2549,
    fixedCredits: 379_592.9,
    fixedDebits: 505_111.59,
    fixedCurrentBalance: 393.21,
    forceOfficialSummary: true,
  },
  GetNet: {
    openingAdjustment: 999_999_150.05,
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 167,
    fixedCredits: -999_964_849.8,
    fixedDebits: 34_300.25,
    fixedCurrentBalance: 0,
    forceOfficialSummary: true,
  },
  "Investimentos Itaú": {
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 61,
    fixedCredits: 20_202.49,
    fixedDebits: 21_236.67,
    fixedCurrentBalance: 0,
    forceOfficialSummary: true,
  },
  "Investimentos Santander": {
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 15,
    fixedCredits: 5_206.58,
    fixedDebits: 3_112.92,
    fixedCurrentBalance: 0,
    forceOfficialSummary: true,
  },
  Itaú: {
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 2865,
    fixedCredits: 343_717.42,
    fixedDebits: 349_193.48,
    fixedCurrentBalance: 0,
    forceOfficialSummary: true,
  },
  Umbandei: {
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 335,
    fixedCredits: 200_090.68,
    fixedDebits: 205_312.94,
    fixedCurrentBalance: -3_585.24,
    forceOfficialSummary: true,
  },
  Rede: {
    financialClosedAt: "2024-12-31T12:00:00.000Z",
    zeroInitialWhenUnfiltered: true,
    fixedTotalEntries: 1567,
    fixedCredits: 6_482.24,
    fixedDebits: 7_101.95,
    fixedCurrentBalance: 0,
    forceOfficialSummary: true,
  },
};

function isOfficialLedgerAccount(name: string) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_LEDGER_ACCOUNT_META, name) || name === PDV_ACCOUNT_NAME;
}

async function ledgerAccountExists(templeId: string, name: string) {
  if (isOfficialLedgerAccount(name)) {
    return true;
  }

  const [bankAccount, cashRegister, ledgerEntry] = await Promise.all([
    prisma.financialBankAccount.findFirst({
      where: {
        templeId,
        deletedAt: null,
        nome: name,
      },
      select: {
        id: true,
      },
    }),
    prisma.cashRegister.findFirst({
      where: {
        templeId,
        deletedAt: null,
        nome: name,
      },
      select: {
        id: true,
      },
    }),
    prisma.cashLedgerEntry.findFirst({
      where: {
        templeId,
        deletedAt: null,
        accountName: name,
      },
      select: {
        id: true,
      },
    }),
  ]);

  return Boolean(bankAccount || cashRegister || ledgerEntry);
}

async function ensurePdvAccount(templeId: string) {
  const existing = await prisma.financialBankAccount.findFirst({
    where: {
      templeId,
      nome: "PDV",
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return;
  }

  await prisma.financialBankAccount.create({
    data: {
      templeId,
      nome: "PDV",
      banco: "PDV",
      tipo: "PAGAMENTO",
      titular: "Sistema Estrela",
      observacoes: "Conta isolada para movimentações do PDV.",
      ativo: true,
    },
  });
}

function isValidLedgerDate(value: Date | null) {
  return !!value && value >= MIN_LEDGER_DATE && value <= MAX_LEDGER_DATE;
}

function isValidLedgerAmount(value: number | null) {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= MAX_LEDGER_AMOUNT;
}

function normalizeAccountType(accountName: string) {
  const normalized = accountName.toLowerCase();

  if (normalized.includes("invest")) {
    return "INVESTIMENTO" as BankAccountType;
  }

  if (
    normalized.includes("rede") ||
    normalized.includes("getnet") ||
    normalized.includes("umbandei")
  ) {
    return "PAGAMENTO" as BankAccountType;
  }

  return "CORRENTE" as BankAccountType;
}

function extractTransferPart(history: string, label: string) {
  const regex = new RegExp(`${label}:\\s*([^\\-]+?)(?=\\s*-\\s*Conta de|$)`, "i");
  const match = history.match(regex);

  return match?.[1]?.trim() || null;
}

function parseLedgerAccountMeta(value: string | null | undefined): LedgerAccountMeta {
  if (!value) {
    return {};
  }

  const metaSource = value.includes(LEDGER_META_PREFIX)
    ? value.slice(value.indexOf(LEDGER_META_PREFIX) + LEDGER_META_PREFIX.length).trim()
    : value.trim().startsWith("{")
      ? value.trim()
      : "";

  if (!metaSource) {
    return {};
  }

  try {
    const parsed = JSON.parse(metaSource) as LedgerAccountMeta;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function loadFallbackLedgerEntries(accountName: string) {
  const filePath = path.join(process.cwd(), `${accountName}.xls`);

  if (!fs.existsSync(filePath)) {
    return [] as FallbackLedgerEntry[];
  }

  const mtimeMs = fs.statSync(filePath).mtimeMs;
  const cached = fallbackLedgerCache.get(filePath);
  if (cached?.mtimeMs === mtimeMs) return cached.entries;

  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(firstSheet, {
    defval: "",
  });

  const entries = rows.flatMap((row) => {
    const currentAccountName = String(row.Conta || "").trim();
    const entryDate = parseBrazilianDate(String(row.Data || ""));
    const description = String(row["Histórico"] || "").trim();
    const externalId = String(row.Id || "").trim();
    const amount = parseBrazilianAmount(row.Valor);

    if (
      currentAccountName !== accountName ||
      !entryDate ||
      !description ||
      !externalId ||
      !isValidLedgerDate(entryDate) ||
      !isValidLedgerAmount(amount)
    ) {
      return [];
    }

    const lowerDescription = description.toLowerCase();
    const isTransfer = lowerDescription.includes("transferência entre contas");

    return [
      {
        id: `fallback-${accountName}-${externalId}`,
        accountName,
        entryDate,
        category: String(row.Categoria || "").trim() || null,
        description,
        movementType: String(row.Tipo || "").trim() || "S",
        amount: Number(amount),
        externalId,
        contact: String(row.Contato || "").trim() || null,
        document: String(row.CNPJ || "").trim() || null,
        documentNumber: String(row["Nº do documento"] || "").trim() || null,
        sourceFile: `${accountName}.xls`,
        transferFrom: isTransfer ? extractTransferPart(description, "Conta de origem") : null,
        transferTo: isTransfer ? extractTransferPart(description, "Conta de destino") : null,
        isTransfer,
      },
    ];
  });
  fallbackLedgerCache.set(filePath, { mtimeMs, entries });
  return entries;
}

function calculateBalanceFromOrderedEntries(
  entries: Array<{
    movementType: string;
    amount: number;
    entryDate: Date;
    createdAt?: Date;
  }>
) {
  const ordered = [...entries].sort((left, right) => {
    const byDate = left.entryDate.getTime() - right.entryDate.getTime();

    if (byDate !== 0) {
      return byDate;
    }

    return (left.createdAt || left.entryDate).getTime() - (right.createdAt || right.entryDate).getTime();
  });

  let latestSnapshotDate: Date | null = null;
  let latestSnapshotCreatedAt: Date | null = null;
  let latestSnapshotAmount: number | null = null;
  let postSnapshotDelta = 0;
  let runningWithoutSnapshot = 0;

  for (const entry of ordered) {
    if (entry.movementType === "C") {
      runningWithoutSnapshot += entry.amount;

      if (
        latestSnapshotDate &&
        (
          entry.entryDate > latestSnapshotDate ||
          (
            entry.entryDate.getTime() === latestSnapshotDate.getTime() &&
            latestSnapshotCreatedAt &&
            (entry.createdAt || entry.entryDate) > latestSnapshotCreatedAt
          )
        )
      ) {
        postSnapshotDelta += entry.amount;
      }
    } else if (entry.movementType === "D") {
      runningWithoutSnapshot -= entry.amount;

      if (
        latestSnapshotDate &&
        (
          entry.entryDate > latestSnapshotDate ||
          (
            entry.entryDate.getTime() === latestSnapshotDate.getTime() &&
            latestSnapshotCreatedAt &&
            (entry.createdAt || entry.entryDate) > latestSnapshotCreatedAt
          )
        )
      ) {
        postSnapshotDelta -= entry.amount;
      }
    } else if (
      entry.movementType === "S" &&
      (
        !latestSnapshotDate ||
        entry.entryDate > latestSnapshotDate ||
        (
          entry.entryDate.getTime() === latestSnapshotDate.getTime() &&
          latestSnapshotCreatedAt &&
          (entry.createdAt || entry.entryDate) > latestSnapshotCreatedAt
        )
      )
    ) {
      latestSnapshotDate = entry.entryDate;
      latestSnapshotCreatedAt = entry.createdAt || entry.entryDate;
      latestSnapshotAmount = entry.amount;
      postSnapshotDelta = 0;
    }
  }

  if (latestSnapshotAmount !== null) {
    return latestSnapshotAmount + postSnapshotDelta;
  }

  return runningWithoutSnapshot;
}

async function ensureAccountsForTemple(templeId: string, accountNames: string[]) {
  const uniqueNames = [...new Set(accountNames.filter(Boolean))];

  if (uniqueNames.length === 0) {
    return;
  }

  const existingCashRegisters = await prisma.cashRegister.findMany({
    where: {
      templeId,
      deletedAt: null,
      nome: {
        in: uniqueNames,
      },
    },
    select: {
      nome: true,
    },
  });

  const existingBankAccounts = await prisma.financialBankAccount.findMany({
    where: {
      templeId,
      deletedAt: null,
      nome: {
        in: uniqueNames,
      },
    },
    select: {
      nome: true,
    },
  });

  const cashRegisterNames = new Set(existingCashRegisters.map((item) => item.nome));
  const bankAccountNames = new Set(existingBankAccounts.map((item) => item.nome));

  const missingCashRegisters = uniqueNames.filter((name) => name === "Caixa" && !cashRegisterNames.has(name));
  const missingBankAccounts = uniqueNames.filter((name) => name !== "Caixa" && !bankAccountNames.has(name));

  if (missingCashRegisters.length > 0) {
    await prisma.cashRegister.createMany({
      data: missingCashRegisters.map((name) => ({
        templeId,
        nome: name,
        descricao: "Criado automaticamente pela importação de extrato.",
        observacoes: "Conta identificada a partir de planilha .xls importada.",
        ativo: true,
      })),
    });
  }

  if (missingBankAccounts.length > 0) {
    await prisma.financialBankAccount.createMany({
      data: missingBankAccounts.map((name) => ({
        templeId,
        nome: name,
        banco: name,
        tipo: normalizeAccountType(name),
        observacoes: "Conta criada automaticamente pela importação de extrato.",
        ativo: true,
      })),
    });
  }
}

async function resetLedgerModule(templeId: string) {
  await prisma.$transaction([
    prisma.cashLedgerEntry.deleteMany({
      where: {
        templeId,
      },
    }),
    prisma.cashSession.deleteMany({
      where: {
        templeId,
      },
    }),
    prisma.cashRegister.deleteMany({
      where: {
        templeId,
      },
    }),
    prisma.financialBankAccount.deleteMany({
      where: {
        templeId,
      },
    }),
  ]);
}

async function importLedgerFiles(templeId: string, resetAll = false) {
  const rootDir = process.cwd();
  const files = fs
    .readdirSync(rootDir)
    .filter((file) => /\.xls$/i.test(file))
    .sort((left, right) => left.localeCompare(right, "pt-BR"));

  if (files.length === 0) {
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      files: [] as string[],
    };
  }

  if (resetAll) {
    await resetLedgerModule(templeId);
  }

  const parsedRows = files.flatMap((fileName) => {
    const fileBuffer = fs.readFileSync(path.join(rootDir, fileName));
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<SheetRow>(firstSheet, {
      defval: "",
    });

    return rows.map((row, index) => ({
      fileName,
      rowNumber: index + 2,
      row,
    }));
  });

  const accountNames = parsedRows
    .map(({ row }) => String(row.Conta || "").trim())
    .filter(Boolean);

  await ensureAccountsForTemple(templeId, accountNames);

  const dedupedEntries = new Map<string, {
    templeId: string;
    accountName: string;
    entryDate: Date;
    category: string | null;
    description: string;
    movementType: string;
    amount: ReturnType<typeof toDecimal>;
    externalId: string;
    contact: string | null;
    document: string | null;
    tags: string | null;
    documentNumber: string | null;
    sourceFile: string;
    transferFrom: string | null;
    transferTo: string | null;
    isTransfer: boolean;
  }>();
  let skipped = 0;

  for (const item of parsedRows) {
    const accountName = String(item.row.Conta || "").trim();
    const entryDate = parseBrazilianDate(String(item.row.Data || ""));
    const description = String(item.row["Histórico"] || "").trim();
    const externalId = String(item.row.Id || "").trim();
    const amount = parseBrazilianAmount(item.row.Valor);

    if (
      !accountName ||
      !entryDate ||
      !description ||
      !externalId ||
      !isValidLedgerDate(entryDate) ||
      !isValidLedgerAmount(amount)
    ) {
      skipped += 1;
      continue;
    }

    const isTransfer = description.toLowerCase().includes("transferência entre contas");
    const transferFrom = isTransfer
      ? extractTransferPart(description, "Conta de origem")
      : null;
    const transferTo = isTransfer
      ? extractTransferPart(description, "Conta de destino")
      : null;

    const payload = {
      templeId,
      accountName,
      entryDate,
      category: String(item.row.Categoria || "").trim() || null,
      description,
      movementType: String(item.row.Tipo || "").trim() || "S",
      amount: toDecimal(amount),
      externalId,
      contact: String(item.row.Contato || "").trim() || null,
      document: String(item.row.CNPJ || "").trim() || null,
      tags: String(item.row.Marcadores || "").trim() || null,
      documentNumber: String(item.row["Nº do documento"] || "").trim() || null,
      sourceFile: item.fileName,
      transferFrom,
      transferTo,
      isTransfer,
    };

    dedupedEntries.set(`${templeId}:${accountName}:${externalId}`, payload);
  }

  await prisma.cashLedgerEntry.deleteMany({
    where: {
      templeId,
      sourceFile: {
        in: files,
      },
    },
  });

  const entries = [...dedupedEntries.values()];
  const chunkSize = 1000;

  for (let index = 0; index < entries.length; index += chunkSize) {
    await prisma.cashLedgerEntry.createMany({
      data: entries.slice(index, index + chunkSize),
      skipDuplicates: true,
    });
  }

  return {
    imported: entries.length,
    updated: 0,
    skipped,
    files,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    await ensurePdvAccount(user.templeId);
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const account = req.nextUrl.searchParams.get("account")?.trim();
    const startDateParam = req.nextUrl.searchParams.get("startDate")?.trim();
    const endDateParam = req.nextUrl.searchParams.get("endDate")?.trim();
    const movementType = req.nextUrl.searchParams.get("movementType")?.trim();
    const page = Math.max(Number(req.nextUrl.searchParams.get("page") || 1), 1);
    const perPage = Math.min(Math.max(Number(req.nextUrl.searchParams.get("perPage") || 10), 1), 100);
    const skip = (page - 1) * perPage;

    const startDate = startDateParam ? new Date(`${startDateParam}T00:00:00.000Z`) : null;
    const endDate = endDateParam ? new Date(`${endDateParam}T23:59:59.999Z`) : null;
    const accountResetWhere =
      account === PDV_ACCOUNT_NAME
        ? {
            createdAt: {
              gte: PDV_LEDGER_RESET_AT,
            },
          }
        : {};

    const where = {
      templeId: user.templeId,
      deletedAt: null,
      entryDate: {
        gte: startDate && !Number.isNaN(startDate.getTime()) ? startDate : MIN_LEDGER_DATE,
        lte: endDate && !Number.isNaN(endDate.getTime()) ? endDate : MAX_LEDGER_DATE,
      },
      amount: {
        gte: -MAX_LEDGER_AMOUNT,
        lte: MAX_LEDGER_AMOUNT,
      },
      ...(movementType
        ? {
            movementType,
          }
        : {}),
      ...(account
        ? {
            accountName: account,
            ...accountResetWhere,
          }
        : {}),
      ...(q
        ? {
            OR: [
              { accountName: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
              { contact: { contains: q, mode: "insensitive" as const } },
              { sourceFile: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    } as const;

    const forceOfficialSummary = Boolean(account && DEFAULT_LEDGER_ACCOUNT_META[account]?.forceOfficialSummary);
    const systemWhere = forceOfficialSummary && account
      ? {
          templeId: user.templeId,
          deletedAt: null,
          accountName: account,
          sourceFile: {
            in: ["sistema-estrela", "TRANSFERENCIA_MANUAL"],
          },
          entryDate: {
            gte: startDate && !Number.isNaN(startDate.getTime()) ? startDate : MIN_LEDGER_DATE,
            lte: endDate && !Number.isNaN(endDate.getTime()) ? endDate : MAX_LEDGER_DATE,
          },
          amount: {
            gte: -MAX_LEDGER_AMOUNT,
            lte: MAX_LEDGER_AMOUNT,
          },
          ...(movementType ? { movementType } : {}),
          ...(q
            ? {
                OR: [
                  { accountName: { contains: q, mode: "insensitive" as const } },
                  { description: { contains: q, mode: "insensitive" as const } },
                  { category: { contains: q, mode: "insensitive" as const } },
                  { contact: { contains: q, mode: "insensitive" as const } },
                  { sourceFile: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {}),
        }
      : null;

    const [
      entries,
      total,
      rawSummary,
      accountSummary,
      bankAccountRecord,
      cashRegisterRecord,
      allBankAccounts,
      allCashRegisters,
      allTimeCreditsAgg,
      allTimeDebitsAgg,
      allTimeCount,
      systemEntries,
      systemCreditsAgg,
      systemDebitsAgg,
      systemCount,
    ] = await Promise.all([
      prisma.cashLedgerEntry.findMany({
        where,
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: perPage,
      }),
      prisma.cashLedgerEntry.count({ where }),
      prisma.cashLedgerEntry.findMany({
        where,
        select: {
          accountName: true,
          movementType: true,
          amount: true,
          sourceFile: true,
          entryDate: true,
          createdAt: true,
        },
      }),
      prisma.cashLedgerEntry.groupBy({
        by: ["accountName"],
        where: {
          templeId: user.templeId,
          deletedAt: null,
          entryDate: {
            gte: startDate && !Number.isNaN(startDate.getTime()) ? startDate : MIN_LEDGER_DATE,
            lte: endDate && !Number.isNaN(endDate.getTime()) ? endDate : MAX_LEDGER_DATE,
          },
          amount: {
            gte: -MAX_LEDGER_AMOUNT,
            lte: MAX_LEDGER_AMOUNT,
          },
          ...(movementType
            ? {
                movementType,
              }
            : {}),
          ...(account
            ? {
                accountName: account,
                ...accountResetWhere,
              }
            : {}),
        },
        _count: {
          _all: true,
        },
      }),
      account
        ? prisma.financialBankAccount.findFirst({
            where: {
              templeId: user.templeId,
              nome: account,
              deletedAt: null,
            },
            select: {
              observacoes: true,
            },
          })
        : Promise.resolve(null),
      account
        ? prisma.cashRegister.findFirst({
            where: {
              templeId: user.templeId,
              nome: account,
              deletedAt: null,
            },
            select: {
              observacoes: true,
            },
          })
        : Promise.resolve(null),
      prisma.financialBankAccount.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
        },
        select: {
          nome: true,
        },
        orderBy: {
          nome: "asc",
        },
      }),
      prisma.cashRegister.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
        },
        select: {
          nome: true,
        },
        orderBy: {
          nome: "asc",
        },
      }),
      account
        ? prisma.cashLedgerEntry.aggregate({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              ...accountResetWhere,
              movementType: "C",
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),
      account
        ? prisma.cashLedgerEntry.aggregate({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              ...accountResetWhere,
              movementType: "D",
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),
      account
        ? prisma.cashLedgerEntry.count({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              ...accountResetWhere,
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
          })
        : Promise.resolve(null),
      systemWhere
        ? prisma.cashLedgerEntry.findMany({
            where: systemWhere,
            orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
      forceOfficialSummary && account
        ? prisma.cashLedgerEntry.aggregate({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              sourceFile: {
                in: ["sistema-estrela", "TRANSFERENCIA_MANUAL"],
              },
              movementType: "C",
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),
      forceOfficialSummary && account
        ? prisma.cashLedgerEntry.aggregate({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              sourceFile: {
                in: ["sistema-estrela", "TRANSFERENCIA_MANUAL"],
              },
              movementType: "D",
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),
      forceOfficialSummary && account
        ? prisma.cashLedgerEntry.count({
            where: {
              templeId: user.templeId,
              deletedAt: null,
              accountName: account,
              sourceFile: {
                in: ["sistema-estrela", "TRANSFERENCIA_MANUAL"],
              },
              entryDate: {
                gte: MIN_LEDGER_DATE,
                lte: MAX_LEDGER_DATE,
              },
              amount: {
                gte: -MAX_LEDGER_AMOUNT,
                lte: MAX_LEDGER_AMOUNT,
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const hasPersistedEntries = Number(allTimeCount || 0) > 0;
    const fallbackEntries =
      account && (forceOfficialSummary || !hasPersistedEntries) ? loadFallbackLedgerEntries(account) : [];
    const filteredFallbackEntries = fallbackEntries
      .filter((entry) => {
        if (movementType && entry.movementType !== movementType) {
          return false;
        }

        if (startDate && entry.entryDate < startDate) {
          return false;
        }

        if (endDate && entry.entryDate > endDate) {
          return false;
        }

        if (q) {
          const searchTarget = [
            entry.accountName,
            entry.description,
            entry.category || "",
            entry.contact || "",
            entry.sourceFile,
          ]
            .join(" ")
            .toLowerCase();

          if (!searchTarget.includes(q.toLowerCase())) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => {
        const byDate = right.entryDate.getTime() - left.entryDate.getTime();

        if (byDate !== 0) {
          return byDate;
        }

        return right.externalId.localeCompare(left.externalId, "pt-BR");
      });
    const allAccountRows = !account
      ? await (async () => {
          const fallback = Object.keys(DEFAULT_LEDGER_ACCOUNT_META)
            .flatMap((name) => loadFallbackLedgerEntries(name))
            .filter((entry) => {
              if (movementType && entry.movementType !== movementType) return false;
              if (startDate && entry.entryDate < startDate) return false;
              if (endDate && entry.entryDate > endDate) return false;
              if (!q) return true;
              return [entry.accountName, entry.description, entry.category, entry.contact, entry.sourceFile]
                .some((value) => value?.toLowerCase().includes(q.toLowerCase()));
            });
          if (fallback.length === 0) return null;

          const persisted = await prisma.cashLedgerEntry.findMany({ where });
          const fallbackKeys = new Set(fallback.map((entry) => `${entry.accountName}:${entry.externalId}`));
          return [...fallback, ...persisted.filter((entry) =>
            !entry.externalId || !fallbackKeys.has(`${entry.accountName}:${entry.externalId}`)
          )].sort((left, right) => {
            const byDate = new Date(right.entryDate).getTime() - new Date(left.entryDate).getTime();
            return byDate || String(right.id).localeCompare(String(left.id), "pt-BR");
          });
        })()
      : null;
    const allTimeFallbackBalance =
      account && !hasPersistedEntries ? calculateBalanceFromOrderedEntries(fallbackEntries) : 0;

    const summaryEntries =
      rawSummary.length > 0 || !account
        ? rawSummary
        : filteredFallbackEntries.map((entry) => ({
            accountName: entry.accountName,
            movementType: entry.movementType,
            amount: entry.amount,
            sourceFile: entry.sourceFile,
            entryDate: entry.entryDate,
            createdAt: entry.entryDate,
          }));

    const orderedSummaryEntries = [...summaryEntries].sort((left, right) => {
      const byDate = left.entryDate.getTime() - right.entryDate.getTime();

      if (byDate !== 0) {
        return byDate;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });

    const summary = orderedSummaryEntries.reduce(
      (acc, entry) => {
        const amount = Number(entry.amount || 0);
        const currentBalance = acc.balances.get(entry.accountName) || {
          latestSnapshotDate: null as Date | null,
          latestSnapshotCreatedAt: null as Date | null,
          latestSnapshotAmount: null as number | null,
          postSnapshotDelta: 0,
          runningWithoutSnapshot: 0,
        };

        if (entry.movementType === "C") {
          acc.credits += amount;
          currentBalance.runningWithoutSnapshot += amount;

          if (currentBalance.latestSnapshotDate) {
            const happenedAfterSnapshot =
              entry.entryDate > currentBalance.latestSnapshotDate ||
              (
                entry.entryDate.getTime() === currentBalance.latestSnapshotDate.getTime() &&
                currentBalance.latestSnapshotCreatedAt &&
                entry.createdAt > currentBalance.latestSnapshotCreatedAt
              );

            if (happenedAfterSnapshot) {
              currentBalance.postSnapshotDelta += amount;
            }
          }
        } else if (entry.movementType === "D") {
          acc.debits += amount;
          currentBalance.runningWithoutSnapshot -= amount;

          if (currentBalance.latestSnapshotDate) {
            const happenedAfterSnapshot =
              entry.entryDate > currentBalance.latestSnapshotDate ||
              (
                entry.entryDate.getTime() === currentBalance.latestSnapshotDate.getTime() &&
                currentBalance.latestSnapshotCreatedAt &&
                entry.createdAt > currentBalance.latestSnapshotCreatedAt
              );

            if (happenedAfterSnapshot) {
              currentBalance.postSnapshotDelta -= amount;
            }
          }
        } else if (
          entry.movementType === "S" &&
          (
            !currentBalance.latestSnapshotDate ||
            entry.entryDate > currentBalance.latestSnapshotDate ||
            (
              entry.entryDate.getTime() === currentBalance.latestSnapshotDate.getTime() &&
              currentBalance.latestSnapshotCreatedAt &&
              entry.createdAt > currentBalance.latestSnapshotCreatedAt
            )
          )
        ) {
          currentBalance.latestSnapshotDate = entry.entryDate;
          currentBalance.latestSnapshotCreatedAt = entry.createdAt;
          currentBalance.latestSnapshotAmount = amount;
          currentBalance.postSnapshotDelta = 0;
        }

        acc.accounts.add(entry.accountName);
        acc.files.add(entry.sourceFile);
        acc.balances.set(entry.accountName, currentBalance);
        return acc;
      },
      {
        credits: 0,
        debits: 0,
        accounts: new Set<string>(),
        files: new Set<string>(),
        balances: new Map<
          string,
          {
            latestSnapshotCreatedAt: Date | null;
            latestSnapshotDate: Date | null;
            latestSnapshotAmount: number | null;
            postSnapshotDelta: number;
            runningWithoutSnapshot: number;
          }
        >(),
      }
    );

    const calculatedFilteredBalance = [...summary.balances.values()].reduce((sum, balance) => {
      if (balance.latestSnapshotAmount !== null) {
        return sum + balance.latestSnapshotAmount + balance.postSnapshotDelta;
      }

      return sum + balance.runningWithoutSnapshot;
    }, 0);
    const defaultAccountMeta = account ? DEFAULT_LEDGER_ACCOUNT_META[account] || {} : {};
    const accountMeta = {
      ...defaultAccountMeta,
      ...parseLedgerAccountMeta(bankAccountRecord?.observacoes || cashRegisterRecord?.observacoes),
    };
    const openingAdjustment = Number(accountMeta.openingAdjustment || 0);
    const allTimeCredits = Number(allTimeCreditsAgg?._sum.amount || 0);
    const allTimeDebits = Number(allTimeDebitsAgg?._sum.amount || 0);
    const systemCredits = Number(systemCreditsAgg?._sum.amount || 0);
    const systemDebits = Number(systemDebitsAgg?._sum.amount || 0);
    const forceOfficialSummaryResolved = Boolean(account && defaultAccountMeta.forceOfficialSummary);
    const effectiveCredits =
      account &&
      (forceOfficialSummaryResolved || !hasPersistedEntries) &&
      typeof defaultAccountMeta.fixedCredits === "number"
        ? defaultAccountMeta.fixedCredits + (forceOfficialSummaryResolved ? systemCredits : 0)
        : summary.credits;
    const effectiveDebits =
      account &&
      (forceOfficialSummaryResolved || !hasPersistedEntries) &&
      typeof defaultAccountMeta.fixedDebits === "number"
        ? defaultAccountMeta.fixedDebits + (forceOfficialSummaryResolved ? systemDebits : 0)
        : summary.debits;
    const currentBalance = account
      ? (forceOfficialSummaryResolved || !hasPersistedEntries) && typeof defaultAccountMeta.fixedCurrentBalance === "number"
        ? defaultAccountMeta.fixedCurrentBalance + (forceOfficialSummaryResolved ? systemCredits - systemDebits : 0)
        : !hasPersistedEntries
          ? allTimeFallbackBalance
          : openingAdjustment + allTimeCredits - allTimeDebits
      : calculatedFilteredBalance;
    const usingDateFilter = Boolean(startDateParam || endDateParam);
    const initialBalance = account
      ? usingDateFilter
        ? currentBalance - effectiveCredits + effectiveDebits
        : accountMeta.zeroInitialWhenUnfiltered
          ? 0
          : openingAdjustment
      : null;
    const closingDate = accountMeta.financialClosedAt || null;
    const mergedOfficialRows =
      forceOfficialSummaryResolved && account
        ? [...filteredFallbackEntries, ...(systemEntries as typeof entries)].sort((left, right) => {
            const byDate = new Date(right.entryDate).getTime() - new Date(left.entryDate).getTime();

            if (byDate !== 0) {
              return byDate;
            }

            return String(right.id).localeCompare(String(left.id), "pt-BR");
          })
        : [];
    const effectiveRows = allAccountRows
      ? allAccountRows.slice(skip, skip + perPage)
      : forceOfficialSummaryResolved && account
        ? mergedOfficialRows.slice(skip, skip + perPage)
        : entries.length > 0 || !account
        ? entries
        : filteredFallbackEntries.slice(skip, skip + perPage);
    const effectiveTotal = allAccountRows
      ? allAccountRows.length
      : forceOfficialSummaryResolved && account
        ? mergedOfficialRows.length
        : total > 0 || !account
          ? total
          : filteredFallbackEntries.length;

    const discoveredAccountNames = new Set<string>([
      ...Object.keys(DEFAULT_LEDGER_ACCOUNT_META),
      ...allBankAccounts.map((item) => item.nome),
      ...allCashRegisters.map((item) => item.nome),
    ]);

    const serializedAccounts = [
      ...accountSummary.map((item) => ({
        name: item.accountName,
        totalEntries: item._count._all,
      })),
      ...[...discoveredAccountNames]
        .filter((name) => !accountSummary.some((item) => item.accountName === name))
        .map((name) => ({
          name,
          totalEntries:
            typeof DEFAULT_LEDGER_ACCOUNT_META[name]?.fixedTotalEntries === "number"
              ? Number(DEFAULT_LEDGER_ACCOUNT_META[name].fixedTotalEntries)
              : 0,
        })),
    ]
      .filter((item) => item.name !== LEGACY_PDV_ACCOUNT_NAME)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    return ApiResponse.success(
      serialize({
        data: effectiveRows,
        summary: {
          totalEntries:
            account
              ? (forceOfficialSummaryResolved || !hasPersistedEntries) && typeof defaultAccountMeta.fixedTotalEntries === "number"
                ? defaultAccountMeta.fixedTotalEntries + (forceOfficialSummaryResolved ? Number(systemCount || 0) : 0)
                : !hasPersistedEntries
                  ? filteredFallbackEntries.length
                  : Number(allTimeCount ?? rawSummary.length)
              : allAccountRows?.length ?? rawSummary.length,
          totalAccounts: summary.accounts.size,
          totalFiles: summary.files.size,
          credits: effectiveCredits,
          debits: effectiveDebits,
          currentBalance,
          initialBalance,
          closingDate,
        },
        accounts: serializedAccounts,
        pagination: {
          page,
          perPage,
          total: effectiveTotal,
          pages: Math.max(Math.ceil(effectiveTotal / perPage), 1),
        },
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const result = await importLedgerFiles(
      user.templeId,
      body?.resetAll !== false
    );

    return ApiResponse.success(result);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const accountName = String(body.accountName || "").trim();
    const targetBalance = Number(body.targetBalance);
    const currentBalance = Number(body.currentBalance);
    const notes = String(body.notes || "").trim();

    if (!accountName) {
      return ApiResponse.error("Selecione a conta que terá o saldo ajustado.");
    }

    if (!Number.isFinite(targetBalance)) {
      return ApiResponse.error("Informe um saldo válido.");
    }

    if (!Number.isFinite(currentBalance)) {
      return ApiResponse.error("Não foi possível identificar o saldo atual da conta.");
    }

    const exists = await ledgerAccountExists(user.templeId, accountName);

    if (!exists) {
      return ApiResponse.error("Conta não encontrada no Caixa e Bancos.");
    }

    const delta = Number((targetBalance - currentBalance).toFixed(2));

    if (delta === 0) {
      return ApiResponse.success({
        success: true,
        changed: false,
        message: "O saldo informado já é o saldo atual.",
      });
    }

    const entryDate = new Date();
    const previousBalanceLabel = currentBalance.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const targetBalanceLabel = targetBalance.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const description = [
      `Ajuste manual de saldo - ${accountName}`,
      `saldo anterior: ${previousBalanceLabel}`,
      `novo saldo: ${targetBalanceLabel}`,
      notes ? `observação: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" - ");

    const entry = await prisma.cashLedgerEntry.create({
      data: {
        templeId: user.templeId,
        accountName,
        entryDate,
        category: "Ajuste manual de saldo",
        description,
        movementType: delta > 0 ? "C" : "D",
        amount: toDecimal(Math.abs(delta)),
        externalId: `saldo-manual:${randomUUID()}`,
        sourceFile: "sistema-estrela",
        isTransfer: false,
      },
      select: {
        id: true,
      },
    });

    return ApiResponse.success({
      success: true,
      changed: true,
      id: entry.id,
      accountName,
      previousBalance: currentBalance,
      targetBalance,
      adjustment: delta,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
