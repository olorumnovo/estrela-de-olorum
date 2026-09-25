import { NextRequest } from "next/server";
import { PaymentMethod, PaymentStatus, Prisma, TransactionType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toDate, toDecimal } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const includeTransaction = {
  category: true,
};

function parseRecurrence(description: string) {
  const match = description.trim().match(/^(.*)\s+\((\d+)\/(\d+)\)$/);

  if (!match) {
    return null;
  }

  return {
    baseDescription: match[1].trim(),
    current: Number(match[2]),
    total: Number(match[3]),
  };
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function recurrenceBaseDescription(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return parseRecurrence(value)?.baseDescription || value.trim();
}

function addMonthsKeepingDay(date: Date, months: number) {
  const nextDate = new Date(date);
  const originalDay = nextDate.getUTCDate();

  nextDate.setUTCMonth(nextDate.getUTCMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, 0)
  ).getUTCDate();
  nextDate.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));

  return nextDate;
}

function diffMonths(from: Date, to: Date) {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
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

function resolveAutomaticStatus(
  currentStatus: PaymentStatus,
  dueDate: Date | null
) {
  if (currentStatus === PaymentStatus.PAID || currentStatus === PaymentStatus.CANCELED) {
    return currentStatus;
  }

  if (!dueDate) {
    return PaymentStatus.PENDING;
  }

  const comparableDueDate = new Date(dueDate);
  comparableDueDate.setUTCHours(0, 0, 0, 0);

  return comparableDueDate < getTodayDateOnlyStart()
    ? PaymentStatus.OVERDUE
    : PaymentStatus.PENDING;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    if (!body.descricao || !body.valor || !body.categoryId) {
      return ApiResponse.error("Informe descrição, valor e categoria.");
    }

    const existing = await prisma.financialTransaction.findFirst({
      where: { id, templeId: user.templeId },
      select: {
        id: true,
        categoryId: true,
        status: true,
        tipo: true,
        descricao: true,
        centroCusto: true,
        observacoes: true,
        vencimento: true,
        externalSource: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Lançamento não encontrado.");
    }

    const quantidadeParcelas = Number(body.quantidadeParcelas || 1);
    const valorTotal = Number(body.valor || 0);
    const dueDate = toDate(body.vencimento) || null;
    const automaticStatus = resolveAutomaticStatus(existing.status, dueDate);
    const updateData = {
      categoryId: body.categoryId,
      descricao: body.descricao,
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
      status: automaticStatus,
      sourcePages: resolveTransactionSourcePages(automaticStatus),
      issuedAt: toDate(body.issuedAt) || null,
      competencia: toDate(body.competencia) || null,
      rawStatus: body.rawStatus || null,
      documentNumber: body.documentNumber || null,
      vencimento: dueDate,
      pagamentoEm: toDate(body.pagamentoEm) || null,
      comprovante: body.comprovante || null,
      observacoes: body.observacoes || null,
    };
    const applyFutureRecurrence =
      body.applyFutureRecurrence === true ||
      body.applyFutureRecurrence === "true";
    const recurrence = parseRecurrence(existing.descricao);
    const hasRecurrenceNote = (existing.observacoes || "")
      .toLowerCase()
      .includes("recorrência");

    if (applyFutureRecurrence) {
      const futureUpdates: Prisma.PrismaPromise<unknown>[] = [];

      if (recurrence && hasRecurrenceNote) {
        const recurringTransactions = await prisma.financialTransaction.findMany({
          where: {
            templeId: user.templeId,
            id: { not: id },
            tipo: existing.tipo,
            deletedAt: null,
            externalSource: null,
            centroCusto: existing.centroCusto,
            descricao: {
              startsWith: `${recurrence.baseDescription} (`,
            },
            observacoes: {
              contains: "Recorrência",
            },
          },
          select: {
            id: true,
            descricao: true,
            status: true,
          },
        });

        recurringTransactions
          .map((item) => ({
            ...item,
            recurrence: parseRecurrence(item.descricao),
          }))
          .filter(
            (item) =>
              item.recurrence &&
              item.recurrence.current > recurrence.current &&
              item.status !== PaymentStatus.PAID &&
              item.status !== PaymentStatus.CANCELED
          )
          .forEach((item) => {
            const currentIndex = item.recurrence?.current || recurrence.current;
            const nextDueDate =
              dueDate && currentIndex >= recurrence.current
                ? addMonthsKeepingDay(dueDate, currentIndex - recurrence.current)
                : dueDate;
            const nextStatus = resolveAutomaticStatus(item.status, nextDueDate);

            futureUpdates.push(prisma.financialTransaction.update({
              where: { id: item.id },
              data: {
                ...updateData,
                descricao: `${body.descricao} (${currentIndex}/${recurrence.total})`,
                status: nextStatus,
                sourcePages: resolveTransactionSourcePages(nextStatus),
                vencimento: nextDueDate,
                observacoes: [
                  body.observacoes,
                  `Recorrência ${currentIndex}/${recurrence.total}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            }));
          });
      } else if (existing.vencimento && existing.centroCusto) {
        const existingCustomer = normalizeText(existing.centroCusto);
        const existingBaseDescription = normalizeText(
          recurrenceBaseDescription(existing.descricao)
        );
        const recurringTransactions = await prisma.financialTransaction.findMany({
          where: {
            templeId: user.templeId,
            id: { not: id },
            tipo: existing.tipo,
            deletedAt: null,
            vencimento: {
              gte: existing.vencimento,
            },
            status: {
              notIn: [PaymentStatus.PAID, PaymentStatus.CANCELED],
            },
          },
          select: {
            id: true,
            descricao: true,
            centroCusto: true,
            status: true,
            vencimento: true,
          },
        });

        recurringTransactions
          .filter((item) => {
            const itemCustomer = normalizeText(item.centroCusto);
            const itemBaseDescription = normalizeText(
              recurrenceBaseDescription(item.descricao)
            );
            const sameCustomer = itemCustomer === existingCustomer;
            const sameHistory =
              itemBaseDescription === existingBaseDescription ||
              itemBaseDescription.includes(existingBaseDescription) ||
              existingBaseDescription.includes(itemBaseDescription);

            return sameCustomer && sameHistory;
          })
          .forEach((item) => {
            const parsed = parseRecurrence(item.descricao);
            const monthOffset =
              item.vencimento && existing.vencimento
                ? Math.max(diffMonths(existing.vencimento, item.vencimento), 0)
                : 0;
            const nextDueDate = dueDate
              ? addMonthsKeepingDay(dueDate, monthOffset)
              : item.vencimento;
            const nextStatus = resolveAutomaticStatus(item.status, nextDueDate);

            futureUpdates.push(prisma.financialTransaction.update({
              where: { id: item.id },
              data: {
                ...updateData,
                descricao: parsed
                  ? `${body.descricao} (${parsed.current}/${parsed.total})`
                  : body.descricao,
                status: nextStatus,
                sourcePages: resolveTransactionSourcePages(nextStatus),
                vencimento: nextDueDate,
                observacoes: parsed
                  ? [
                      body.observacoes,
                      `Recorrência ${parsed.current}/${parsed.total}`,
                    ]
                      .filter(Boolean)
                      .join("\n")
                  : updateData.observacoes,
              },
            }));
          });
      }

      await prisma.$transaction([
        prisma.financialTransaction.update({
          where: { id },
          data: updateData,
        }),
        ...futureUpdates,
      ]);
    } else {
      await prisma.financialTransaction.update({
        where: { id },
        data: updateData,
      });
    }

    const transaction = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id },
      include: includeTransaction,
    });

    return ApiResponse.success(serialize(transaction));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const scope = req.nextUrl.searchParams.get("scope");
    const deleteFutureRecurrence = scope === "future";

    const existing = await prisma.financialTransaction.findFirst({
      where: { id, templeId: user.templeId },
      select: {
        id: true,
        tipo: true,
        status: true,
        descricao: true,
        centroCusto: true,
        observacoes: true,
        vencimento: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Lançamento não encontrado.");
    }

    const deletedAt = new Date();

    if (deleteFutureRecurrence && existing.vencimento) {
      const recurrence = parseRecurrence(existing.descricao);
      const hasRecurrenceNote = (existing.observacoes || "")
        .toLowerCase()
        .includes("recorrência");
      const candidateTransactions = await prisma.financialTransaction.findMany({
        where: {
          templeId: user.templeId,
          tipo: existing.tipo,
          deletedAt: null,
          vencimento: {
            gte: existing.vencimento,
          },
          status: {
            notIn: [PaymentStatus.PAID, PaymentStatus.CANCELED],
          },
        },
        select: {
          id: true,
          descricao: true,
          centroCusto: true,
          observacoes: true,
          vencimento: true,
        },
      });
      const existingCustomer = normalizeText(existing.centroCusto);
      const existingBaseDescription = normalizeText(
        recurrenceBaseDescription(existing.descricao)
      );
      const idsToDelete = candidateTransactions
        .filter((item) => {
          if (item.id === id) {
            return true;
          }

          if (recurrence && hasRecurrenceNote) {
            const itemRecurrence = parseRecurrence(item.descricao);
            const itemHasRecurrenceNote = (item.observacoes || "")
              .toLowerCase()
              .includes("recorrência");

            return Boolean(
              itemRecurrence &&
                itemHasRecurrenceNote &&
                itemRecurrence.current > recurrence.current &&
                itemRecurrence.total === recurrence.total &&
                normalizeText(item.centroCusto) === existingCustomer &&
                normalizeText(itemRecurrence.baseDescription) === existingBaseDescription
            );
          }

          const itemCustomer = normalizeText(item.centroCusto);
          const itemBaseDescription = normalizeText(
            recurrenceBaseDescription(item.descricao)
          );
          const sameCustomer = itemCustomer === existingCustomer;
          const sameHistory =
            itemBaseDescription === existingBaseDescription ||
            itemBaseDescription.includes(existingBaseDescription) ||
            existingBaseDescription.includes(itemBaseDescription);

          return sameCustomer && sameHistory;
        })
        .map((item) => item.id);

      if (idsToDelete.length) {
        const result = await prisma.financialTransaction.updateMany({
          where: {
            id: {
              in: idsToDelete,
            },
            templeId: user.templeId,
          },
          data: {
            deletedAt,
          },
        });

        return ApiResponse.success({ success: true, deleted: result.count });
      }
    }

    await prisma.financialTransaction.update({
      where: { id },
      data: { deletedAt },
    });

    return ApiResponse.success({ success: true, deleted: 1 });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
