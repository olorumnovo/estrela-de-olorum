import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

const PDV_ACCOUNT_NAME = "PDV";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const includeSale = {
  member: {
    select: {
      id: true,
      nome: true,
    },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          nome: true,
          sku: true,
        },
      },
    },
  },
  payments: true,
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const sale = await prisma.sale.findFirst({
      where: { id, templeId: user.templeId },
      include: includeSale,
    });

    if (!sale) {
      return ApiResponse.notFound("Venda não encontrada.");
    }

    return ApiResponse.success(serialize(sale));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    if (body.action !== "cancel") {
      return ApiResponse.error("Ação inválida.");
    }

    const sale = await prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existing || existing.templeId !== user.templeId) {
        throw new Error("Venda não encontrada.");
      }

      if (existing.observacoes?.includes("[IMPORT_REF:")) {
        throw new Error("Venda importada apenas como histórico: não existe movimentação de caixa ou estoque para estornar.");
      }

      if (existing.status !== "CANCELED") {
        for (const item of existing.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              estoque: {
                increment: Number(item.quantidade),
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              tipo: "ENTRY",
              quantidade: item.quantidade,
              observacao: `Cancelamento da venda ${id}`,
            },
          });
        }

        const existingReverseEntry = await tx.cashLedgerEntry.findFirst({
          where: {
            templeId: user.templeId,
            externalId: `sale-cancel:${existing.id}`,
            sourceFile: "sistema-estrela",
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (!existingReverseEntry) {
          await tx.cashLedgerEntry.create({
            data: {
              templeId: user.templeId,
              accountName: PDV_ACCOUNT_NAME,
              entryDate: new Date(),
              category: "Estorno venda PDV",
              description: `Estorno da venda PDV ${existing.id}`,
              movementType: "D",
              amount: existing.total,
              externalId: `sale-cancel:${existing.id}`,
              contact: existing.memberId,
              sourceFile: "sistema-estrela",
              isTransfer: false,
            },
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: "CANCELED",
        },
        include: includeSale,
      });
    });

    return ApiResponse.success(serialize(sale));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
