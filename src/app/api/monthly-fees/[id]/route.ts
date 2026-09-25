import { NextRequest } from "next/server";
import { PaymentMethod, PaymentStatus } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { syncTempleMonthlyFees } from "@/lib/monthly-fees/sync";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const includeMonthlyFee = {
  member: {
    select: {
      id: true,
      nome: true,
    },
  },
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const monthlyFee = await prisma.monthlyFee.findFirst({
      where: { id, templeId: user.templeId },
      include: includeMonthlyFee,
    });

    if (!monthlyFee) {
      return ApiResponse.notFound("Mensalidade não encontrada.");
    }

    return ApiResponse.success(serialize(monthlyFee));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();
    const vencimento = toDate(body.vencimento);

    if (!body.memberId || !body.competencia || !body.valor || !vencimento) {
      return ApiResponse.error("Informe membro, competência, valor e vencimento.");
    }

    const existing = await prisma.monthlyFee.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Mensalidade não encontrada.");
    }

    const monthlyFee = await prisma.monthlyFee.update({
      where: { id },
      data: {
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

    await syncTempleMonthlyFees(user.templeId);

    return ApiResponse.success(serialize(monthlyFee));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.monthlyFee.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Mensalidade não encontrada.");
    }

    await prisma.monthlyFee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
