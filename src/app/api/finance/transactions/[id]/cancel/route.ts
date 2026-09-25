import { PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveExpenseSourcePages, resolveTransactionSourcePages } from "@/lib/finance/payables";
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

    if (transaction.status === PaymentStatus.PAID) {
      return ApiResponse.error(
        "Esta conta já foi liquidada. Estorne a movimentação antes de cancelar.",
        409
      );
    }

    const sourcePages =
      transaction.tipo === "EXPENSE"
        ? resolveExpenseSourcePages(PaymentStatus.CANCELED)
        : resolveTransactionSourcePages(PaymentStatus.CANCELED);

    const updated = await prisma.$transaction(async (tx) => {
      const nextTransaction = await tx.financialTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentStatus.CANCELED,
          rawStatus: "Cancelada",
          sourcePages,
          amountPaid: null,
          pagamentoEm: null,
          paymentReference: null,
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
            status: PaymentStatus.CANCELED,
            pagamentoEm: null,
            metodo: null,
          },
        });
      }

      return nextTransaction;
    });

    return ApiResponse.success(serialize(updated));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
