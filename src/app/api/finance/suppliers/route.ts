import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const q =
      req.nextUrl.searchParams.get("q")?.trim() ?? "";

    const records =
      await prisma.financialTransaction.groupBy({
        by: ["centroCusto"],
        where: {
          templeId,
          deletedAt: null,
          centroCusto: {
            not: null,
          },
          ...(q
            ? {
                centroCusto: {
                  contains: q,
                  mode: "insensitive",
                },
              }
            : {}),
        },
        _count: {
          _all: true,
        },
        _sum: {
          valor: true,
        },
        orderBy: {
          centroCusto: "asc",
        },
      });

    return ApiResponse.success(
      records.map((record, index) => ({
        id: `${record.centroCusto ?? "fornecedor"}-${index}`,
        nome: record.centroCusto ?? "-",
        quantidadeLancamentos: record._count._all,
        totalMovimentado: Number(
          record._sum.valor ?? 0
        ),
      }))
    );
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}
