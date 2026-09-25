import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const category = await prisma.financialCategory.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!category) {
      return ApiResponse.notFound("Categoria não encontrada.");
    }

    return ApiResponse.success(serialize(category));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.financialCategory.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Categoria não encontrada.");
    }

    const category = await prisma.financialCategory.update({
      where: {
        id,
      },
      data: {
        nome: body.nome,
        descricao: body.descricao || null,
        cor: body.cor || null,
        ativo: body.ativo !== false,
      },
    });

    return ApiResponse.success(serialize(category));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.financialCategory.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Categoria não encontrada.");
    }

    await prisma.financialCategory.update({
      where: {
        id,
      },
      data: {
        ativo: false,
        deletedAt: new Date(),
      },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
