import { PaymentStatus, TransactionType } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${suffix}`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function buildPaidTransactionWhere(args: {
  templeId: string;
  tipo: TransactionType;
  startDate: Date;
  endDate: Date;
}) {
  return {
    templeId: args.templeId,
    deletedAt: null,
    tipo: args.tipo,
    status: PaymentStatus.PAID,
    pagamentoEm: {
      gte: args.startDate,
      lte: args.endDate,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const startDate = parseDateParam(req.nextUrl.searchParams.get("startDate"));
    const endDate = parseDateParam(req.nextUrl.searchParams.get("endDate"), true);

    if (!startDate || !endDate) {
      return ApiResponse.error("Informe o período do resumo financeiro.");
    }

    const incomeWhere = buildPaidTransactionWhere({
      templeId: user.templeId,
      tipo: TransactionType.INCOME,
      startDate,
      endDate,
    });
    const expenseWhere = buildPaidTransactionWhere({
      templeId: user.templeId,
      tipo: TransactionType.EXPENSE,
      startDate,
      endDate,
    });

    const [income, expense] = await Promise.all([
      prisma.financialTransaction.aggregate({
        where: incomeWhere,
        _sum: {
          amountPaid: true,
          valor: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.financialTransaction.aggregate({
        where: expenseWhere,
        _sum: {
          amountPaid: true,
          valor: true,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const received = Number(income._sum.amountPaid || income._sum.valor || 0);
    const paid = Number(expense._sum.amountPaid || expense._sum.valor || 0);

    return ApiResponse.success({
      summary: {
        received,
        paid,
        balance: received - paid,
        receivedCount: income._count.id,
        paidCount: expense._count.id,
      },
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
