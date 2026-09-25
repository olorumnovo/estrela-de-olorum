import { NextRequest } from "next/server";
import { Prisma, StockMovementType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDecimal } from "@/modules/shared";

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
    const tipo = body.tipo as StockMovementType;
    const quantidade = toDecimal(body.quantidade);

    if (!tipo || quantidade.lessThanOrEqualTo(0)) {
      return ApiResponse.error("Informe tipo e quantidade.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: { estoque: true },
      });

      const tenantProduct = await tx.product.findFirst({
        where: { id, templeId: user.templeId },
        select: { id: true },
      });

      if (!product || !tenantProduct) {
        throw new Error("Produto não encontrado.");
      }

      let nextStock = product.estoque;

      if (tipo === "ENTRY") {
        nextStock = product.estoque.plus(quantidade);
      }

      if (tipo === "EXIT") {
        nextStock = product.estoque.minus(quantidade);
      }

      if (tipo === "TRANSFER") {
        nextStock = product.estoque.minus(quantidade);
      }

      if (tipo === "INVENTORY" || tipo === "ADJUSTMENT") {
        nextStock = quantidade;
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: id,
          tipo,
          quantidade,
          origem: body.origem || null,
          destino: body.destino || null,
          observacao: body.observacao || null,
        },
      });

      const updated = await tx.product.update({
        where: { id },
        data: {
          estoque: nextStock,
        },
        include: {
          stockMovements: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      return { movement, product: updated };
    });

    return ApiResponse.created(serialize(result));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return ApiResponse.serverError(error.message);
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
