import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import { prisma } from "@/lib/prisma";

type OverdueSummaryRow = {
  overdueFees: number | bigint;
  overdueMembers: number | bigint;
  overdueTotal: number | string | { toNumber(): number } | null;
};

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function memberRole(member: {
  hierarchy?: { nome: string } | null;
  classification?: { nome: string } | null;
  memberHierarchies?: Array<{ hierarchy: { nome: string } }>;
  memberClassifications?: Array<{ classification: { nome: string } }>;
}) {
  return normalize(
    [
      member.hierarchy?.nome || "",
      member.classification?.nome || "",
      ...(member.memberHierarchies ?? []).map((item) => item.hierarchy.nome),
      ...(member.memberClassifications ?? []).map(
        (item) => item.classification.nome
      ),
    ].join(" ")
  );
}

function isCurrentWorker(member: Parameters<typeof memberRole>[0]) {
  return memberRole(member).includes(normalize("trabalhador da corrente"));
}

function toNumber(
  value:
    | number
    | bigint
    | string
    | { toNumber(): number }
    | null
    | undefined
) {
  if (!value) {
    return 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return typeof value === "number" ? value : value.toNumber();
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const [overdueFees, overdueTransactions, activeMembers] = await Promise.all([
      prisma.monthlyFee.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
          status: "OVERDUE",
          tipoContribuicao: "MENSALIDADE_CORRENTE",
        },
        select: {
          memberId: true,
          valor: true,
          member: {
            select: {
              status: true,
              nome: true,
              hierarchy: {
                select: {
                  nome: true,
                },
              },
              classification: {
                select: {
                  nome: true,
                },
              },
              memberHierarchies: {
                select: {
                  hierarchy: {
                    select: {
                      nome: true,
                    },
                  },
                },
              },
              memberClassifications: {
                select: {
                  classification: {
                    select: {
                      nome: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.financialTransaction.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
          tipo: "INCOME",
          status: "OVERDUE",
          externalSource: {
            not: "monthly_fee",
          },
          OR: [
            {
              descricao: {
                contains: "mensalidade",
                mode: "insensitive",
              },
            },
            {
              observacoes: {
                contains: "mensalidade",
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          centroCusto: true,
          valor: true,
        },
      }),
      prisma.member.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
          status: "ACTIVE",
        },
        select: {
          id: true,
          nome: true,
          status: true,
          hierarchy: {
            select: {
              nome: true,
            },
          },
          classification: {
            select: {
              nome: true,
            },
          },
          memberHierarchies: {
            select: {
              hierarchy: {
                select: {
                  nome: true,
                },
              },
            },
          },
          memberClassifications: {
            select: {
              classification: {
                select: {
                  nome: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const memberByName = new Map(
      activeMembers.map((member) => [normalize(member.nome), member])
    );

    const filteredFees = overdueFees.filter(
      (fee) => fee.member?.status === "ACTIVE" && isCurrentWorker(fee.member)
    );

    const seenMonthlyFeeMembers = new Set(filteredFees.map((fee) => fee.memberId));

    const mergedEntries = [
      ...filteredFees.map((fee) => ({
        memberId: fee.memberId,
        valor: toNumber(fee.valor),
      })),
      ...overdueTransactions
        .map((transaction) => {
          const member = memberByName.get(normalize(transaction.centroCusto));

          if (!member || !isCurrentWorker(member) || seenMonthlyFeeMembers.has(member.id)) {
            return null;
          }

          return {
            memberId: member.id,
            valor: toNumber(transaction.valor),
          };
        })
        .filter((entry): entry is { memberId: string; valor: number } => Boolean(entry)),
    ];

    const summary: OverdueSummaryRow = {
      overdueFees: mergedEntries.length,
      overdueMembers: new Set(mergedEntries.map((fee) => fee.memberId)).size,
      overdueTotal: mergedEntries.reduce(
        (sum, fee) => sum + fee.valor,
        0
      ),
    };

    return ApiResponse.success({
      overdueFees: toNumber(summary.overdueFees),
      overdueMembers: toNumber(summary.overdueMembers),
      overdueTotal: toNumber(summary.overdueTotal),
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
