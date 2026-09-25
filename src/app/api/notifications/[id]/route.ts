import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const notification = await prisma.notification.findFirst({
      where: { id, templeId: user.templeId },
    });

    if (!notification) {
      return ApiResponse.notFound("Notificação não encontrada.");
    }

    return ApiResponse.success(serialize(notification));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();

    if (!body.titulo || !body.mensagem) {
      return ApiResponse.error("Informe título e mensagem.");
    }

    const existing = await prisma.notification.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Notificação não encontrada.");
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        titulo: body.titulo,
        mensagem: body.mensagem,
        lida: body.lida === true || body.lida === "true",
      },
    });

    return ApiResponse.success(serialize(notification));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const existing = await prisma.notification.findFirst({
      where: { id, templeId: user.templeId },
      select: { id: true },
    });

    if (!existing) {
      return ApiResponse.notFound("Notificação não encontrada.");
    }

    await prisma.notification.delete({
      where: { id },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
