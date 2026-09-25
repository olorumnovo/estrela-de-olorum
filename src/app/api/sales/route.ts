import { NextRequest } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDecimal, toNumber } from "@/modules/shared";

const PDV_ACCOUNT_NAME = "PDV";

async function ensurePdvAccount(tx: Prisma.TransactionClient, templeId: string) {
  const existingBankAccount = await tx.financialBankAccount.findFirst({
    where: {
      templeId,
      nome: PDV_ACCOUNT_NAME,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (existingBankAccount) {
    return existingBankAccount;
  }

  return tx.financialBankAccount.create({
    data: {
      templeId,
      nome: PDV_ACCOUNT_NAME,
      banco: PDV_ACCOUNT_NAME,
      tipo: "PAGAMENTO",
      titular: "Sistema Estrela",
      observacoes: "Conta isolada para movimentações do PDV.",
      ativo: true,
    },
    select: {
      id: true,
    },
  });
}

type SaleItemInput = {
  productId?: string;
  quantidade?: number | string;
  valorUnitario?: number | string;
};

type SalePaymentInput = {
  metodo?: PaymentMethod;
  valor?: number | string;
};

function parseItems(value: unknown): SaleItemInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is SaleItemInput =>
      Boolean(item) && typeof item === "object"
  );
}

function parsePayments(value: unknown): SalePaymentInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is SalePaymentInput =>
      Boolean(item) && typeof item === "object"
  );
}

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

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const exportAll = searchParams.get("all") === "true";

    const sales = await prisma.sale.findMany({
      where: {
        templeId,
        ...(q
          ? {
              OR: [
                { observacoes: { contains: q, mode: "insensitive" } },
                { member: { nome: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: includeSale,
      orderBy: {
        createdAt: "desc",
      },
      ...(exportAll ? {} : { take: 100 }),
    });

    return ApiResponse.success(serialize(sales));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();
    const items = parseItems(body.items);
    const payments = parsePayments(body.payments);

    if (items.length === 0) {
      return ApiResponse.error("Informe ao menos um item.");
    }

    const sale = await prisma.$transaction(async (tx) => {
      await ensurePdvAccount(tx, templeId);

      const normalizedItems = items.map((item) => {
        const quantidade = toDecimal(item.quantidade);
        const valorUnitario = toDecimal(item.valorUnitario);

        return {
          productId: item.productId || "",
          quantidade,
          valorUnitario,
          subtotal: quantidade.mul(valorUnitario),
        };
      });

      const subtotal = normalizedItems.reduce(
        (total, item) => total.plus(item.subtotal),
        toDecimal(0)
      );
      const desconto = toDecimal(body.desconto);
      const acrescimo = toDecimal(body.acrescimo);
      const total = subtotal.minus(desconto).plus(acrescimo);

      const created = await tx.sale.create({
        data: {
          templeId,
          memberId: body.memberId || null,
          subtotal,
          desconto,
          acrescimo,
          total,
          metodo: payments[0]?.metodo || (body.metodo as PaymentMethod) || null,
          status: "PAID",
          observacoes: body.observacoes || null,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantidade: item.quantidade,
              valorUnitario: item.valorUnitario,
              subtotal: item.subtotal,
            })),
          },
          payments: {
            create:
              payments.length > 0
                ? payments.map((payment) => ({
                    metodo: payment.metodo as PaymentMethod,
                    valor: toDecimal(payment.valor),
                  }))
                : [
                    {
                      metodo:
                        (body.metodo as PaymentMethod | undefined) || "PIX",
                      valor: total,
                    },
                  ],
          },
        },
      });

      for (const item of normalizedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            estoque: {
              decrement: toNumber(item.quantidade),
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            tipo: "EXIT",
            quantidade: item.quantidade,
            observacao: `Venda ${created.id}`,
          },
        });
      }

      await tx.cashLedgerEntry.create({
        data: {
          templeId,
          accountName: PDV_ACCOUNT_NAME,
          entryDate: new Date(),
          category: "Vendas PDV",
          description: `Venda PDV ${created.id}`,
          movementType: "C",
          amount: total,
          externalId: `sale:${created.id}`,
          contact: body.memberId || null,
          sourceFile: "sistema-estrela",
          isTransfer: false,
        },
      });

      return tx.sale.findUnique({
        where: { id: created.id },
        include: includeSale,
      });
    });

    return ApiResponse.created(serialize(sale));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
