import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { toDate } from "@/modules/shared";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim();
    const success = searchParams.get("success");
    const dateFrom = toDate(searchParams.get("dateFrom"));
    const dateTo = toDate(searchParams.get("dateTo"));

    const logs = await prisma.loginLog.findMany({
      where: {
        templeId: actor.templeId,
        ...(email ? { email: { contains: email, mode: "insensitive" } } : {}),
        ...(success === "true" ? { success: true } : {}),
        ...(success === "false" ? { success: false } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      include: {
        user: {
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
