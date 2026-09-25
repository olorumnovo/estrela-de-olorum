import { PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import {
  resolveExpenseSourcePages,
  resolveTransactionSourcePages,
} from "@/lib/finance/payables";
import { resolveOpenRawStatus, resolveOpenStatusByDueDate } from "@/lib/finance/settlements";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!transaction) {
      return ApiResponse.notFound("Lançamento não encontrado.");
    }

    if (transaction.status !== PaymentStatus.PAID) {
      return ApiResponse.error("Somente contas já liquidadas podem ser estornadas.", 409);
    }

    const ledgerExternalId = `${transaction.tipo === "EXPENSE" ? "payable" : "receivable"}:${transaction.id}`;
    const ledgerExternalIdWhere = {
      OR: [
        {
          externalId: ledgerExternalId,
        },
        {
          externalId: {
            startsWith: `${ledgerExternalId}:`,
          },
        },
      ],
    };

    const ledgerEntry = await prisma.cashLedgerEntry.findFirst({
      where: {
        templeId: user.templeId,
        ...ledgerExternalIdWhere,
        sourceFile: "sistema-estrela",
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!ledgerEntry) {
      return ApiResponse.error(
        "Não foi encontrada a movimentação correspondente em Caixa e Bancos para estorno.",
        404
      );
    }

    const reopenedStatus = resolveOpenStatusByDueDate(transaction.vencimento ?? null);
    const sourcePages =
      transaction.tipo === "EXPENSE"
        ? resolveExpenseSourcePages(reopenedStatus)
        : resolveTransactionSourcePages(reopenedStatus);

    const updated = await prisma.$transaction(async (tx) => {
      const restored = await tx.financialTransaction.update({
        where: { id: transaction.id },
        data: {
          status: reopenedStatus,
          rawStatus: resolveOpenRawStatus(reopenedStatus),
          sourcePages,
          amountPaid: null,
          pagamentoEm: null,
          paymentReference: null,
        },
      });

      await tx.cashLedgerEntry.updateMany({
        where: {
          templeId: user.templeId,
          ...ledgerExternalIdWhere,
          sourceFile: "sistema-estrela",
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      if (
        transaction.tipo === "INCOME" &&
        transaction.externalSource === "monthly_fee" &&
        transaction.externalId
      ) {
        await tx.monthlyFee.update({
          where: { id: transaction.externalId },
          data: {
            status: reopenedStatus,
            pagamentoEm: null,
            metodo: null,
          },
        });
      }

      return restored;
    });

    return ApiResponse.success(serialize(updated));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
