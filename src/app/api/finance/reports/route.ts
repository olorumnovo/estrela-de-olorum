import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { requirePermission } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

const ledgerFiles = ["Caixa", "GetNet", "Investimentos Itaú", "Investimentos Santander", "Itaú", "Rede", "Santander", "Umbandei"];
const ledgerKinds = new Set(["balancete", "categoria", "cliente"]);
const kinds = new Set([...ledgerKinds, "dre", "fluxo", "pagar", "receber", "recebimentos"]);

type ReportRow = Record<string, string | number>;
type Column = { key: string; label: string; money?: boolean };
type LedgerRow = {
  id: string;
  accountName: string;
  entryDate: Date;
  category: string;
  description: string;
  movementType: string;
  amount: number;
  externalId: string | null;
  contact: string;
  sourceFile: string;
  isTransfer: boolean;
};

const ledgerCache = new Map<string, { mtime: number; rows: LedgerRow[] }>();

function legacyLedger(account: string): LedgerRow[] {
  const file = path.join(process.cwd(), `${account}.xls`);
  if (!fs.existsSync(file)) return [];
  const mtime = fs.statSync(file).mtimeMs;
  const cached = ledgerCache.get(file);
  if (cached?.mtime === mtime) return cached.rows;
  const workbook = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows = raw.flatMap((item): LedgerRow[] => {
    const dateParts = String(item.Data || "").split("/");
    const date = dateParts.length === 3 ? new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T12:00:00`) : new Date(NaN);
    const amount = Number(String(item.Valor || "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    const externalId = String(item.Id || "").trim();
    if (String(item.Conta || "").trim() !== account || !externalId || !Number.isFinite(date.getTime()) || !Number.isFinite(amount) || date.getFullYear() < 2020 || date.getFullYear() > 2030 || Math.abs(amount) > 1_000_000) return [];
    const description = String(item["Histórico"] || "").trim();
    return [{
      id: `legacy-${account}-${externalId}`,
      accountName: account,
      entryDate: date,
      category: String(item.Categoria || "").trim(),
      description,
      movementType: String(item.Tipo || "").trim(),
      amount,
      externalId,
      contact: String(item.Contato || "").trim(),
      sourceFile: `${account}.xls`,
      isTransfer: description.toLowerCase().includes("transferência entre contas"),
    }];
  });
  ledgerCache.set(file, { mtime, rows });
  return rows;
}

function dateText(date: Date | null) {
  return date ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date) : "—";
}

function aggregate(rows: LedgerRow[], key: (row: LedgerRow) => string, keyName: string): ReportRow[] {
  const groups = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const name = key(row) || "Não informado";
    const group = groups.get(name) || { income: 0, expense: 0 };
    if (row.movementType === "C") group.income += row.amount;
    if (row.movementType === "D") group.expense += row.amount;
    groups.set(name, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([name, value]) => ({
    [keyName]: name,
    entradas: Number(value.income.toFixed(2)),
    saidas: Number(value.expense.toFixed(2)),
    resultado: Number((value.income - value.expense).toFixed(2)),
  }));
}

const groupedColumns = (label: string, key: string): Column[] => [
  { key, label },
  { key: "entradas", label: "Entradas", money: true },
  { key: "saidas", label: "Saídas", money: true },
  { key: "resultado", label: "Resultado", money: true },
];

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission(req, "financeiro.visualizar");
    if (req.nextUrl.searchParams.get("options") === "true") {
      const [banks, registers, categories, ledgerNames, ledgerCategories] = await Promise.all([
        prisma.financialBankAccount.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { nome: true } }),
        prisma.cashRegister.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { nome: true } }),
        prisma.financialCategory.findMany({ where: { templeId: user.templeId, deletedAt: null }, select: { nome: true } }),
        prisma.cashLedgerEntry.findMany({ where: { templeId: user.templeId, deletedAt: null }, distinct: ["accountName"], select: { accountName: true } }),
        prisma.cashLedgerEntry.findMany({ where: { templeId: user.templeId, deletedAt: null }, distinct: ["category"], select: { category: true } }),
      ]);
      return ApiResponse.success({
        accounts: [...new Set([...ledgerFiles, ...banks.map((item) => item.nome), ...registers.map((item) => item.nome), ...ledgerNames.map((item) => item.accountName)])].sort((a, b) => a.localeCompare(b, "pt-BR")),
        categories: [...new Set([...categories.map((item) => item.nome), ...ledgerCategories.map((item) => item.category).filter((item): item is string => Boolean(item))])].sort((a, b) => a.localeCompare(b, "pt-BR")),
      });
    }

    const params = req.nextUrl.searchParams;
    const kind = params.get("kind") || "balancete";
    const startText = params.get("startDate") || "";
    const endText = params.get("endDate") || "";
    if (!kinds.has(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(startText) || !/^\d{4}-\d{2}-\d{2}$/.test(endText)) {
      return ApiResponse.error("Tipo de relatório ou período inválido.");
    }
    const start = new Date(`${startText}T00:00:00.000Z`);
    const end = new Date(`${endText}T23:59:59.999Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return ApiResponse.error("Período inválido.");
    const account = params.get("account") || "";
    const category = params.get("category") || "";
    const includeTransfers = params.get("includeTransfers") === "true";

    let columns: Column[] = [];
    let rows: ReportRow[] = [];

    if (ledgerKinds.has(kind)) {
      const stored = await prisma.cashLedgerEntry.findMany({
        where: { templeId: user.templeId, deletedAt: null, entryDate: { gte: start, lte: end }, ...(account ? { accountName: account } : {}) },
        select: { id: true, accountName: true, entryDate: true, category: true, description: true, movementType: true, amount: true, externalId: true, contact: true, sourceFile: true, isTransfer: true },
      });
      const legacy = (account ? [account] : ledgerFiles).flatMap(legacyLedger).filter((item) => item.entryDate >= start && item.entryDate <= end);
      const legacyKeys = new Set(legacy.map((item) => `${item.accountName}:${item.externalId}`));
      const all: LedgerRow[] = [...legacy, ...stored.filter((item) => !item.externalId || !legacyKeys.has(`${item.accountName}:${item.externalId}`)).map((item) => ({
        ...item, category: item.category || "", contact: item.contact || "", amount: Number(item.amount),
      }))].filter((item) =>
        (item.movementType === "C" || item.movementType === "D") &&
        (includeTransfers || !item.isTransfer) &&
        (!category || item.category === category)
      );
      if (kind === "categoria") {
        columns = groupedColumns("Categoria", "categoria");
        rows = aggregate(all, (item) => item.category, "categoria");
      } else if (kind === "cliente") {
        columns = groupedColumns("Cliente", "cliente");
        rows = aggregate(all, (item) => item.contact, "cliente");
      } else {
        columns = [
          { key: "data", label: "Data" }, { key: "conta", label: "Conta" },
          { key: "categoria", label: "Categoria" }, { key: "cliente", label: "Cliente" },
          { key: "historico", label: "Histórico" },
          { key: "entradas", label: "Entradas", money: true }, { key: "saidas", label: "Saídas", money: true },
        ];
        rows = all.sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime()).map((item) => ({
          data: dateText(item.entryDate), conta: item.accountName, categoria: item.category || "—", cliente: item.contact || "—",
          historico: item.description, entradas: item.movementType === "C" ? item.amount : 0,
          saidas: item.movementType === "D" ? item.amount : 0,
        }));
      }
    } else {
      const tipo = kind === "pagar" ? "EXPENSE" : kind === "receber" || kind === "recebimentos" ? "INCOME" : null;
      const transactions = await prisma.financialTransaction.findMany({
        where: {
          templeId: user.templeId, deletedAt: null,
          ...(tipo ? { tipo } : {}),
          ...(category ? { category: { nome: category } } : {}),
          ...(kind === "fluxo" ? { status: { in: ["PENDING" as const, "OVERDUE" as const] }, vencimento: { gte: start, lte: end } }
            : kind === "pagar" || kind === "receber" ? { vencimento: { gte: start, lte: end } }
            : { OR: [{ status: "PAID" as const }, { amountPaid: { gt: 0 } }], pagamentoEm: { gte: start, lte: end } }),
        },
        include: { category: { select: { nome: true } } },
        orderBy: [{ vencimento: "asc" }, { id: "asc" }],
      });
      if (kind === "dre") {
        const totals = new Map<string, { entradas: number; saidas: number }>();
        for (const item of transactions) {
          const name = item.category.nome;
          const current = totals.get(name) || { entradas: 0, saidas: 0 };
          const amount = Number(item.amountPaid || item.valor);
          if (item.tipo === "INCOME") current.entradas += amount;
          else current.saidas += amount;
          totals.set(name, current);
        }
        columns = groupedColumns("Categoria", "categoria");
        rows = [...totals].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([name, value]) => ({
          categoria: name, entradas: value.entradas, saidas: value.saidas, resultado: value.entradas - value.saidas,
        }));
      } else if (kind === "fluxo") {
        columns = [
          { key: "data", label: "Vencimento" }, { key: "tipo", label: "Tipo" }, { key: "pessoa", label: "Cliente/Fornecedor" },
          { key: "historico", label: "Histórico" }, { key: "categoria", label: "Categoria" },
          { key: "entradas", label: "Entrada prevista", money: true }, { key: "saidas", label: "Saída prevista", money: true },
        ];
        rows = transactions.map((item) => {
          const remaining = Math.max(Number(item.valor) - Number(item.amountPaid || 0), 0);
          return { data: dateText(item.vencimento), tipo: item.tipo === "INCOME" ? "Receber" : "Pagar", pessoa: item.centroCusto || "—",
            historico: item.descricao, categoria: item.category.nome, entradas: item.tipo === "INCOME" ? remaining : 0, saidas: item.tipo === "EXPENSE" ? remaining : 0 };
        });
      } else {
        const received = kind === "recebimentos";
        columns = [
          { key: "data", label: received ? "Recebimento" : "Vencimento" },
          { key: "pessoa", label: kind === "pagar" ? "Fornecedor" : "Cliente" },
          { key: "historico", label: "Histórico" }, { key: "categoria", label: "Categoria" },
          { key: "valor", label: "Valor", money: true },
          { key: "pago", label: kind === "pagar" ? "Pago" : "Recebido", money: true },
          { key: "saldo", label: "Saldo", money: true }, { key: "status", label: "Status" },
        ];
        rows = transactions.map((item) => {
          const paid = Number(item.amountPaid || (item.status === "PAID" ? item.valor : 0));
          return {
            data: dateText(received ? item.pagamentoEm : item.vencimento), pessoa: item.centroCusto || "—", historico: item.descricao,
            categoria: item.category.nome, valor: Number(item.valor), pago: paid,
            saldo: Math.max(Number(item.valor) - paid, 0), status: item.rawStatus || item.status,
          };
        });
      }
    }

    const total = (key: string) => Number(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0).toFixed(2));
    const income = total("entradas");
    const expense = total("saidas");
    return ApiResponse.success({ columns, rows, summary: { count: rows.length, income, expense, result: Number((income - expense).toFixed(2)) }, period: { start: startText, end: endText } });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
