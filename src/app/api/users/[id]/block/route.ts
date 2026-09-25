import { NextRequest } from "next/server";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { isLastActiveAdmin } from "@/modules/users-permissions/service";
import { userBlockSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const data = userBlockSchema.parse(await req.json());
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (actor.id === id) {
      return ApiResponse.error("Não é possível bloquear o próprio usuário.", 409);
    }

    if (await isLastActiveAdmin(id, actor.templeId)) {
      return ApiResponse.error("Não é possível bloquear o último administrador ativo.", 409);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        status: "BLOCKED",
        bloqueadoEm: new Date(),
        bloqueadoMotivo: data.motivo,
        sessions: {
          updateMany: {
            where: { revokedAt: null },
            data: { revokedAt: new Date() },
          },
        },
      },
      select: { id: true, status: true, bloqueadoEm: true, bloqueadoMotivo: true },
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        userId: id,
        actorUserId: actor.id,
        acao: "bloquear_usuario",
        descricao: data.motivo,
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
