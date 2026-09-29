import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

const SETTING_KEY = "cash_ledger_archived_accounts";

function readArchived(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((name): name is string => typeof name === "string" && name.length > 0 && name.length <= 120))];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const setting = await prisma.setting.findUnique({
      where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
      select: { valor: true },
    });
    return ApiResponse.success({ archived: readArchived(setting?.valor) });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    const archived = body.archived;
    if (!accountName || accountName.length > 120 || typeof archived !== "boolean") {
      return ApiResponse.error("Informe a conta e a ação de arquivar ou restaurar.");
    }

    if (archived) {
      const exists = await Promise.all([
        prisma.financialBankAccount.findFirst({ where: { templeId: user.templeId, nome: accountName, deletedAt: null }, select: { id: true } }),
        prisma.cashRegister.findFirst({ where: { templeId: user.templeId, nome: accountName, deletedAt: null }, select: { id: true } }),
        prisma.cashLedgerEntry.findFirst({ where: { templeId: user.templeId, accountName, deletedAt: null }, select: { id: true } }),
      ]);
      if (!exists.some(Boolean)) return ApiResponse.notFound("Conta ou caixa não encontrado.");
    }

    const next = await prisma.$transaction(async (tx) => {
      const setting = await tx.setting.findUnique({
        where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
        select: { valor: true },
      });
      const names = new Set(readArchived(setting?.valor));
      if (!archived && !names.has(accountName)) return [...names];
      if (archived) names.add(accountName);
      else names.delete(accountName);
      await tx.setting.upsert({
        where: { templeId_chave: { templeId: user.templeId, chave: SETTING_KEY } },
        update: { valor: JSON.stringify([...names]) },
        create: { templeId: user.templeId, chave: SETTING_KEY, valor: JSON.stringify([...names]) },
      });
      return [...names];
    });
    return ApiResponse.success({ archived: next });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
