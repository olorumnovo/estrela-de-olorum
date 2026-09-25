import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const register = await prisma.cashRegister.findFirst({
      where: {
        id,
        templeId: user.templeId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!register) {
      return ApiResponse.notFound("Caixa não encontrado.");
    }

    const sessions = await prisma.cashSession.findMany({
      where: {
        templeId: user.templeId,
        cashRegisterId: id,
      },
      orderBy: {
        openedAt: "desc",
      },
      take: 20,
    });

    return ApiResponse.success(serialize(sessions));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
