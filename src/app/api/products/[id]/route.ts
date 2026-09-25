import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { normalizeProductForDisplay, normalizeProductName } from "@/lib/products";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, templeId: user.templeId },
      include: {
        stockMovements: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      return ApiResponse.notFound("Produto não encontrado.");
    }

    return ApiResponse.success(serialize(normalizeProductForDisplay(product)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();

    if (!body.nome || body.precoVenda === undefined) {
      return ApiResponse.error("Informe nome e valor de venda.");
    }

    const existing = await prisma.product.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Produto não encontrado.");
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        nome: normalizeProductName(body.nome),
        descricao: body.descricao || null,
        foto: body.foto || null,
        sku: body.sku || null,
        codigoBarras: body.codigoBarras || null,
        categoria: body.categoria || null,
        fornecedor: body.fornecedor || null,
        localizacao: body.localizacao || null,
        lote: body.lote || null,
        validade: toDate(body.validade) || null,
        status: body.status || "ATIVO",
        precoCusto:
          body.precoCusto === undefined || body.precoCusto === ""
            ? null
            : toDecimal(body.precoCusto),
        precoVenda: toDecimal(body.precoVenda),
        estoque: toDecimal(body.estoque),
        estoqueMinimo:
          body.estoqueMinimo === undefined || body.estoqueMinimo === ""
            ? null
            : toDecimal(body.estoqueMinimo),
        ativo: body.ativo !== false,
      },
      include: {
        stockMovements: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return ApiResponse.success(serialize(normalizeProductForDisplay(product)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);

    const product = await prisma.product.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!product) {
      return ApiResponse.notFound("Produto não encontrado.");
    }

    await prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
