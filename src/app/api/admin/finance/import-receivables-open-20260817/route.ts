import { PaymentMethod, PaymentStatus, Prisma, TransactionType } from "@prisma/client";
import { NextRequest } from "next/server";

import receivablesOpenImport from "@/lib/manual-imports/receivables-em-aberto-20260817.json";
import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { toDecimal } from "@/modules/shared";

export const dynamic = "force-dynamic";

const CONFIRMATION = "IMPORTAR_RECEBER_EM_ABERTO_20260817";
const EXTERNAL_SOURCE = "olist:contas-receber";

type ImportRow = (typeof receivablesOpenImport.rows)[number];

function parsePtBrDate(value: string | null | undefined) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
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

function resolvePaymentMethod(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("pix")) return PaymentMethod.PIX;
  if (normalized.includes("boleto")) return PaymentMethod.BOLETO;
  if (normalized.includes("crédito") || normalized.includes("credito")) return PaymentMethod.CARTAO_CREDITO;
  if (normalized.includes("débito") || normalized.includes("debito")) return PaymentMethod.CARTAO_DEBITO;
  if (normalized.includes("transfer")) return PaymentMethod.TRANSFERENCIA;
  if (normalized.includes("dinheiro") || normalized.includes("espécie") || normalized.includes("especie")) {
    return PaymentMethod.DINHEIRO;
  }

  return null;
}

function resolveStatus(row: ImportRow) {
  const normalizedStatus = row.situacao.trim().toLowerCase();

  if (normalizedStatus.includes("cancel")) {
    return PaymentStatus.CANCELED;
  }

  const dueDate = parsePtBrDate(row.dataVencimento);
  const paid = Number(row.recebido || 0);
  const total = Number(row.valorDocumento || 0);
  const balance = Number(row.saldo || 0);

  if (balance <= 0 || (total > 0 && paid >= total)) {
    return PaymentStatus.PAID;
  }

  if (dueDate && dueDate < getTodayDateOnlyStart()) {
    return PaymentStatus.OVERDUE;
  }

  return PaymentStatus.PENDING;
}

function sourcePagesFor(status: PaymentStatus) {
  const pages = new Set<string>(["TODAS", "EM_ABERTO"]);

  if (status === PaymentStatus.OVERDUE) {
    pages.add("ATRASADAS");
  }

  if (status === PaymentStatus.PAID) {
    pages.add("PAGAS");
    pages.delete("EM_ABERTO");
    pages.delete("ATRASADAS");
  }

  return [...pages];
}

function buildNotes(row: ImportRow) {
  return [
    `Origem manual: ${receivablesOpenImport.summary.sourceLabel}`,
    `Arquivo: ${row.sourceFile}`,
    `ID: ${row.externalId}`,
    `Cliente: ${row.cliente}`,
    `Data Emissão: ${row.dataEmissao}`,
    `Data Vencimento: ${row.dataVencimento}`,
    `Data Liquidação: ${row.dataLiquidacao}`,
    `Valor documento: ${row.valorDocumento}`,
    `Saldo: ${row.saldo}`,
    `Situação: ${row.situacao}`,
    `Número documento: ${row.numeroDocumento}`,
    `Número no banco: ${row.numeroBanco}`,
    `Categoria: ${row.categoria}`,
    `Histórico: ${row.historico}`,
    `Forma de recebimento: ${row.formaRecebimento}`,
    `Meio de recebimento: ${row.meioRecebimento}`,
    `Taxas: ${row.taxas}`,
    `Competência: ${row.competencia}`,
    `Recebimento: ${row.recebimento}`,
    `Recebido: ${row.recebido}`,
  ].join(" | ");
}

async function ensureCategories(templeId: string, rows: ImportRow[]) {
  const names = [...new Set(rows.map((row) => row.categoria || "Sem categoria"))];

  await prisma.financialCategory.createMany({
    data: names.map((nome) => ({
      templeId,
      nome,
      descricao: "Categoria criada automaticamente pela importação manual do Olist.",
      ativo: true,
    })),
    skipDuplicates: true,
  });

  const categories = await prisma.financialCategory.findMany({
    where: {
      templeId,
      nome: {
        in: names,
      },
    },
    select: {
      id: true,
      nome: true,
    },
  });

  return new Map(categories.map((category) => [category.nome, category.id]));
}

async function importRows(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const confirm =
      req.nextUrl.searchParams.get("confirm") ||
      (req.method === "POST"
        ? String((await req.json().catch(() => ({})))?.confirm || "")
        : "");

    if (confirm !== CONFIRMATION) {
      return ApiResponse.error(
        `Confirmação inválida. Use confirm=${CONFIRMATION}.`
      );
    }

    const rows = receivablesOpenImport.rows;
    const categoryCache = await ensureCategories(user.templeId, rows);
    const externalIds = rows.map((row) => row.externalId);
    const existingRows = await prisma.financialTransaction.findMany({
      where: {
        templeId: user.templeId,
        externalSource: EXTERNAL_SOURCE,
        externalId: {
          in: externalIds,
        },
      },
      select: {
        id: true,
        externalId: true,
        sourcePages: true,
        sourceFiles: true,
      },
    });
    const existingByExternalId = new Map(
      existingRows
        .filter((row) => row.externalId)
        .map((row) => [row.externalId as string, row])
    );

    let created = 0;
    let updated = 0;
    const creates: Prisma.FinancialTransactionCreateManyInput[] = [];
    const updates: Array<Promise<unknown>> = [];

    for (const row of rows) {
      const categoryId = categoryCache.get(row.categoria || "Sem categoria");

      if (!categoryId) {
        throw new Error(`Categoria não encontrada: ${row.categoria}`);
      }

      const status = resolveStatus(row);
      const existing = existingByExternalId.get(row.externalId);
      const sourcePages = new Set([
        ...(existing?.sourcePages ?? []),
        ...sourcePagesFor(status),
      ]);
      const sourceFiles = new Set([
        ...(existing?.sourceFiles ?? []),
        `manual_olist_receber/${receivablesOpenImport.summary.sourceLabel}`,
        `manual_olist_receber/${receivablesOpenImport.summary.sourceLabel}/${row.sourceFile}`,
      ]);
      const commonData = {
        categoryId,
        descricao: row.historico || row.cliente || `Conta a receber manual #${row.externalId}`,
        centroCusto: row.cliente || null,
        tipo: TransactionType.INCOME,
        valor: toDecimal(Number(row.valorDocumento || 0)),
        metodo: resolvePaymentMethod(row.formaRecebimento),
        status,
        issuedAt: parsePtBrDate(row.dataEmissao),
        competencia: parsePtBrDate(row.competencia),
        rawStatus: row.situacao || null,
        amountPaid: toDecimal(Number(row.recebido || 0)),
        documentNumber: row.numeroDocumento || null,
        paymentReference: row.numeroBanco || row.meioRecebimento || null,
        sourcePages: [...sourcePages],
        sourceFiles: [...sourceFiles],
        vencimento: parsePtBrDate(row.dataVencimento),
        pagamentoEm: parsePtBrDate(row.dataLiquidacao) ?? parsePtBrDate(row.recebimento),
        comprovante: null,
        observacoes: buildNotes(row),
        deletedAt: null,
      };

      if (existing) {
        updated += 1;
        updates.push(
          prisma.financialTransaction.update({
            where: {
              id: existing.id,
            },
            data: commonData,
          })
        );
      } else {
        created += 1;
        creates.push({
          templeId: user.templeId,
          quantidadeParcelas: null,
          valorParcela: null,
          externalSource: EXTERNAL_SOURCE,
          externalId: row.externalId,
          ...commonData,
        });
      }
    }

    for (let index = 0; index < creates.length; index += 250) {
      await prisma.financialTransaction.createMany({
        data: creates.slice(index, index + 250),
        skipDuplicates: true,
      });
    }

    for (let index = 0; index < updates.length; index += 20) {
      await Promise.all(updates.slice(index, index + 20));
    }

    const importedWhere = {
      templeId: user.templeId,
      tipo: TransactionType.INCOME,
      externalSource: EXTERNAL_SOURCE,
      deletedAt: null,
      sourcePages: {
        has: "EM_ABERTO",
      },
    } as const;
    const [count, totals, overdueCount] = await Promise.all([
      prisma.financialTransaction.count({ where: importedWhere }),
      prisma.financialTransaction.aggregate({
        where: importedWhere,
        _sum: {
          valor: true,
          amountPaid: true,
        },
      }),
      prisma.financialTransaction.count({
        where: {
          ...importedWhere,
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
          },
          vencimento: {
            lt: getTodayDateOnlyStart(),
          },
        },
      }),
    ]);
    const totalValor = Number(totals._sum.valor || 0);
    const totalRecebido = Number(totals._sum.amountPaid || 0);

    return ApiResponse.success({
      success: true,
      message: "Contas a receber em aberto importadas com sucesso.",
      expected: receivablesOpenImport.summary,
      created,
      updated,
      count,
      overdueCount,
      totalValor,
      totalRecebido,
      totalSaldo: Number((totalValor - totalRecebido).toFixed(2)),
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function GET(req: NextRequest) {
  return importRows(req);
}

export async function POST(req: NextRequest) {
  return importRows(req);
}
