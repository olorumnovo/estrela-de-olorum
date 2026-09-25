import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { toDecimal } from "@/modules/shared";

const OFFICIAL_LEDGER_ACCOUNTS = new Set([
  "Santander",
  "Caixa",
  "GetNet",
  "Investimentos Itaú",
  "Investimentos Santander",
  "Itaú",
  "Umbandei",
  "Rede",
  "PDV",
]);

async function accountExists(templeId: string, name: string) {
  if (OFFICIAL_LEDGER_ACCOUNTS.has(name)) {
    return true;
  }

  const [bankAccount, cashRegister, ledgerAccount] = await Promise.all([
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

  return Boolean(bankAccount || cashRegister || ledgerAccount);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    const fromAccount = String(body.fromAccount || "").trim();
    const toAccount = String(body.toAccount || "").trim();
    const amount = Number(body.amount || 0);
    const description = String(body.description || "").trim();
    const transferDate = body.transferDate ? new Date(String(body.transferDate)) : new Date();

    if (!fromAccount || !toAccount) {
      return ApiResponse.error("Selecione a conta de origem e a conta de destino.");
    }

    if (fromAccount === toAccount) {
      return ApiResponse.error("A conta de origem deve ser diferente da conta de destino.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return ApiResponse.error("Informe um valor de transferência válido.");
    }

    if (Number.isNaN(transferDate.getTime())) {
      return ApiResponse.error("Informe uma data de transferência válida.");
    }

    const [fromExists, toExists] = await Promise.all([
      accountExists(user.templeId, fromAccount),
      accountExists(user.templeId, toAccount),
    ]);

    if (!fromExists || !toExists) {
      return ApiResponse.error("Uma das contas selecionadas não está cadastrada.");
    }

    const transferId = randomUUID();
    const narrative = description
      ? `Transferência manual entre contas - ${description}`
      : "Transferência manual entre contas";

    await prisma.cashLedgerEntry.createMany({
      data: [
        {
          templeId: user.templeId,
          accountName: fromAccount,
          entryDate: transferDate,
          category: "Transferência entre contas",
          description: `${narrative} - Conta de origem: ${fromAccount} - Conta de destino: ${toAccount}`,
          movementType: "D",
          amount: toDecimal(amount),
          externalId: `${transferId}:debit`,
          sourceFile: "TRANSFERENCIA_MANUAL",
          transferFrom: fromAccount,
          transferTo: toAccount,
          isTransfer: true,
        },
        {
          templeId: user.templeId,
          accountName: toAccount,
          entryDate: transferDate,
          category: "Transferência entre contas",
          description: `${narrative} - Conta de origem: ${fromAccount} - Conta de destino: ${toAccount}`,
          movementType: "C",
          amount: toDecimal(amount),
          externalId: `${transferId}:credit`,
          sourceFile: "TRANSFERENCIA_MANUAL",
          transferFrom: fromAccount,
          transferTo: toAccount,
          isTransfer: true,
        },
      ],
    });

    return ApiResponse.created({
      success: true,
      transferId,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
