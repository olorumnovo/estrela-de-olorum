import { NextRequest } from "next/server";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { hashPassword } from "@/modules/users-permissions/service";
import { userPasswordResetSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const data = userPasswordResetSchema.parse(await req.json());
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    await prisma.user.update({
      where: { id },
      data: {
        senha: await hashPassword(data.senha),
        senhaAlteradaEm: new Date(),
        deveTrocarSenha: data.deveTrocarSenha,
        tentativasLogin: 0,
      },
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        userId: id,
        actorUserId: actor.id,
        acao: "resetar_senha",
        descricao: "Senha redefinida administrativamente.",
        valorNovo: { deveTrocarSenha: data.deveTrocarSenha },
        ip,
        userAgent,
      },
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
