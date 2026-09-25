import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
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
    const body = await req.json().catch(() => ({}));

    if (body.userId) {
      await prisma.userSession.updateMany({
        where: {
          templeId: actor.templeId,
          userId: body.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else {
      await prisma.userSession.updateMany({
        where: {
          id,
          templeId: actor.templeId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        actorUserId: actor.id,
        acao: "revogar_sessao",
        descricao: "Sessão revogada.",
        valorNovo: body.userId ? { userId: body.userId } : { sessionId: id },
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
