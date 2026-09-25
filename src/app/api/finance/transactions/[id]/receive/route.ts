import { randomUUID } from "crypto";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { parseSettlementAmount, resolveOpenStatusByDueDate } from "@/lib/finance/settlements";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    if (!body.bankAccountId) {
      return ApiResponse.error("Selecione a conta para realizar o recebimento.");
    }

    const [transaction, bankAccount, cashRegister] = await Promise.all([
      prisma.financialTransaction.findFirst({
        where: {
          id,
          templeId: user.templeId,
          deletedAt: null,
          tipo: "INCOME",
        },
        include: {
          category: true,
        },
      }),
      prisma.financialBankAccount.findFirst({
        where: {
          id: body.bankAccountId,
          templeId: user.templeId,
          deletedAt: null,
        },
      }),
      prisma.cashRegister.findFirst({
        where: {
          id: body.bankAccountId,
          templeId: user.templeId,
          deletedAt: null,
        },
      }),
    ]);

    if (!transaction) {
      return ApiResponse.notFound("Conta a receber não encontrada.");
    }

    if (transaction.status === PaymentStatus.PAID) {
      return ApiResponse.error("Essa conta já foi recebida.", 409);
    }

    const paymentAccountName = bankAccount?.nome || cashRegister?.nome;

    if (!paymentAccountName) {
      return ApiResponse.notFound("Conta bancária/caixa não encontrada.");
    }

    const paymentDate = toDate(body.paymentDate) ?? new Date();
    const method = body.metodo
      ? (body.metodo as PaymentMethod)
      : transaction.metodo;
    const totalAmount = Number(transaction.valor || 0);
    const alreadyPaid = Number(transaction.amountPaid || 0);
    const remainingAmount = Math.max(totalAmount - alreadyPaid, 0);
    const receivedAmount = parseSettlementAmount(
      body.amount ?? body.valorRecebido ?? body.valor,
      remainingAmount
    );

    if (receivedAmount <= 0) {
      return ApiResponse.error("Informe um valor recebido maior que zero.");
    }

    const nextPaidAmount = alreadyPaid + receivedAmount;
    const fullyReceived = nextPaidAmount >= totalAmount - 0.009;
    const nextStatus = fullyReceived
      ? PaymentStatus.PAID
      : resolveOpenStatusByDueDate(transaction.vencimento ?? null);

    const updated = await prisma.$transaction(async (tx) => {
      const nextTransaction = await tx.financialTransaction.update({
        where: {
          id: transaction.id,
        },
        data: {
          status: nextStatus,
          pagamentoEm: paymentDate,
          amountPaid: toDecimal(nextPaidAmount),
          metodo: method ?? null,
          paymentReference: paymentAccountName,
          rawStatus: fullyReceived ? "Recebido" : "Parcial",
          sourcePages: resolveTransactionSourcePages(nextStatus),
        },
        include: {
          category: true,
        },
      });

      const externalId = `receivable:${nextTransaction.id}:${randomUUID()}`;
      const ledgerPayload = {
        templeId: user.templeId,
        accountName: paymentAccountName,
        entryDate: paymentDate,
        category: nextTransaction.category.nome,
        description: fullyReceived
          ? `Recebimento conta a receber: ${nextTransaction.descricao}`
          : `Recebimento parcial conta a receber: ${nextTransaction.descricao}`,
        movementType: "C",
        amount: toDecimal(receivedAmount),
        externalId,
        contact: nextTransaction.centroCusto || null,
        documentNumber: nextTransaction.documentNumber || null,
        sourceFile: "sistema-estrela",
        isTransfer: false,
      };
      await tx.cashLedgerEntry.create({
        data: ledgerPayload,
      });

      if (
        transaction.externalSource === "monthly_fee" &&
        transaction.externalId
      ) {
        await tx.monthlyFee.update({
          where: {
            id: transaction.externalId,
          },
          data: {
            status: nextStatus,
            pagamentoEm: fullyReceived ? paymentDate : null,
            metodo: method ?? null,
          },
          select: {
            id: true,
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
