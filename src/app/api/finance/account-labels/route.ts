import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

const SETTING_KEY = "cash_ledger_account_labels";

function readLabels(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, label]) =>
        key.length > 0 && key.length <= 120 && !["__proto__", "prototype", "constructor"].includes(key) && typeof label === "string" && label.length > 0 && label.length <= 120
      )
    );
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const setting = await prisma.setting.findUnique({
      where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
      select: { valor: true },
    });
    return ApiResponse.success(readLabels(setting?.valor));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!accountName || accountName.length > 120 || ["__proto__", "prototype", "constructor"].includes(accountName) || label.length > 120) {
      return ApiResponse.error("Informe uma conta e um nome de até 120 caracteres.");
    }

    const exists = await Promise.all([
      prisma.financialBankAccount.findFirst({ where: { templeId: user.templeId, nome: accountName, deletedAt: null }, select: { id: true } }),
      prisma.cashRegister.findFirst({ where: { templeId: user.templeId, nome: accountName, deletedAt: null }, select: { id: true } }),
      prisma.cashLedgerEntry.findFirst({ where: { templeId: user.templeId, accountName, deletedAt: null }, select: { id: true } }),
    ]);
    if (!exists.some(Boolean)) return ApiResponse.notFound("Conta ou caixa não encontrado.");

    const labels = await prisma.$transaction(async (tx) => {
      const setting = await tx.setting.findUnique({
        where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
        select: { valor: true },
      });
      const updated = readLabels(setting?.valor);
      if (!label || label === accountName) delete updated[accountName];
      else updated[accountName] = label;
      await tx.setting.upsert({
        where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
        update: { valor: JSON.stringify(updated) },
        create: { templeId: user.templeId, chave: SETTING_KEY, valor: JSON.stringify(updated) },
      });
      return updated;
    });
    return ApiResponse.success(labels);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
