import { NextRequest } from "next/server";
import { ScheduleStatus, ScheduleType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toStringList } from "@/modules/shared";

type ScheduleWithParticipants = {
  inicio: Date;
  fim: Date;
  attendances: Array<{
    memberId: string;
  }>;
};

function dateInputFromSaoPaulo(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function parseDateOnlyAtUtcNoon(value: unknown) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function endOfScheduleDay(date: Date) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  ));
}

function withParticipantes<T extends ScheduleWithParticipants>(schedule: T) {
  return {
    ...schedule,
    inicio: dateInputFromSaoPaulo(schedule.inicio),
    fim: dateInputFromSaoPaulo(schedule.fim),
    participantes: schedule.attendances.map((item) => item.memberId),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const tipo = searchParams.get("tipo");
    const status = searchParams.get("status");

    const schedules = await prisma.schedule.findMany({
      where: {
        templeId,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { titulo: { contains: q, mode: "insensitive" } },
                { descricao: { contains: q, mode: "insensitive" } },
                { local: { contains: q, mode: "insensitive" } },
                { responsavel: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(tipo && tipo !== "TODOS"
          ? { tipo: tipo as ScheduleType }
          : {}),
        ...(status && status !== "TODOS"
          ? { status: status as ScheduleStatus }
          : {}),
      },
      include: {
        attendances: {
          include: {
            member: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
      orderBy: {
        inicio: "asc",
      },
    });

    return ApiResponse.success(serialize(schedules.map(withParticipantes)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();
    const inicio = parseDateOnlyAtUtcNoon(body.inicio);
    const fim = parseDateOnlyAtUtcNoon(body.fim) ?? (inicio ? endOfScheduleDay(inicio) : undefined);

    if (!body.titulo || !inicio || !fim) {
      return ApiResponse.error("Informe título e data do evento.");
    }

    const schedule = await prisma.schedule.create({
      data: {
        templeId,
        titulo: body.titulo,
        descricao: body.descricao || null,
        tipo: body.tipo as ScheduleType,
        status: (body.status || "AGENDADO") as ScheduleStatus,
        inicio,
        fim,
        local: null,
        responsavel: body.responsavel || null,
        observacoes: body.observacoes || null,
        attendances: {
          create: toStringList(body.participantes).map((memberId) => ({
            memberId,
          })),
        },
      },
      include: {
        attendances: {
          include: {
            member: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
    });

    return ApiResponse.created(serialize(withParticipantes(schedule)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
