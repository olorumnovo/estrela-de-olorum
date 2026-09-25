import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { normalizeProductForDisplay, normalizeProductName } from "@/lib/products";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const lowStock = searchParams.get("lowStock") === "true";
    const productNameQuery = q?.replace(/\bcamiseta\b/gi, "Camisa");
    const searchFilters: Prisma.ProductWhereInput[] = q
      ? [
          { nome: { contains: q, mode: "insensitive" } },
          ...(productNameQuery && productNameQuery !== q
            ? [{ nome: { contains: productNameQuery, mode: "insensitive" } } satisfies Prisma.ProductWhereInput]
            : []),
          { sku: { contains: q, mode: "insensitive" } },
          { codigoBarras: { contains: q, mode: "insensitive" } },
          { categoria: { contains: q, mode: "insensitive" } },
          { fornecedor: { contains: q, mode: "insensitive" } },
        ]
      : [];

    const products = await prisma.product.findMany({
      where: {
        templeId,
        deletedAt: null,
        ...(q ? { OR: searchFilters } : {}),
      },
      include: {
        stockMovements: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
      },
      orderBy: {
        nome: "asc",
      },
    });

    const filtered = lowStock
      ? products.filter(
          (product) =>
            product.estoqueMinimo !== null &&
            product.estoque.lessThanOrEqualTo(product.estoqueMinimo)
        )
      : products;

    return ApiResponse.success(serialize(filtered.map(normalizeProductForDisplay)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();

    if (!body.nome || body.precoVenda === undefined) {
      return ApiResponse.error("Informe nome e valor de venda.");
    }

    const product = await prisma.product.create({
      data: {
        templeId,
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
        stockMovements: true,
      },
    });

    return ApiResponse.created(serialize(normalizeProductForDisplay(product)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
