import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const lida = searchParams.get("lida");

    const notifications = await prisma.notification.findMany({
      where: {
        templeId,
        ...(q
          ? {
              OR: [
                { titulo: { contains: q, mode: "insensitive" } },
                { mensagem: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(lida === "true" ? { lida: true } : {}),
        ...(lida === "false" ? { lida: false } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return ApiResponse.success(serialize(notifications));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const body = await req.json();

    if (!body.titulo || !body.mensagem) {
      return ApiResponse.error("Informe título e mensagem.");
    }

    const notification = await prisma.notification.create({
      data: {
        templeId,
        titulo: body.titulo,
        mensagem: body.mensagem,
        lida: body.lida === true || body.lida === "true",
      },
    });

    return ApiResponse.created(serialize(notification));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
