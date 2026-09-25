import {
  PaymentStatus,
  Prisma,
  TransactionType,
  type PaymentMethod,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveExpenseSourcePages, resolveTransactionSourcePages } from "@/lib/finance/payables";
import { toDate, toDecimal } from "@/modules/shared";

import { olistRequest } from "./client";

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type OlistParty = {
  id?: number;
  nome?: string;
  codigo?: string;
  fantasia?: string;
  cpfCnpj?: string;
  telefone?: string;
  celular?: string;
  email?: string;
};

type OlistCategory = {
  id?: number;
  descricao?: string;
};

type OlistMethod = {
  id?: number;
  nome?: string;
};

type OlistPayableListItem = {
  id: number;
  situacao?: string;
  data?: string;
  dataVencimento?: string;
  historico?: string;
  valor?: number;
  saldo?: number;
  valorPago?: number;
  numeroDocumento?: string;
  serieDocumento?: string;
  cliente?: OlistParty;
  categoria?: OlistCategory;
};

type OlistReceivableListItem = {
  id: number;
  situacao?: string;
  data?: string;
  dataVencimento?: string;
  historico?: string;
  valor?: number;
  saldo?: number;
  numeroDocumento?: string;
  numeroBanco?: string | null;
  serieDocumento?: string;
  cliente?: OlistParty;
  quantidadeParcelasAntecipadas?: number | null;
};

type OlistReceivableDetail = {
  id: number;
  data?: string;
  dataVencimento?: string;
  dataCompetencia?: string;
  dataLiquidacao?: string;
  diaVencimento?: number;
  numeroDocumento?: string;
  numeroBanco?: string;
  serieDocumento?: string;
  quantidadeParcelas?: number;
  quantidadeParcelasAntecipadas?: number;
  valor?: number;
  saldo?: number;
  taxa?: number;
  juros?: number;
  multa?: number;
  valorPago?: number;
  historico?: string;
  linkBoleto?: string;
  cliente?: OlistParty;
  categoria?: OlistCategory;
  formaRecebimento?: OlistMethod;
};

type OlistListResponse<T> = {
  itens: T[];
  paginacao: {
    limit: number;
    offset: number;
    total: number;
  };
};

function resolvePaymentMethod(name?: string | null): PaymentMethod | null {
  const normalized = name?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("pix")) {
    return "PIX";
  }

  if (normalized.includes("boleto")) {
    return "BOLETO";
  }

  if (normalized.includes("crédito") || normalized.includes("credito")) {
    return "CARTAO_CREDITO";
  }

  if (normalized.includes("débito") || normalized.includes("debito")) {
    return "CARTAO_DEBITO";
  }

  if (
    normalized.includes("transfer") ||
    normalized.includes("ted") ||
    normalized.includes("doc")
  ) {
    return "TRANSFERENCIA";
  }

  if (
    normalized.includes("dinheiro") ||
    normalized.includes("espécie") ||
    normalized.includes("especie")
  ) {
    return "DINHEIRO";
  }

  return null;
}

function resolvePaymentStatus(
  rawStatus: string | undefined,
  balance: number | undefined,
  paidValue: number | undefined,
  totalValue: number | undefined,
  dueDate?: string
) {
  const normalizedStatus = rawStatus?.trim().toLowerCase();

  if (normalizedStatus?.includes("cancel")) {
    return PaymentStatus.CANCELED;
  }

  const saldo = balance ?? totalValue ?? 0;
  const valorPago = paidValue ?? 0;
  const valorTotal = totalValue ?? 0;

  if (saldo <= 0 || (valorTotal > 0 && valorPago >= valorTotal)) {
    return PaymentStatus.PAID;
  }

  const due = dueDate ? new Date(dueDate) : null;
  if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
    return PaymentStatus.OVERDUE;
  }

  return PaymentStatus.PENDING;
}

function resolveReceivableSourcePages(
  rawStatus: string | undefined,
  status: PaymentStatus
) {
  const pages = resolveTransactionSourcePages(status);

  return [...new Set(pages)];
}

async function fetchOlistReceivableDetail(templeId: string, id: number) {
  try {
    return await olistRequest<OlistReceivableDetail>(
      templeId,
      `/contas-receber/${id}`
    );
  } catch {
    return null;
  }
}

async function getOrCreateFinancialCategory(
  templeId: string,
  name: string,
  cache?: Map<string, string>
) {
  const normalizedName = name.trim();

  const cachedId = cache?.get(normalizedName);
  if (cachedId) {
    return cachedId;
  }

  const category = await prisma.financialCategory.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: normalizedName,
      },
    },
    update: {
      deletedAt: null,
      ativo: true,
      descricao: "Categoria criada automaticamente pela integração com a Olist.",
    },
    create: {
      templeId,
      nome: normalizedName,
      descricao: "Categoria criada automaticamente pela integração com a Olist.",
      ativo: true,
    },
    select: {
      id: true,
    },
  });

  cache?.set(normalizedName, category.id);

  return category.id;
}

function buildNotes(base: {
  contactName?: string;
  documentNumber?: string;
  documentSeries?: string;
  competenceDate?: string;
  originalId: number;
  boletoLink?: string;
}) {
  const notes = [
    `Origem: Olist`,
    `ID externo: ${base.originalId}`,
    base.contactName ? `Contato/Cliente: ${base.contactName}` : null,
    base.documentNumber ? `Documento: ${base.documentNumber}` : null,
    base.documentSeries ? `Série: ${base.documentSeries}` : null,
    base.competenceDate ? `Competência: ${base.competenceDate}` : null,
    base.boletoLink ? `Boleto: ${base.boletoLink}` : null,
  ].filter(Boolean);

  return notes.join(" | ");
}

function buildReceivableTransactionData(
  templeId: string,
  item: OlistReceivableListItem,
  categoryId: string,
  detail?: OlistReceivableDetail | null
): Prisma.FinancialTransactionCreateManyInput {
  const contact = detail?.cliente ?? item.cliente;
  const description =
    detail?.historico?.trim() ||
    item.historico?.trim() ||
    contact?.nome?.trim() ||
    `Conta a receber Olist #${item.id}`;
  const amount = detail?.valor ?? item.valor ?? 0;
  const amountPaid =
    detail?.valorPago ??
    ((detail?.valor ?? item.valor ?? 0) - (detail?.saldo ?? item.saldo ?? item.valor ?? 0));
  const status = resolvePaymentStatus(
    item.situacao,
    detail?.saldo ?? item.saldo,
    amountPaid,
    amount,
    detail?.dataVencimento ?? item.dataVencimento
  );

  return {
    templeId,
    categoryId,
    descricao: description,
    tipo: TransactionType.INCOME,
    valor: toDecimal(amount),
    quantidadeParcelas: null,
    valorParcela: null,
    metodo: resolvePaymentMethod(detail?.formaRecebimento?.nome),
    status,
    issuedAt: toDate(detail?.data ?? item.data) ?? null,
    competencia: toDate(detail?.dataCompetencia) ?? null,
    rawStatus: item.situacao ?? null,
    amountPaid: toDecimal(amountPaid),
    documentNumber: detail?.numeroDocumento ?? item.numeroDocumento ?? null,
    paymentReference: null,
    sourcePages: resolveReceivableSourcePages(item.situacao, status),
    sourceFiles: [],
    centroCusto: contact?.nome?.trim() || null,
    vencimento: toDate(detail?.dataVencimento ?? item.dataVencimento) ?? null,
    pagamentoEm: toDate(detail?.dataLiquidacao) ?? null,
    observacoes: buildNotes({
      contactName: contact?.nome,
      documentNumber: detail?.numeroDocumento ?? item.numeroDocumento,
      documentSeries: detail?.serieDocumento ?? item.serieDocumento,
      competenceDate: detail?.dataCompetencia,
      originalId: item.id,
      boletoLink: detail?.linkBoleto,
    }),
    externalSource: "olist:contas-receber",
    externalId: String(item.id),
  };
}

async function ensureFinancialCategories(
  templeId: string,
  categoryNames: string[]
) {
  const uniqueNames = Array.from(
    new Set(categoryNames.map((name) => name.trim()).filter(Boolean))
  );

  if (!uniqueNames.length) {
    return new Map<string, string>();
  }

  await prisma.financialCategory.createMany({
    data: uniqueNames.map((name) => ({
      templeId,
      nome: name,
      descricao: "Categoria criada automaticamente pela integração com a Olist.",
      ativo: true,
    })),
    skipDuplicates: true,
  });

  const categories = await prisma.financialCategory.findMany({
    where: {
      templeId,
      nome: {
        in: uniqueNames,
      },
    },
    select: {
      id: true,
      nome: true,
    },
  });

  return new Map(categories.map((category) => [category.nome, category.id]));
}

function buildPayableTransactionData(
  templeId: string,
  item: OlistPayableListItem,
  categoryId: string
): Prisma.FinancialTransactionCreateManyInput {
  const contact = item.cliente;
  const description =
    item.historico?.trim() ||
    contact?.nome?.trim() ||
    `Conta a pagar Olist #${item.id}`;
  const amount = item.valor ?? 0;
  const amountPaid =
    item.valorPago ?? ((item.valor ?? 0) - (item.saldo ?? item.valor ?? 0));
  const status = resolvePaymentStatus(
    item.situacao,
    item.saldo,
    amountPaid,
    amount,
    item.dataVencimento
  );

  return {
    templeId,
    categoryId,
    descricao: description,
    tipo: TransactionType.EXPENSE,
    valor: toDecimal(amount),
    quantidadeParcelas: null,
    valorParcela: null,
    metodo: null,
    status,
    issuedAt: toDate(item.data) ?? null,
    competencia: null,
    rawStatus: item.situacao ?? null,
    amountPaid: toDecimal(amountPaid),
    documentNumber: item.numeroDocumento ?? null,
    paymentReference: null,
    sourcePages: resolveExpenseSourcePages(status),
    sourceFiles: [],
    centroCusto: contact?.nome?.trim() || null,
    vencimento: toDate(item.dataVencimento) ?? null,
    pagamentoEm: status === PaymentStatus.PAID ? toDate(item.dataVencimento) ?? null : null,
    observacoes: buildNotes({
      contactName: contact?.nome,
      documentNumber: item.numeroDocumento,
      documentSeries: item.serieDocumento,
      originalId: item.id,
    }),
    externalSource: "olist:contas-pagar",
    externalId: String(item.id),
  };
}

async function upsertFinancialTransaction(args: {
  templeId: string;
  externalSource: string;
  externalId: string;
  categoryName: string;
  description: string;
  type: TransactionType;
  amount: number;
  installmentCount?: number;
  paymentMethodName?: string;
  status: PaymentStatus;
  dueDate?: string;
  issuedAt?: string;
  competenceDate?: string;
  paidAt?: string;
  amountPaid?: number;
  rawStatus?: string;
  documentNumber?: string;
  paymentReference?: string;
  sourcePages?: string[];
  centroCusto?: string;
  notes?: string;
  categoryCache?: Map<string, string>;
}) {
  const categoryId = await getOrCreateFinancialCategory(
    args.templeId,
    args.categoryName,
    args.categoryCache
  );

  const data = {
    categoryId,
    descricao: args.description,
    tipo: args.type,
    valor: toDecimal(args.amount),
    quantidadeParcelas: args.installmentCount ?? null,
    valorParcela:
      args.installmentCount && args.installmentCount > 0
        ? toDecimal(args.amount / args.installmentCount)
        : null,
    metodo: resolvePaymentMethod(args.paymentMethodName),
    status: args.status,
    issuedAt: toDate(args.issuedAt) ?? null,
    competencia: toDate(args.competenceDate) ?? null,
    rawStatus: args.rawStatus ?? null,
    amountPaid:
      typeof args.amountPaid === "number"
        ? toDecimal(args.amountPaid)
        : null,
    documentNumber: args.documentNumber ?? null,
    paymentReference: args.paymentReference ?? null,
    sourcePages: args.sourcePages ?? [],
    centroCusto: args.centroCusto ?? null,
    vencimento: toDate(args.dueDate) ?? null,
    pagamentoEm: toDate(args.paidAt) ?? null,
    observacoes: args.notes ?? null,
    externalSource: args.externalSource,
    externalId: args.externalId,
  };

  await prisma.financialTransaction.upsert({
    where: {
      templeId_externalSource_externalId: {
        templeId: args.templeId,
        externalSource: args.externalSource,
        externalId: args.externalId,
      },
    },
    update: data,
    create: {
      templeId: args.templeId,
      ...data,
    },
  });
}

async function listAllItems<T>(
  templeId: string,
  path: string
) {
  const initialLimit = 100;
  const minimumLimit = 25;
  let limit = initialLimit;
  let offset = 0;
  let total = 0;
  const items: T[] = [];
  let retryCount = 0;

  while (true) {
    let response: OlistListResponse<T>;

    try {
      response = await olistRequest<OlistListResponse<T>>(templeId, path, {
        searchParams: {
          limit,
          offset,
        },
      });
      retryCount = 0;
    } catch (error) {
      if (limit > minimumLimit) {
        limit = Math.max(minimumLimit, Math.floor(limit / 2));
        await wait(500);
        continue;
      }

      if (retryCount < 3) {
        retryCount += 1;
        await wait(750 * retryCount);
        continue;
      }

      throw error;
    }

    items.push(...(response.itens ?? []));

    total = response.paginacao?.total ?? items.length;
    offset += response.paginacao?.limit ?? limit;

    await wait(150);

    if (!response.itens?.length || offset >= total) {
      break;
    }
  }

  return items;
}

export async function syncOlistPayables(templeId: string) {
  const items = await listAllItems<OlistPayableListItem>(
    templeId,
    "/contas-pagar"
  );
  const categoryNames = items.map(
    (item) => item.categoria?.descricao?.trim() || "Olist - Contas a Pagar"
  );
  const categoryMap = await ensureFinancialCategories(templeId, categoryNames);
  const categoryCache = new Map<string, string>(categoryMap);
  const existingTransactionIds = new Set(
    (
      await prisma.financialTransaction.findMany({
        where: {
          templeId,
          externalSource: "olist:contas-pagar",
        },
        select: {
          externalId: true,
        },
      })
    )
      .map((item) => item.externalId)
      .filter((value): value is string => Boolean(value))
  );

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const contact = item.cliente;
    const categoryName =
      item.categoria?.descricao?.trim() || "Olist - Contas a Pagar";
    const description =
      item.historico?.trim() ||
      contact?.nome?.trim() ||
      `Conta a pagar Olist #${item.id}`;
    const status = resolvePaymentStatus(
      item.situacao,
      item.saldo,
      item.valorPago ?? ((item.valor ?? 0) - (item.saldo ?? item.valor ?? 0)),
      item.valor,
      item.dataVencimento
    );

    const alreadyExists = existingTransactionIds.has(String(item.id));

    await upsertFinancialTransaction({
      templeId,
      externalSource: "olist:contas-pagar",
      externalId: String(item.id),
      categoryName,
      description,
      type: TransactionType.EXPENSE,
      amount: item.valor ?? 0,
      status,
      issuedAt: item.data,
      amountPaid:
        item.valorPago ?? ((item.valor ?? 0) - (item.saldo ?? item.valor ?? 0)),
      rawStatus: item.situacao ?? undefined,
      documentNumber: item.numeroDocumento,
      sourcePages: resolveExpenseSourcePages(status),
      centroCusto: contact?.nome?.trim() || undefined,
      dueDate: item.dataVencimento,
      categoryCache,
      notes: buildNotes({
        contactName: contact?.nome,
        documentNumber: item.numeroDocumento,
        documentSeries: item.serieDocumento,
        originalId: item.id,
      }),
    });

    if (alreadyExists) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return {
    imported: items.length,
    created,
    updated,
    total: items.length,
    module: "payables",
  };
}

export async function syncOlistReceivables(templeId: string) {
  const categoryName = "Olist - Contas a Receber";
  const categoryMap = await ensureFinancialCategories(templeId, [categoryName]);
  const categoryId = categoryMap.get(categoryName);

  if (!categoryId) {
    throw new Error("Categoria financeira de contas a receber não encontrada.");
  }

  const categoryCache = new Map<string, string>([[categoryName, categoryId]]);
  const existingTransactionIds = new Set(
    (
      await prisma.financialTransaction.findMany({
        where: {
          templeId,
          externalSource: "olist:contas-receber",
        },
        select: {
          externalId: true,
        },
      })
    )
      .map((item) => item.externalId)
      .filter((value): value is string => Boolean(value))
  );

  let created = 0;
  let updated = 0;
  let imported = 0;
  let limit = existingTransactionIds.size === 0 ? 50 : 25;
  let offset = 0;
  let total = 0;
  let retryCount = 0;
  const seenExternalIds = new Set<string>();

  while (true) {
    let response: OlistListResponse<OlistReceivableListItem>;

    try {
      response = await olistRequest<OlistListResponse<OlistReceivableListItem>>(
        templeId,
        "/contas-receber",
        {
          searchParams: {
            limit,
            offset,
          },
        }
      );
      retryCount = 0;
    } catch (error) {
      if (limit > 25) {
        limit = 25;
        await wait(750);
        continue;
      }

      if (retryCount < 6) {
        retryCount += 1;
        await wait(1_000 * retryCount);
        continue;
      }

      throw error;
    }

    const pageItems = response.itens ?? [];

    if (!pageItems.length) {
      break;
    }

    total = response.paginacao?.total ?? total ?? pageItems.length;
    imported += pageItems.length;

    if (existingTransactionIds.size === 0) {
      const rows: Prisma.FinancialTransactionCreateManyInput[] = [];

      for (const item of pageItems) {
        const detail =
          item.situacao?.trim().toLowerCase() === "pago" ||
          item.situacao?.trim().toLowerCase() === "parcial"
            ? await fetchOlistReceivableDetail(templeId, item.id)
            : null;

        rows.push(buildReceivableTransactionData(templeId, item, categoryId, detail));
      }

      rows.forEach((row) => {
        if (row.externalId) {
          seenExternalIds.add(row.externalId);
        }
      });

      await prisma.financialTransaction.createMany({
        data: rows,
        skipDuplicates: true,
      });

      created += rows.length;
    } else {
      for (const item of pageItems) {
        const externalId = String(item.id);
        const detail =
          item.situacao?.trim().toLowerCase() === "pago" ||
          item.situacao?.trim().toLowerCase() === "parcial"
            ? await fetchOlistReceivableDetail(templeId, item.id)
            : null;
        const description =
          detail?.historico?.trim() ||
          item.historico?.trim() ||
          item.cliente?.nome?.trim() ||
          `Conta a receber Olist #${item.id}`;

        seenExternalIds.add(externalId);
        const alreadyExists = existingTransactionIds.has(externalId);
        const amountPaid =
          detail?.valorPago ??
          ((detail?.valor ?? item.valor ?? 0) - (detail?.saldo ?? item.saldo ?? item.valor ?? 0));
        const status = resolvePaymentStatus(
          item.situacao,
          detail?.saldo ?? item.saldo,
          amountPaid,
          detail?.valor ?? item.valor,
          detail?.dataVencimento ?? item.dataVencimento
        );

        await upsertFinancialTransaction({
          templeId,
          externalSource: "olist:contas-receber",
          externalId,
          categoryName,
          description,
          type: TransactionType.INCOME,
          amount: detail?.valor ?? item.valor ?? 0,
          paymentMethodName: detail?.formaRecebimento?.nome,
          status,
          issuedAt: detail?.data ?? item.data,
          competenceDate: detail?.dataCompetencia,
          paidAt: detail?.dataLiquidacao,
          amountPaid,
          rawStatus: item.situacao ?? undefined,
          documentNumber: detail?.numeroDocumento ?? item.numeroDocumento,
          sourcePages: resolveReceivableSourcePages(item.situacao, status),
          centroCusto: detail?.cliente?.nome?.trim() || item.cliente?.nome?.trim() || undefined,
          dueDate: detail?.dataVencimento ?? item.dataVencimento,
          categoryCache,
          notes: buildNotes({
            contactName: detail?.cliente?.nome ?? item.cliente?.nome,
            documentNumber: detail?.numeroDocumento ?? item.numeroDocumento,
            documentSeries: detail?.serieDocumento ?? item.serieDocumento,
            competenceDate: detail?.dataCompetencia,
            originalId: item.id,
            boletoLink: detail?.linkBoleto,
          }),
        });

        if (alreadyExists) {
          updated += 1;
        } else {
          created += 1;
        }
      }
    }

    offset += response.paginacao?.limit ?? limit;

    await wait(250);

    if (offset >= total) {
      break;
    }
  }

  if (seenExternalIds.size > 0) {
    await prisma.financialTransaction.updateMany({
      where: {
        templeId,
        externalSource: "olist:contas-receber",
        deletedAt: null,
        NOT: {
          externalId: {
            in: [...seenExternalIds],
          },
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  return {
    imported,
    created,
    updated,
    total: total || imported,
    module: "receivables",
  };
}

export async function resetAndSyncOlistReceivables(templeId: string) {
  const deleted = await prisma.financialTransaction.deleteMany({
    where: {
      templeId,
      externalSource: "olist:contas-receber",
    },
  });

  const synced = await syncOlistReceivables(templeId);

  return {
    deleted: deleted.count,
    ...synced,
  };
}

export async function resetAndSyncOlistPayables(templeId: string) {
  const deleted = await prisma.financialTransaction.deleteMany({
    where: {
      templeId,
      externalSource: "olist:contas-pagar",
    },
  });

  const items = await listAllItems<OlistPayableListItem>(
    templeId,
    "/contas-pagar"
  );
  const categoryNames = items.map(
    (item) => item.categoria?.descricao?.trim() || "Olist - Contas a Pagar"
  );
  const categoryMap = await ensureFinancialCategories(templeId, categoryNames);
  const rows = items.map((item) => {
    const categoryName =
      item.categoria?.descricao?.trim() || "Olist - Contas a Pagar";
    const categoryId = categoryMap.get(categoryName);

    if (!categoryId) {
      throw new Error(`Categoria financeira não encontrada para ${categoryName}.`);
    }

    return buildPayableTransactionData(templeId, item, categoryId);
  });

  if (rows.length) {
    await prisma.financialTransaction.createMany({
      data: rows,
      skipDuplicates: true,
    });
  }

  return {
    deleted: deleted.count,
    imported: items.length,
    created: rows.length,
    updated: 0,
    total: items.length,
    module: "payables",
  };
}
