import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("acao")?.trim();

    const logs = await prisma.userAuditLog.findMany({
      where: {
        templeId: actor.templeId,
        ...(action ? { acao: { contains: action, mode: "insensitive" } } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        actorUser: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    return ApiResponse.success(logs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
