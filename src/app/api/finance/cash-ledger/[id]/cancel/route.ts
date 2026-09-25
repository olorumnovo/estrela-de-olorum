import { PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import {
  resolveExpenseSourcePages,
  resolveTransactionSourcePages,
} from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function resolveReopenedStatus(vencimento: Date | null) {
  if (!vencimento) {
    return PaymentStatus.PENDING;
  }

  const now = new Date();
  const dueDate = new Date(vencimento);
  dueDate.setHours(23, 59, 59, 999);

  return dueDate < now ? PaymentStatus.OVERDUE : PaymentStatus.PENDING;
}

function resolveRawStatus(status: PaymentStatus) {
  if (status === PaymentStatus.OVERDUE) {
    return "Atrasado";
  }

  return "Em aberto";
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const ledgerEntry = await prisma.cashLedgerEntry.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!ledgerEntry) {
      return ApiResponse.notFound("Movimentação não encontrada.");
    }

    if (
      ledgerEntry.sourceFile !== "sistema-estrela" ||
      !ledgerEntry.externalId ||
      (!ledgerEntry.externalId.startsWith("payable:") &&
        !ledgerEntry.externalId.startsWith("receivable:"))
    ) {
      return ApiResponse.error(
        "Somente movimentações geradas pelo sistema podem ser canceladas.",
        409
      );
    }

    const [prefix, transactionId] = ledgerEntry.externalId.split(":");

    if (!transactionId) {
      return ApiResponse.error("Movimentação inválida para cancelamento.", 409);
    }

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id: transactionId,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!transaction) {
      return ApiResponse.notFound("Lançamento financeiro original não encontrado.");
    }

    const reopenedStatus = resolveReopenedStatus(transaction.vencimento ?? null);
    const nextSourcePages =
      prefix === "payable"
        ? resolveExpenseSourcePages(reopenedStatus)
        : resolveTransactionSourcePages(reopenedStatus);

    const updated = await prisma.$transaction(async (tx) => {
      const restoredTransaction = await tx.financialTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          status: reopenedStatus,
          pagamentoEm: null,
          amountPaid: null,
          paymentReference: null,
          rawStatus: resolveRawStatus(reopenedStatus),
          sourcePages: nextSourcePages,
        },
      });

      await tx.cashLedgerEntry.update({
        where: {
          id: ledgerEntry.id,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      if (
        prefix === "receivable" &&
        transaction.externalSource === "monthly_fee" &&
        transaction.externalId
      ) {
        await tx.monthlyFee.update({
          where: {
            id: transaction.externalId,
          },
          data: {
            status: reopenedStatus,
            pagamentoEm: null,
            metodo: null,
          },
        });
      }

      return restoredTransaction;
    });

    return ApiResponse.success(serialize(updated));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
