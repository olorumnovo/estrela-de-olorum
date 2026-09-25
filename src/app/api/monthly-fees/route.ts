import { NextRequest } from "next/server";
import { PaymentMethod, PaymentStatus } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { syncTempleMonthlyFees } from "@/lib/monthly-fees/sync";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

const includeMonthlyFee = {
  member: {
    select: {
      id: true,
      nome: true,
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status");
    const tipoContribuicao =
      searchParams.get("tipoContribuicao");

    const monthlyFees = await prisma.monthlyFee.findMany({
      where: {
        templeId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { competencia: { contains: q, mode: "insensitive" } },
                { tipoContribuicao: { contains: q, mode: "insensitive" } },
                { observacoes: { contains: q, mode: "insensitive" } },
                { member: { nome: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(status && status !== "TODOS"
          ? { status: status as PaymentStatus }
          : {}),
        ...(tipoContribuicao &&
        tipoContribuicao !== "TODOS"
          ? { tipoContribuicao }
          : {}),
      },
      include: includeMonthlyFee,
      orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
    });

    return ApiResponse.success(serialize(monthlyFees));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();
    const vencimento = toDate(body.vencimento);

    if (!body.memberId || !body.competencia || !body.valor || !vencimento) {
      return ApiResponse.error("Informe membro, competência, valor e vencimento.");
    }

    const monthlyFee = await prisma.monthlyFee.create({
      data: {
        templeId,
        memberId: body.memberId,
        competencia: body.competencia,
        tipoContribuicao: body.tipoContribuicao || "MENSALIDADE_CORRENTE",
        referencia: toDate(body.referencia) || null,
        valor: toDecimal(body.valor),
        vencimento,
        pagamentoEm: toDate(body.pagamentoEm) || null,
        metodo: body.metodo ? (body.metodo as PaymentMethod) : null,
        status: (body.status || "PENDING") as PaymentStatus,
        observacoes: body.observacoes || null,
      },
      include: includeMonthlyFee,
    });

    await syncTempleMonthlyFees(templeId);

    return ApiResponse.created(serialize(monthlyFee));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
