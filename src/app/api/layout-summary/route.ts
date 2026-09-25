import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, TransactionType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { isPdvOnlyRoleSet } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { monthBounds } from "@/modules/shared";

type LayoutSummaryRow = {
  paidMonthlyThisMonth: number | bigint;
  newMembersThisMonth: number | bigint;
  roles: string[];
  roleIds: string[];
  isAdmin: boolean;
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

function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function addDaysToDateKey(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function utcDateRangeFromKey(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${addDaysToDateKey(dateKey, 1)}T00:00:00.000Z`),
  };
}

function currentMonthStartKey(dateKey: string) {
  return `${dateKey.slice(0, 8)}01`;
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function openAmount(totalValue: unknown, totalPaid: unknown) {
  return Math.max(Number(totalValue || 0) - Number(totalPaid || 0), 0);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const month = monthBounds(new Date());
    const todayKey = saoPauloDateKey();
    const todayRange = utcDateRangeFromKey(todayKey);
    const monthStartRange = utcDateRangeFromKey(currentMonthStartKey(todayKey));
    const openPayablesWhere = {
      templeId: user.templeId,
      deletedAt: null,
      tipo: TransactionType.EXPENSE,
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
      },
    };
    const openReceivablesWhere = {
      templeId: user.templeId,
      deletedAt: null,
      tipo: TransactionType.INCOME,
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
      },
    };
    const overdueFees = await prisma.monthlyFee.findMany({
      where: {
        templeId: user.templeId,
        deletedAt: null,
        status: "OVERDUE",
        tipoContribuicao: "MENSALIDADE_CORRENTE",
      },
      select: {
        memberId: true,
        member: {
          select: {
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
        },
      },
    });
    const filteredOverdueFees = overdueFees.filter(
      (fee) => fee.member?.status === "ACTIVE" && isCurrentWorker(fee.member)
    );
    const overdueMembersCount = new Set(
      filteredOverdueFees.map((fee) => fee.memberId)
    ).size;
    const overdueMonthlyCount = filteredOverdueFees.length;
    const [
      payablesDueToday,
      payablesOverdueThisMonth,
      receivablesDueToday,
      receivablesOverdueThisMonth,
    ] = await Promise.all([
      prisma.financialTransaction.aggregate({
        where: {
          ...openPayablesWhere,
          vencimento: {
            gte: todayRange.start,
            lt: todayRange.end,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          valor: true,
          amountPaid: true,
        },
      }),
      prisma.financialTransaction.aggregate({
        where: {
          ...openPayablesWhere,
          vencimento: {
            gte: monthStartRange.start,
            lt: todayRange.start,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          valor: true,
          amountPaid: true,
        },
      }),
      prisma.financialTransaction.aggregate({
        where: {
          ...openReceivablesWhere,
          vencimento: {
            gte: todayRange.start,
            lt: todayRange.end,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          valor: true,
          amountPaid: true,
        },
      }),
      prisma.financialTransaction.aggregate({
        where: {
          ...openReceivablesWhere,
          vencimento: {
            gte: monthStartRange.start,
            lt: todayRange.start,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          valor: true,
          amountPaid: true,
        },
      }),
    ]);
    const payablesDueTodayCount = payablesDueToday._count.id;
    const payablesDueTodayTotal = openAmount(
      payablesDueToday._sum.valor,
      payablesDueToday._sum.amountPaid
    );
    const payablesOverdueThisMonthCount = payablesOverdueThisMonth._count.id;
    const payablesOverdueThisMonthTotal = openAmount(
      payablesOverdueThisMonth._sum.valor,
      payablesOverdueThisMonth._sum.amountPaid
    );
    const receivablesDueTodayCount = receivablesDueToday._count.id;
    const receivablesDueTodayTotal = openAmount(
      receivablesDueToday._sum.valor,
      receivablesDueToday._sum.amountPaid
    );
    const receivablesOverdueThisMonthCount = receivablesOverdueThisMonth._count.id;
    const receivablesOverdueThisMonthTotal = openAmount(
      receivablesOverdueThisMonth._sum.valor,
      receivablesOverdueThisMonth._sum.amountPaid
    );

    const [summary] = await prisma.$queryRaw<LayoutSummaryRow[]>`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM "MonthlyFee"
          WHERE "templeId" = ${user.templeId}
            AND "deletedAt" IS NULL
            AND "status" = 'PAID'
            AND "updatedAt" >= ${month.start}
            AND "updatedAt" <= ${month.end}
        ) AS "paidMonthlyThisMonth",
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${user.templeId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${month.start}
            AND "createdAt" <= ${month.end}
        ) AS "newMembersThisMonth",
        COALESCE(
          (
            SELECT ARRAY_AGG("Role"."nome")
            FROM "UserRole"
            INNER JOIN "Role" ON "Role"."id" = "UserRole"."roleId"
            WHERE "UserRole"."userId" = ${user.id}
              AND "Role"."ativo" = true
              AND "Role"."deletedAt" IS NULL
          ),
          ARRAY[]::text[]
        ) AS "roles",
        COALESCE(
          (
            SELECT ARRAY_AGG("Role"."id")
            FROM "UserRole"
            INNER JOIN "Role" ON "Role"."id" = "UserRole"."roleId"
            WHERE "UserRole"."userId" = ${user.id}
              AND "Role"."ativo" = true
              AND "Role"."deletedAt" IS NULL
          ),
          ARRAY[]::text[]
        ) AS "roleIds",
        EXISTS (
          SELECT 1
          FROM "UserRole"
          INNER JOIN "Role" ON "Role"."id" = "UserRole"."roleId"
          WHERE "UserRole"."userId" = ${user.id}
            AND "Role"."ativo" = true
            AND "Role"."deletedAt" IS NULL
            AND "Role"."nome" IN ('Administrador', 'Admin')
        ) AS "isAdmin"
    `;
    let permissions = summary.isAdmin ? ["administrador.total"] : [];

    if (!summary.isAdmin) {
      const [rolePermissions, userPermissions] = await Promise.all([
        prisma.rolePermission.findMany({
          where: {
            roleId: {
              in: summary.roleIds,
            },
          },
          select: {
            permission: {
              select: {
                codigo: true,
                chave: true,
              },
            },
          },
        }),
        prisma.userPermission.findMany({
          where: {
            userId: user.id,
          },
          select: {
            allowed: true,
            permission: {
              select: {
                codigo: true,
                chave: true,
              },
            },
          },
        }),
      ]);
      const codes = new Set(
        rolePermissions
          .map((item) => item.permission.codigo || item.permission.chave)
          .filter(Boolean)
      );

      userPermissions.forEach((item) => {
        const code = item.permission.codigo || item.permission.chave;

        if (!code) {
          return;
        }

        if (item.allowed) {
          codes.add(code);
        } else {
          codes.delete(code);
        }
      });
      permissions = Array.from(codes);
    }
    const isPdvOnlyUser = isPdvOnlyRoleSet(summary.roles);
    const counts = isPdvOnlyUser
      ? {
          overdueMembers: 0,
          overdueMonthlyCount: 0,
          paidMonthlyThisMonth: 0,
          newMembersThisMonth: 0,
        }
      : {
          overdueMembers: overdueMembersCount,
          overdueMonthlyCount,
          paidMonthlyThisMonth: Number(summary.paidMonthlyThisMonth || 0),
          newMembersThisMonth: Number(summary.newMembersThisMonth || 0),
        };
    const notifications = isPdvOnlyUser
      ? []
      : [
          {
            id: "payables-due-today",
            title: "Contas vencendo hoje",
            description: `${payablesDueTodayCount} conta(s) a pagar vencendo hoje. Total: ${money(payablesDueTodayTotal)}.`,
            count: payablesDueTodayCount,
            href: "/dashboard/financeiro?tab=pagar&payablesPage=EM_ABERTO",
          },
          {
            id: "payables-overdue-month",
            title: "Contas vencidas no mês",
            description: `${payablesOverdueThisMonthCount} conta(s) a pagar vencida(s) neste mês. Total: ${money(payablesOverdueThisMonthTotal)}.`,
            count: payablesOverdueThisMonthCount,
            href: "/dashboard/financeiro?tab=pagar&payablesPage=ATRASADAS",
          },
          {
            id: "receivables-due-today",
            title: "Recebimentos vencendo hoje",
            description: `${receivablesDueTodayCount} conta(s) a receber vencendo hoje. Total: ${money(receivablesDueTodayTotal)}.`,
            count: receivablesDueTodayCount,
            href: "/dashboard/financeiro?tab=receber&receivablesPage=EM_ABERTO",
          },
          {
            id: "receivables-overdue-month",
            title: "Recebimentos vencidos no mês",
            description: `${receivablesOverdueThisMonthCount} conta(s) a receber vencida(s) neste mês. Total: ${money(receivablesOverdueThisMonthTotal)}.`,
            count: receivablesOverdueThisMonthCount,
            href: "/dashboard/financeiro?tab=receber&receivablesPage=ATRASADAS",
          },
          {
            id: "overdue-members",
            title: "Mensalistas atrasados",
            description: `${overdueMembersCount} mensalista(s) trabalhador(es) da corrente com ${overdueMonthlyCount} mensalidade(s) vencida(s).`,
            count: overdueMembersCount,
            href: "/dashboard/notificacoes",
          },
          {
            id: "paid-monthly-fees",
            title: "Mensalidades recebidas",
            description: `${Number(
              summary.paidMonthlyThisMonth || 0
            )} mensalidade(s) recebida(s) neste mês.`,
            count: Number(summary.paidMonthlyThisMonth || 0),
            href: "/dashboard/mensalidades",
          },
          {
            id: "new-members",
            title: "Novos cadastros de membros",
            description: `${Number(
              summary.newMembersThisMonth || 0
            )} novo(s) cadastro(s) neste mês.`,
            count: Number(summary.newMembersThisMonth || 0),
            href: "/dashboard/membros",
          },
        ];

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        foto: user.foto,
        cargo: user.cargo,
        templeId: user.templeId,
        status: user.status,
        roles: summary.roles,
        permissions,
      },
      counts,
      notifications,
      monthly: {
        monthStart: month.start,
        monthEnd: month.end,
      },
    });

    if (isPdvOnlyUser) {
      response.cookies.set("accessMode", "pdv", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    } else {
      response.cookies.delete("accessMode");
    }

    return response;
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Erro ao obter dados do layout." },
      { status: 500 }
    );
  }
}
