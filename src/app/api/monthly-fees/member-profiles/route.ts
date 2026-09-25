import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function deriveCourse(description: string) {
  const normalized = normalize(description);
  const hasTeologia = normalized.includes("teologia");
  const hasDesenvolvimento = normalized.includes("desenvolvimento mediunico");

  if (hasTeologia && hasDesenvolvimento) {
    return "Teologia + Desenvolvimento Mediúnico";
  }

  if (hasTeologia) {
    return "Teologia";
  }

  if (hasDesenvolvimento) {
    return "Desenvolvimento Mediúnico";
  }

  return "-";
}

function deriveContributionType(description: string) {
  const normalized = normalize(description);

  if (normalized.includes("combo ouro")) {
    return "Combo Ouro";
  }

  if (normalized.includes("combo prata")) {
    return "Combo Prata";
  }

  if (
    normalized.includes("curso de teologia") ||
    normalized.includes("desenvolvimento mediunico")
  ) {
    return "Curso";
  }

  return "Mensalidade Corrente";
}

function scoreDescription(description: string) {
  const normalized = normalize(description);

  if (normalized.includes("combo ouro")) {
    return 4;
  }

  if (normalized.includes("combo prata")) {
    return 3;
  }

  if (
    normalized.includes("curso de teologia") ||
    normalized.includes("desenvolvimento mediunico")
  ) {
    return 2;
  }

  return 1;
}

function nextDueDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getDate() <= 10 ? today.getMonth() : today.getMonth() + 1;

  return new Date(year, month, 10, 12, 0, 0, 0);
}

function formatContributionType(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;

    const [members, ledgerEntries, monthlyFees] = await Promise.all([
      prisma.member.findMany({
        where: {
          templeId,
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
        },
        orderBy: {
          nome: "asc",
        },
      }),
      prisma.cashLedgerEntry.findMany({
        where: {
          templeId,
          deletedAt: null,
          OR: [
            {
              category: {
                contains: "mensalidade",
                mode: "insensitive",
              },
            },
            {
              description: {
                contains: "mensalidade",
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          contact: true,
          description: true,
          amount: true,
          entryDate: true,
        },
        orderBy: {
          entryDate: "desc",
        },
      }),
      prisma.monthlyFee.findMany({
        where: {
          templeId,
          deletedAt: null,
        },
        select: {
          memberId: true,
          tipoContribuicao: true,
          valor: true,
          vencimento: true,
          observacoes: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }],
      }),
    ]);

    const latestMonthlyFeeByMember = new Map<
      string,
      {
        tipoContribuicao: string | null;
        valor: number;
        vencimento: Date;
        observacoes: string | null;
      }
    >();

    for (const monthlyFee of monthlyFees) {
      if (latestMonthlyFeeByMember.has(monthlyFee.memberId)) {
        continue;
      }

      latestMonthlyFeeByMember.set(monthlyFee.memberId, {
        tipoContribuicao: monthlyFee.tipoContribuicao,
        valor: Number(monthlyFee.valor || 0),
        vencimento: monthlyFee.vencimento,
        observacoes: monthlyFee.observacoes,
      });
    }

    const entriesByName = new Map<
      string,
      Array<{
        amount: number;
        description: string;
        entryDate: Date;
      }>
    >();

    ledgerEntries.forEach((entry) => {
      const contact = entry.contact?.trim();

      if (!contact) {
        return;
      }

      const key = normalize(contact);
      const current = entriesByName.get(key) || [];

      current.push({
        amount: Number(entry.amount || 0),
        description: entry.description,
        entryDate: entry.entryDate,
      });

      entriesByName.set(key, current);
    });

    const dueDate = nextDueDate();

    const profiles = members.map((member) => {
      const entries = entriesByName.get(normalize(member.nome)) || [];
      const manualMonthlyFee = latestMonthlyFeeByMember.get(member.id);

      if (manualMonthlyFee) {
        const derivedManualCourse = deriveCourse(
          `${manualMonthlyFee.tipoContribuicao || ""} ${manualMonthlyFee.observacoes || ""}`
        );
        const referenceEntry = [...entries].sort((left, right) => {
          const scoreDiff = scoreDescription(right.description) - scoreDescription(left.description);

          if (scoreDiff !== 0) {
            return scoreDiff;
          }

          return right.entryDate.getTime() - left.entryDate.getTime();
        })[0];

        return {
          memberId: member.id,
          mensalidade: formatContributionType(manualMonthlyFee.tipoContribuicao),
          valor: manualMonthlyFee.valor,
          curso:
            derivedManualCourse !== "-"
              ? derivedManualCourse
              : referenceEntry
                ? deriveCourse(referenceEntry.description)
                : "-",
          vencimento: manualMonthlyFee.vencimento.toISOString(),
        };
      }

      if (entries.length === 0) {
        return {
          memberId: member.id,
          mensalidade: "-",
          valor: null,
          curso: "-",
          vencimento: dueDate.toISOString(),
        };
      }

      const amountStats = new Map<number, { count: number; latestDate: number }>();

      entries.forEach((entry) => {
        const stat = amountStats.get(entry.amount) || {
          count: 0,
          latestDate: 0,
        };

        stat.count += 1;
        stat.latestDate = Math.max(stat.latestDate, entry.entryDate.getTime());
        amountStats.set(entry.amount, stat);
      });

      const suggestedAmount = [...amountStats.entries()].sort((left, right) => {
        if (right[1].count !== left[1].count) {
          return right[1].count - left[1].count;
        }

        return right[1].latestDate - left[1].latestDate;
      })[0]?.[0] ?? null;

      const referenceEntry = [...entries].sort((left, right) => {
        const scoreDiff = scoreDescription(right.description) - scoreDescription(left.description);

        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return right.entryDate.getTime() - left.entryDate.getTime();
      })[0];

      return {
        memberId: member.id,
        mensalidade: deriveContributionType(referenceEntry.description),
        valor: suggestedAmount,
        curso: deriveCourse(referenceEntry.description),
        vencimento: dueDate.toISOString(),
      };
    });

    return ApiResponse.success(
      serialize({
        profiles,
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
