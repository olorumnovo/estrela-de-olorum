import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/modules/shared";

import { olistRequest } from "./client";
import { markOlistProductsSync } from "./settings";

type OlistProduct = {
  id: number;
  sku?: string;
  descricao?: string;
  unidade?: string;
  gtin?: string;
  dataCriacao?: string;
  dataAlteracao?: string;
  precos?: {
    preco?: number;
    precoPromocional?: number;
    precoCusto?: number;
    precoCustoMedio?: number;
  };
  estoque?: {
    localizacao?: string;
  };
};

type OlistProductsResponse = {
  itens: OlistProduct[];
  paginacao: {
    limit: number;
    offset: number;
    total: number;
  };
};

async function upsertProductFromOlist(templeId: string, product: OlistProduct) {
  const nome = product.descricao?.trim();

  if (!nome) {
    return { created: false, updated: false, skipped: true };
  }

  const existing = await prisma.product.findFirst({
    where: {
      templeId,
      deletedAt: null,
      OR: [
        ...(product.sku ? [{ sku: product.sku }] : []),
        ...(product.gtin ? [{ codigoBarras: product.gtin }] : []),
        { nome },
      ],
    },
    select: {
      id: true,
    },
  });

  const data = {
    nome,
    descricao: product.unidade ? `Unidade: ${product.unidade}` : null,
    sku: product.sku || null,
    codigoBarras: product.gtin || null,
    localizacao: product.estoque?.localizacao || null,
    precoCusto:
      product.precos?.precoCusto === undefined
        ? null
        : toDecimal(product.precos.precoCusto),
    precoVenda: toDecimal(
      product.precos?.precoPromocional ?? product.precos?.preco ?? 0
    ),
    ativo: true,
    status: "ATIVO",
  };

  if (existing) {
    await prisma.product.update({
      where: {
        id: existing.id,
      },
      data,
    });

    return { created: false, updated: true, skipped: false };
  }

  await prisma.product.create({
    data: {
      templeId,
      ...data,
      estoque: toDecimal(0),
    },
  });

  return { created: true, updated: false, skipped: false };
}

export async function syncOlistProducts(templeId: string) {
  const limit = 100;
  let offset = 0;
  let total = 0;
  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const response = await olistRequest<OlistProductsResponse>(
      templeId,
      "/produtos",
      {
        searchParams: {
          limit,
          offset,
        },
      }
    );

    for (const product of response.itens ?? []) {
      const result = await upsertProductFromOlist(templeId, product);

      imported += 1;
      if (result.created) created += 1;
      if (result.updated) updated += 1;
      if (result.skipped) skipped += 1;
    }

    total = response.paginacao?.total ?? imported;
    offset += response.paginacao?.limit ?? limit;

    if (!response.itens?.length || offset >= total) {
      break;
    }
  }

  await markOlistProductsSync(templeId);

  return {
    imported,
    created,
    updated,
    skipped,
    total,
  };
}

