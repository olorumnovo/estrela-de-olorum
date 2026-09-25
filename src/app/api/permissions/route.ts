import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { ensureSecuritySeed } from "@/modules/users-permissions/service";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    await ensureSecuritySeed(actor.templeId);

    const permissions = await prisma.permission.findMany({
      where: {
        templeId: actor.templeId,
      },
      orderBy: [{ modulo: "asc" }, { acao: "asc" }, { codigo: "asc" }],
    });

    return ApiResponse.success(permissions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    await ensureSecuritySeed(actor.templeId);

    const permissions = await prisma.permission.findMany({
      where: { templeId: actor.templeId },
      orderBy: [{ modulo: "asc" }, { acao: "asc" }],
    });

    return ApiResponse.success(permissions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
