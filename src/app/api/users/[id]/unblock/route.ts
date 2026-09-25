import { NextRequest } from "next/server";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: "ACTIVE",
        bloqueadoEm: null,
        bloqueadoMotivo: null,
        tentativasLogin: 0,
      },
      select: { id: true, status: true },
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        userId: id,
        actorUserId: actor.id,
        acao: "desbloquear_usuario",
        descricao: "Usuário desbloqueado.",
        valorNovo: user,
        ip,
        userAgent,
      },
    });

    return ApiResponse.success(user);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
