import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const categories = await prisma.financialCategory.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      orderBy: {
        nome: "asc",
      },
    });

    return ApiResponse.success(serialize(categories));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();

    if (!body.nome) {
      return ApiResponse.error("Informe o nome da categoria.");
    }

    const category = await prisma.financialCategory.create({
      data: {
        templeId,
        nome: body.nome,
        descricao: body.descricao || null,
        cor: body.cor || null,
        ativo: body.ativo !== false,
      },
    });

    return ApiResponse.created(serialize(category));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
