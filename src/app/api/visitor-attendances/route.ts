import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toNumber } from "@/modules/shared";

function parseDay(value: unknown) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const date = parseDay(searchParams.get("data"));
    const gira = searchParams.get("gira")?.trim();

    const [records, byGira, byDay] = await Promise.all([
      prisma.visitorAttendance.findMany({
        where: {
          templeId: user.templeId,
          deletedAt: null,
          ...(date ? { data: date } : {}),
          ...(gira ? { gira } : {}),
        },
        orderBy: [
          {
            data: "desc",
          },
          {
            gira: "asc",
          },
        ],
      }),
      prisma.visitorAttendance.groupBy({
        by: ["gira"],
        where: {
          templeId: user.templeId,
          deletedAt: null,
        },
        _sum: {
          quantidade: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          gira: "asc",
        },
      }),
      prisma.visitorAttendance.groupBy({
        by: ["data"],
        where: {
          templeId: user.templeId,
          deletedAt: null,
        },
        _sum: {
          quantidade: true,
        },
        orderBy: {
          data: "desc",
        },
      }),
    ]);

    const total = records.reduce((sum, item) => sum + item.quantidade, 0);
    const allTotal = byGira.reduce(
      (sum, item) => sum + (item._sum.quantidade || 0),
      0
    );
    const allCount = byGira.reduce((sum, item) => sum + item._count.id, 0);
    const monthlyTotals = Array.from(
      byDay
        .reduce((totals, item) => {
          const month = item.data.toISOString().slice(0, 7);
          totals.set(month, (totals.get(month) || 0) + (item._sum.quantidade || 0));
          return totals;
        }, new Map<string, number>())
        .entries()
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, total]) => ({ month, total }));

    return ApiResponse.success(
      serialize({
        records,
        summary: {
          selectedTotal: total,
          total: allTotal,
          average: allCount > 0 ? Math.round(allTotal / allCount) : 0,
          byGira: byGira.map((item) => ({
            gira: item.gira,
            total: item._sum.quantidade || 0,
            count: item._count.id,
          })),
          byDay: byDay.map((item) => ({
            date: item.data,
            total: item._sum.quantidade || 0,
          })),
          byMonth: monthlyTotals,
        },
      })
    );
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const data = parseDay(body.data);
    const quantidade = toNumber(body.quantidade);
    const gira = String(body.gira || "").trim();

    if (!data || !gira || quantidade <= 0) {
      return ApiResponse.error("Informe data, gira e quantidade.");
    }

    const record = await prisma.visitorAttendance.upsert({
      where: {
        templeId_data_gira: {
          templeId: user.templeId,
          data,
          gira,
        },
      },
      update: {
        quantidade,
        observacoes: body.observacoes || null,
        deletedAt: null,
      },
      create: {
        templeId: user.templeId,
        data,
        gira,
        quantidade,
        observacoes: body.observacoes || null,
      },
    });

    return ApiResponse.created(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
