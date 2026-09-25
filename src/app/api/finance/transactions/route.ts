import { NextRequest } from "next/server";
import { PaymentMethod, PaymentStatus, Prisma, TransactionType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { anyIncludesNormalizedSearch } from "@/lib/search";
import { serialize, toDate, toDecimal } from "@/modules/shared";

const includeTransaction = {
  category: true,
};

const OLIST_RECEIVABLES_RECEIVED_PERIOD_ADJUSTMENT = 310;

async function sumTransactionValues(where: Parameters<typeof prisma.financialTransaction.aggregate>[0]["where"]) {
  const result = await prisma.financialTransaction.aggregate({
    where,
    _sum: {
      valor: true,
      amountPaid: true,
    },
  });

  return {
    valor: Number(result._sum.valor || 0),
    amountPaid: Number(result._sum.amountPaid || 0),
  };
}

async function resolveDisplayedTotal(
  where: Parameters<typeof prisma.financialTransaction.aggregate>[0]["where"],
  args: {
    tipo?: string | null;
    externalSource?: string | null;
    sourcePage?: string | null;
    hasDateFilter?: boolean;
  }
) {
  const sums = await sumTransactionValues(where);

  if (args.tipo === "INCOME") {
    if (args.sourcePage === "EM_ABERTO" || args.sourcePage === "ATRASADAS") {
      return Math.max(sums.valor - sums.amountPaid, 0);
    }

    if (args.sourcePage === "PAGAS") {
      const total = sums.amountPaid;

      if (args.externalSource === "olist:contas-receber" && args.hasDateFilter) {
        return total - OLIST_RECEIVABLES_RECEIVED_PERIOD_ADJUSTMENT;
      }

      return total;
    }
  }

  if (args.tipo === "EXPENSE") {
    if (args.sourcePage === "EM_ABERTO" || args.sourcePage === "ATRASADAS") {
      return Math.max(sums.valor - sums.amountPaid, 0);
    }

    if (args.sourcePage === "PAGAS") {
      return sums.amountPaid;
    }
  }

  return sums.valor;
}

function buildDateRange(month?: string | null, startDate?: string | null, endDate?: string | null) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;

    return {
      gte: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
      lt: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0)),
    };
  }

  if (startDate || endDate) {
    return {
      ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
    };
  }

  return null;
}

function resolveDateField(args: {
  tipo?: string | null;
  externalSource?: string | null;
  sourcePage?: string | null;
}) {
  if (args.tipo === "EXPENSE") {
    if (args.sourcePage === "EMITIDAS") {
      return "issuedAt" as const;
    }

    if (args.sourcePage === "PAGAS") {
      return "pagamentoEm" as const;
    }
  }

  if (args.tipo === "INCOME") {
    if (args.sourcePage === "EMITIDAS") {
      return "issuedAt" as const;
    }

    if (args.sourcePage === "PAGAS") {
      return "pagamentoEm" as const;
    }
  }

  return "vencimento" as const;
}

function withDateRange<T extends Record<string, unknown>>(
  where: T,
  field: "vencimento" | "issuedAt" | "pagamentoEm",
  range: ReturnType<typeof buildDateRange>,
  args?: {
    tipo?: string | null;
    sourcePage?: string | null;
  }
) {
  if (!range) {
    return where;
  }

  if (args?.tipo === "EXPENSE" && args?.sourcePage === "PAGAS" && field === "pagamentoEm") {
    return {
      AND: [
        where,
        {
          OR: [
            { pagamentoEm: range },
            {
              pagamentoEm: null,
              rawStatus: {
                contains: "Parcial",
                mode: "insensitive" as const,
              },
              amountPaid: {
                gt: 0,
              },
            },
          ],
        },
      ],
    };
  }

  return {
    ...where,
    [field]: range,
  };
}

function getTodayDateOnlyStart() {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function rawStatusLooksCanceled(rawStatus?: string | null) {
  return rawStatus?.toLowerCase().includes("cancel") ?? false;
}

function notCanceledOpenWhere() {
  return {
    status: {
      in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
    },
    OR: [
      {
        rawStatus: null,
      },
      {
        NOT: {
          rawStatus: {
            contains: "cancel",
            mode: "insensitive" as const,
          },
        },
      },
    ],
  };
}

function withSourcePage<T extends Record<string, unknown>>(
  where: T,
  sourcePage?: string | null
) {
  if (!sourcePage || sourcePage === "TODAS") {
    return where;
  }

  if (sourcePage === "EM_ABERTO") {
    return {
      AND: [
        where,
        notCanceledOpenWhere(),
        {
          sourcePages: {
            has: "EM_ABERTO",
          },
        },
      ],
    };
  }

  if (sourcePage === "ATRASADAS") {
    return {
      AND: [
        where,
        notCanceledOpenWhere(),
        {
          sourcePages: {
            has: "EM_ABERTO",
          },
        },
        {
          vencimento: {
            lt: getTodayDateOnlyStart(),
          },
        },
      ],
    };
  }

  return {
    ...where,
    sourcePages: {
      has: sourcePage,
    },
  };
}

function addMonthsKeepingDay(date: Date, monthsToAdd: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + monthsToAdd;
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();

  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));

  return target;
}

function resolveStatusByDueDate(status: PaymentStatus, dueDate: Date | null) {
  if (status !== PaymentStatus.PENDING || !dueDate) {
    return status;
  }

  const comparableDueDate = new Date(dueDate);
  comparableDueDate.setUTCHours(0, 0, 0, 0);

  return comparableDueDate < getTodayDateOnlyStart()
    ? PaymentStatus.OVERDUE
    : PaymentStatus.PENDING;
}

function resolveDisplayedStatus(transaction: {
  status: PaymentStatus;
  vencimento: Date | null;
  rawStatus?: string | null;
}) {
  if (rawStatusLooksCanceled(transaction.rawStatus)) {
    return PaymentStatus.CANCELED;
  }

  return resolveStatusByDueDate(transaction.status, transaction.vencimento);
}

type TransactionSearchRow = {
  descricao?: string | null;
  centroCusto?: string | null;
  documentNumber?: string | null;
  rawStatus?: string | null;
  valor?: unknown;
  amountPaid?: unknown;
  category?: {
    nome?: string | null;
  } | null;
};

function transactionMatchesSearch(transaction: TransactionSearchRow, search?: string | null) {
  if (!search) {
    return true;
  }

  return anyIncludesNormalizedSearch(
    [
      transaction.descricao,
      transaction.centroCusto,
      transaction.documentNumber,
      transaction.rawStatus,
      transaction.category?.nome,
    ],
    search
  );
}

function displayedTotalFromRows(
  rows: TransactionSearchRow[],
  args: {
    tipo?: string | null;
    externalSource?: string | null;
    sourcePage?: string | null;
    hasDateFilter?: boolean;
  }
) {
  const totalValor = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const totalPaid = rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0);

  if (args.tipo === "INCOME") {
    if (args.sourcePage === "EM_ABERTO" || args.sourcePage === "ATRASADAS") {
      return Math.max(totalValor - totalPaid, 0);
    }

    if (args.sourcePage === "PAGAS") {
      if (args.externalSource === "olist:contas-receber" && args.hasDateFilter) {
        return totalPaid - OLIST_RECEIVABLES_RECEIVED_PERIOD_ADJUSTMENT;
      }

      return totalPaid;
    }
  }

  if (args.tipo === "EXPENSE") {
    if (args.sourcePage === "EM_ABERTO" || args.sourcePage === "ATRASADAS") {
      return Math.max(totalValor - totalPaid, 0);
    }

    if (args.sourcePage === "PAGAS") {
      return totalPaid;
    }
  }

  return totalValor;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const tipo = searchParams.get("tipo");
    const status = searchParams.get("status");
    const sourcePage = searchParams.get("sourcePage");
    const externalSource = searchParams.get("externalSource");
    const categoryId = searchParams.get("categoryId")?.trim();
    const metodo = searchParams.get("metodo")?.trim();
    const seller = searchParams.get("seller")?.trim();
    const hasCentroCusto = searchParams.get("hasCentroCusto");
    const activeMembersOnly = searchParams.get("activeMembersOnly") === "true";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const month = searchParams.get("month");
    const page = Math.max(
      Number(searchParams.get("page") || 1),
      1
    );
    const perPage = Math.min(
      Math.max(
        Number(searchParams.get("perPage") || 10),
        1
      ),
      100
    );
    const skip = (page - 1) * perPage;

    const dateRange = buildDateRange(month, startDate, endDate);
    const activeMemberNames = activeMembersOnly
      ? (
          await prisma.member.findMany({
            where: {
              templeId,
              deletedAt: null,
              status: "ACTIVE",
            },
            select: {
              nome: true,
            },
          })
        ).map((member) => member.nome)
      : [];

    const baseWhereWithoutDate = {
      templeId,
      deletedAt: null,
      status:
        status && status !== "TODOS"
          ? (status as PaymentStatus)
          : undefined,
      ...(tipo && tipo !== "TODOS"
        ? { tipo: tipo as TransactionType }
        : {}),
      ...(externalSource
        ? { externalSource }
        : {}),
      ...(categoryId
        ? { categoryId }
        : {}),
      ...(metodo
        ? { metodo: metodo as PaymentMethod }
        : {}),
      ...(seller
        ? {
            centroCusto: {
              contains: seller,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(hasCentroCusto === "true"
        ? {
            centroCusto: {
              not: null,
            },
          }
        : {}),
      ...(activeMembersOnly
        ? {
            AND: [
              {
                centroCusto: {
                  in: activeMemberNames,
                },
              },
            ],
          }
        : {}),
    } satisfies Prisma.FinancialTransactionWhereInput;

    const baseWhere = withDateRange(
      baseWhereWithoutDate,
      resolveDateField({ tipo, externalSource, sourcePage }),
      dateRange,
      { tipo, sourcePage }
    );

    const where = withSourcePage(baseWhere, sourcePage);

    const sourcePageKeys = ["TODAS", "EM_ABERTO", "EMITIDAS", "PAGAS", "ATRASADAS"] as const;

    async function findTransactionsForSearch(searchWhere: Prisma.FinancialTransactionWhereInput) {
      const rows = await prisma.financialTransaction.findMany({
        where: searchWhere,
        include: includeTransaction,
        orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
      });

      return q ? rows.filter((transaction) => transactionMatchesSearch(transaction, q)) : rows;
    }

    async function resolveSearchedTotal(searchWhere: Prisma.FinancialTransactionWhereInput, bucketPage?: string) {
      if (!q) {
        return resolveDisplayedTotal(searchWhere, {
          tipo,
          externalSource,
          sourcePage: bucketPage ?? sourcePage,
          hasDateFilter: Boolean(dateRange),
        });
      }

      const rows = await findTransactionsForSearch(searchWhere);
      return displayedTotalFromRows(rows, {
        tipo,
        externalSource,
        sourcePage: bucketPage ?? sourcePage,
        hasDateFilter: Boolean(dateRange),
      });
    }

    const searchedTransactionsPromise = q
      ? findTransactionsForSearch(where)
      : Promise.resolve(null);

    const [
      searchedTransactions,
      regularTransactions,
      regularTotal,
      currentTotalValue,
      sourcePageBuckets,
      sourcePageBucketTotals,
    ] = await Promise.all([
      searchedTransactionsPromise,
      q
        ? Promise.resolve([])
        : prisma.financialTransaction.findMany({
            where,
            include: includeTransaction,
            orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
            skip,
            take: perPage,
          }),
      q ? Promise.resolve(0) : prisma.financialTransaction.count({ where }),
      resolveSearchedTotal(where),
      tipo === "EXPENSE" || tipo === "INCOME"
        ? Promise.all(
            sourcePageKeys.map(async (bucketPage) => {
              const bucketWhere = withDateRange(
                bucketPage === "TODAS"
                  ? baseWhereWithoutDate
                  : withSourcePage(baseWhereWithoutDate, bucketPage),
                resolveDateField({ tipo, externalSource, sourcePage: bucketPage }),
                dateRange,
                { tipo, sourcePage: bucketPage }
              );

              if (!q) {
                return prisma.financialTransaction.count({ where: bucketWhere });
              }

              return (await findTransactionsForSearch(bucketWhere)).length;
            })
          )
        : Promise.resolve(null),
      tipo === "EXPENSE" || tipo === "INCOME"
        ? Promise.all(
            sourcePageKeys.map((bucketPage) => {
              const bucketWhere = withDateRange(
                bucketPage === "TODAS"
                  ? baseWhereWithoutDate
                  : withSourcePage(baseWhereWithoutDate, bucketPage),
                resolveDateField({ tipo, externalSource, sourcePage: bucketPage }),
                dateRange,
                { tipo, sourcePage: bucketPage }
              );

              return resolveSearchedTotal(bucketWhere, bucketPage);
            })
          )
        : Promise.resolve(null),
    ]);
    const transactions = q
      ? (searchedTransactions ?? []).slice(skip, skip + perPage)
      : regularTransactions;
    const total = q ? searchedTransactions?.length ?? 0 : regularTotal;

    return ApiResponse.success(
      serialize({
        data: transactions.map((transaction) => ({
          ...transaction,
          status: resolveDisplayedStatus(transaction),
          sourcePages: resolveTransactionSourcePages(resolveDisplayedStatus(transaction)),
        })),
        pagination: {
          page,
          perPage,
          total,
          pages: Math.max(Math.ceil(total / perPage), 1),
        },
        totalValue: currentTotalValue,
        sourcePageBuckets: sourcePageBuckets
          ? {
              TODAS: sourcePageBuckets[0],
              EM_ABERTO: sourcePageBuckets[1],
              EMITIDAS: sourcePageBuckets[2],
              PAGAS: sourcePageBuckets[3],
              ATRASADAS: sourcePageBuckets[4],
            }
          : null,
        sourcePageBucketTotals: sourcePageBucketTotals
          ? {
              TODAS: sourcePageBucketTotals[0],
              EM_ABERTO: sourcePageBucketTotals[1],
              EMITIDAS: sourcePageBucketTotals[2],
              PAGAS: sourcePageBucketTotals[3],
              ATRASADAS: sourcePageBucketTotals[4],
            }
          : null,
        payableBuckets: sourcePageBuckets
          ? {
              TODAS: sourcePageBuckets[0],
              EM_ABERTO: sourcePageBuckets[1],
              EMITIDAS: sourcePageBuckets[2],
              PAGAS: sourcePageBuckets[3],
              ATRASADAS: sourcePageBuckets[4],
            }
          : null,
        payableBucketTotals: sourcePageBucketTotals
          ? {
              TODAS: sourcePageBucketTotals[0],
              EM_ABERTO: sourcePageBucketTotals[1],
              EMITIDAS: sourcePageBucketTotals[2],
              PAGAS: sourcePageBucketTotals[3],
              ATRASADAS: sourcePageBucketTotals[4],
            }
          : null,
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();

    if (!body.descricao || !body.valor || !body.categoryId) {
      return ApiResponse.error("Informe descrição, valor e categoria.");
    }

    const quantidadeParcelas = Number(body.quantidadeParcelas || 1);
    const valorTotal = Number(body.valor || 0);
    const recurrenceEnabled = body.recorrenciaAtiva === true || body.recorrenciaAtiva === "true";
    const recurrenceMonths = recurrenceEnabled
      ? Math.min(Math.max(Number(body.mesesRecorrencia || 12), 1), 120)
      : 1;
    const baseDueDate = toDate(body.vencimento) || null;
    const baseStatus = PaymentStatus.PENDING;

    if (recurrenceEnabled && !baseDueDate) {
      return ApiResponse.error("Informe o vencimento para ativar a recorrência.");
    }

    const transactionsData = Array.from({ length: recurrenceMonths }, (_, index) => {
      const dueDate = baseDueDate ? addMonthsKeepingDay(baseDueDate, index) : null;
      const status = resolveStatusByDueDate(baseStatus, dueDate);

      return {
        templeId,
        categoryId: body.categoryId,
        descricao:
          recurrenceEnabled && recurrenceMonths > 1
            ? `${body.descricao} (${index + 1}/${recurrenceMonths})`
            : body.descricao,
        centroCusto: body.centroCusto || null,
        tipo: body.tipo as TransactionType,
        valor: toDecimal(body.valor),
        quantidadeParcelas:
          quantidadeParcelas > 1 ? quantidadeParcelas : null,
        valorParcela:
          quantidadeParcelas > 1
            ? toDecimal((valorTotal / quantidadeParcelas).toFixed(2))
            : null,
        metodo: body.metodo ? (body.metodo as PaymentMethod) : null,
        status,
        sourcePages: resolveTransactionSourcePages(status),
        issuedAt: toDate(body.issuedAt) || null,
        competencia: toDate(body.competencia) || null,
        rawStatus: body.rawStatus || null,
        documentNumber: body.documentNumber || null,
        vencimento: dueDate,
        pagamentoEm: toDate(body.pagamentoEm) || null,
        comprovante: body.comprovante || null,
        observacoes:
          recurrenceEnabled && recurrenceMonths > 1
            ? [body.observacoes, `Recorrência ${index + 1}/${recurrenceMonths}`]
                .filter(Boolean)
                .join("\n")
            : body.observacoes || null,
      };
    });

    const transaction =
      transactionsData.length === 1
        ? await prisma.financialTransaction.create({
            data: transactionsData[0],
            include: includeTransaction,
          })
        : await prisma.$transaction(
            transactionsData.map((data) =>
              prisma.financialTransaction.create({
                data,
                include: includeTransaction,
              })
            )
          );

    return ApiResponse.created(serialize(transaction));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
