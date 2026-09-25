import { randomUUID } from "crypto";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveExpenseSourcePages } from "@/lib/finance/payables";
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
      return ApiResponse.error("Selecione a conta para realizar o pagamento.");
    }

    const [transaction, bankAccount, cashRegister] = await Promise.all([
      prisma.financialTransaction.findFirst({
        where: {
          id,
          templeId: user.templeId,
          deletedAt: null,
          tipo: "EXPENSE",
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
      return ApiResponse.notFound("Conta a pagar não encontrada.");
    }

    if (transaction.status === PaymentStatus.PAID) {
      return ApiResponse.error("Essa conta já foi paga.", 409);
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
    const paidAmount = parseSettlementAmount(
      body.amount ?? body.valorPago ?? body.valor,
      remainingAmount
    );

    if (paidAmount <= 0) {
      return ApiResponse.error("Informe um valor pago maior que zero.");
    }

    const nextPaidAmount = alreadyPaid + paidAmount;
    const fullyPaid = nextPaidAmount >= totalAmount - 0.009;
    const nextStatus = fullyPaid
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
          rawStatus: fullyPaid ? "Pago" : "Parcial",
          sourcePages: resolveExpenseSourcePages(nextStatus),
        },
        include: {
          category: true,
        },
      });

      const externalId = `payable:${nextTransaction.id}:${randomUUID()}`;
      const ledgerPayload = {
        templeId: user.templeId,
        accountName: paymentAccountName,
        entryDate: paymentDate,
        category: nextTransaction.category.nome,
        description: fullyPaid
          ? `Pagamento conta a pagar: ${nextTransaction.descricao}`
          : `Pagamento parcial conta a pagar: ${nextTransaction.descricao}`,
        movementType: "D",
        amount: toDecimal(paidAmount),
        externalId,
        contact: nextTransaction.centroCusto || null,
        documentNumber: nextTransaction.documentNumber || null,
        sourceFile: "sistema-estrela",
        isTransfer: false,
      };
      await tx.cashLedgerEntry.create({
        data: ledgerPayload,
      });

      return nextTransaction;
    });

    return ApiResponse.success(serialize(updated));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
