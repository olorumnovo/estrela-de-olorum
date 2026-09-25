import { NextRequest } from "next/server";
import { ScheduleStatus, ScheduleType } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toStringList } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const includeParticipants = {
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
};

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

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const schedule = await prisma.schedule.findFirst({
      where: { id, templeId: user.templeId },
      include: includeParticipants,
    });

    if (!schedule) {
      return ApiResponse.notFound("Agenda não encontrada.");
    }

    return ApiResponse.success(serialize(withParticipantes(schedule)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === "duplicate") {
      const source = await prisma.schedule.findUnique({
        where: { id },
        include: { attendances: true },
      });

      if (!source || source.templeId !== user.templeId) {
        return ApiResponse.notFound("Agenda não encontrada.");
      }

      const copy = await prisma.schedule.create({
        data: {
          templeId: source.templeId,
          titulo: `${source.titulo} (cópia)`,
          descricao: source.descricao,
          tipo: source.tipo,
          status: "AGENDADO",
          inicio: source.inicio,
          fim: source.fim,
          local: source.local,
          responsavel: source.responsavel,
          observacoes: source.observacoes,
          attendances: {
            create: source.attendances.map((item) => ({
              memberId: item.memberId,
              presente: item.presente,
              observacao: item.observacao,
            })),
          },
        },
        include: includeParticipants,
      });

      return ApiResponse.success(serialize(withParticipantes(copy)));
    }

    if (action === "cancel") {
      const existing = await prisma.schedule.findFirst({
        where: { id, templeId: user.templeId },
        select: { id: true },
      });

      if (!existing) {
        return ApiResponse.notFound("Agenda não encontrada.");
      }

      const canceled = await prisma.schedule.update({
        where: { id },
        data: { status: "CANCELADO" },
        include: includeParticipants,
      });

      return ApiResponse.success(serialize(withParticipantes(canceled)));
    }

    const inicio = parseDateOnlyAtUtcNoon(body.inicio);
    const fim = parseDateOnlyAtUtcNoon(body.fim) ?? (inicio ? endOfScheduleDay(inicio) : undefined);

    if (!body.titulo || !inicio || !fim) {
      return ApiResponse.error("Informe título e data do evento.");
    }

    await prisma.attendance.deleteMany({
      where: { scheduleId: id },
    });

    const existing = await prisma.schedule.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Agenda não encontrada.");
    }

    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
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
      include: includeParticipants,
    });

    return ApiResponse.success(serialize(withParticipantes(schedule)));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.schedule.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Agenda não encontrada.");
    }

    await prisma.schedule.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
