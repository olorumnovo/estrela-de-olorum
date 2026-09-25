import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { overdueReceivablesWhere, saoPauloTodayKey } from "@/lib/finance/receivable-charge-automation";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
    const perPage = 20;
    const members = await prisma.member.findMany({
      where: { templeId: user.templeId, deletedAt: null, status: "ACTIVE" },
      select: { nome: true },
    });
    const where = overdueReceivablesWhere(user.templeId, members.map((member) => member.nome), saoPauloTodayKey());
    const [total, transactions] = await Promise.all([
      prisma.financialTransaction.count({ where }),
      prisma.financialTransaction.findMany({
        where,
        orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: { id: true, centroCusto: true, descricao: true, vencimento: true, valor: true, amountPaid: true },
      }),
    ]);
    return ApiResponse.success({
      total, page, pages: Math.max(1, Math.ceil(total / perPage)),
      items: transactions.map((item) => ({
        id: item.id,
        nome: item.centroCusto,
        historico: item.descricao,
        vencimento: item.vencimento?.toISOString().slice(0, 10),
        saldo: Math.max(0, Number(item.valor) - Number(item.amountPaid || 0)),
      })),
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
