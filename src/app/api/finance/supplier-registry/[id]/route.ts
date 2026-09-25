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

    const supplier = await prisma.financialSupplier.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
    });

    if (!supplier) {
      return ApiResponse.notFound("Fornecedor não encontrado.");
    }

    return ApiResponse.success(serialize(supplier));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.financialSupplier.findFirst({
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
      return ApiResponse.notFound("Fornecedor não encontrado.");
    }

    const duplicate = await prisma.financialSupplier.findFirst({
      where: {
        templeId: user.templeId,
        deletedAt: null,
        nome: body.nome,
        id: {
          not: id,
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return ApiResponse.error("Já existe um fornecedor com este nome.");
    }

    const supplier = await prisma.financialSupplier.update({
      where: {
        id,
      },
      data: {
        nome: body.nome,
        documento: body.documento || null,
        telefone: body.telefone || null,
        email: body.email || null,
        observacoes: body.observacoes || null,
        ativo: body.ativo !== "false" && body.ativo !== false,
      },
    });

    return ApiResponse.success(serialize(supplier));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.financialSupplier.findFirst({
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
      return ApiResponse.notFound("Fornecedor não encontrado.");
    }

    await prisma.financialSupplier.update({
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
