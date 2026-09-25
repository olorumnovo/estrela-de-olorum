import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDecimal } from "@/modules/shared";

const PDV_CASH_REGISTER_NAME = "PDV";

async function ensurePdvCashRegister(templeId: string) {
  return prisma.cashRegister.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: PDV_CASH_REGISTER_NAME,
      },
    },
    update: {
      descricao: "Conta principal do PDV",
      observacoes: "Conta isolada para operações do PDV.",
      ativo: true,
      deletedAt: null,
    },
    create: {
      templeId,
      nome: PDV_CASH_REGISTER_NAME,
      descricao: "Conta principal do PDV",
      observacoes: "Conta isolada para operações do PDV.",
      ativo: true,
    },
  });
}

async function getPdvCashState(templeId: string) {
  const register = await ensurePdvCashRegister(templeId);
  const activeSession = await prisma.cashSession.findFirst({
    where: {
      templeId,
      cashRegisterId: register.id,
      closedAt: null,
    },
    orderBy: {
      openedAt: "desc",
    },
  });

  return {
    register: {
      ...register,
      aberto: Boolean(activeSession),
      aberturaEm: activeSession?.openedAt ?? null,
      saldoAbertura: activeSession?.openingBalance ?? null,
      fechamentoEm: activeSession?.closedAt ?? null,
      saldoFechamento: activeSession?.closingBalance ?? null,
      currentSessionId: activeSession?.id ?? null,
    },
    activeSession,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return ApiResponse.success(serialize(await getPdvCashState(user.templeId)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action !== "open" && action !== "sangria") {
      return ApiResponse.error("Ação inválida para o caixa do PDV.");
    }

    const register = await ensurePdvCashRegister(user.templeId);
    const activeSession = await prisma.cashSession.findFirst({
      where: {
        templeId: user.templeId,
        cashRegisterId: register.id,
        closedAt: null,
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    if (action === "open" && !activeSession) {
      await prisma.cashSession.create({
        data: {
          templeId: user.templeId,
          cashRegisterId: register.id,
          openedAt: new Date(),
          openingBalance: toDecimal(body.openingBalance || 0),
          openingNotes: body.openingNotes || null,
        },
      });
    }

    if (action === "sangria") {
      const toAccount = String(body.toAccount || "").trim();
      const amount = Number(body.amount || 0);
      const description = String(body.description || "").trim();
      const transferDate = body.transferDate
        ? new Date(String(body.transferDate))
        : new Date();

      if (!activeSession) {
        return ApiResponse.error("O PDV precisa estar aberto para realizar sangria.");
      }

      if (!toAccount) {
        return ApiResponse.error("Selecione a conta de destino da sangria.");
      }

      if (toAccount === PDV_CASH_REGISTER_NAME) {
        return ApiResponse.error("A conta de destino deve ser diferente do PDV.");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return ApiResponse.error("Informe um valor de sangria válido.");
      }

      if (Number.isNaN(transferDate.getTime())) {
        return ApiResponse.error("Informe uma data de sangria válida.");
      }

      const [bankAccount, cashRegister, ledgerAccount] = await Promise.all([
        prisma.financialBankAccount.findFirst({
          where: {
            templeId: user.templeId,
            nome: toAccount,
            deletedAt: null,
          },
          select: { id: true },
        }),
        prisma.cashRegister.findFirst({
          where: {
            templeId: user.templeId,
            nome: toAccount,
            deletedAt: null,
          },
          select: { id: true },
        }),
        prisma.cashLedgerEntry.findFirst({
          where: {
            templeId: user.templeId,
            accountName: toAccount,
            deletedAt: null,
          },
          select: { id: true },
        }),
      ]);

      if (!bankAccount && !cashRegister && !ledgerAccount) {
        return ApiResponse.error("Conta de destino não encontrada.");
      }

      const withdrawalId = randomUUID();
      const narrative = description
        ? `Sangria de caixa - ${description}`
        : "Sangria de caixa";

      await prisma.cashLedgerEntry.create({
        data: {
          templeId: user.templeId,
          accountName: PDV_CASH_REGISTER_NAME,
          entryDate: transferDate,
          category: "Sangria",
          description: `${narrative} - Caixa: ${PDV_CASH_REGISTER_NAME} - Destino informado: ${toAccount}`,
          movementType: "D",
          amount: toDecimal(amount),
          externalId: `${withdrawalId}:debit`,
          sourceFile: "SANGRIA_CAIXA",
          transferFrom: PDV_CASH_REGISTER_NAME,
          transferTo: toAccount,
          isTransfer: false,
        },
      });
    }

    return ApiResponse.success(serialize(await getPdvCashState(user.templeId)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
