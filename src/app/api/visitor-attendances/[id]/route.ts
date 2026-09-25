import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize, toNumber } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

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

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const data = parseDay(body.data);
    const quantidade = toNumber(body.quantidade);
    const gira = String(body.gira || "").trim();

    if (!data || !gira || quantidade <= 0) {
      return ApiResponse.error("Informe data, gira e quantidade.");
    }

    const existing = await prisma.visitorAttendance.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Registro não encontrado.");
    }

    const record = await prisma.visitorAttendance.update({
      where: {
        id,
      },
      data: {
        data,
        gira,
        quantidade,
        observacoes: body.observacoes || null,
      },
    });

    return ApiResponse.success(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.visitorAttendance.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return ApiResponse.notFound("Registro não encontrado.");
    }

    await prisma.visitorAttendance.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
