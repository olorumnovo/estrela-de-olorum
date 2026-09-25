import { NextRequest } from "next/server";

import { getRequestIp, getRequestUserAgent, requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const nome = String(body?.nome || "").trim();
    const foto = body?.foto ? String(body.foto).trim() : null;
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (!nome) {
      return ApiResponse.error("Informe o nome.", 400);
    }

    if (foto && foto.length > 2_000_000) {
      return ApiResponse.error("A foto é muito grande.", 400);
    }

    const previous = await prisma.user.findUnique({
      where: { id: user.id },
      select: { nome: true, foto: true },
    });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nome,
        foto: foto || null,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        foto: true,
      },
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: user.templeId,
        userId: user.id,
        actorUserId: user.id,
        acao: "editar_perfil",
        descricao: "Perfil do usuário atualizado.",
        valorAnterior: previous
          ? {
              nome: previous.nome,
              foto: previous.foto,
            }
          : undefined,
        valorNovo: { nome: updated.nome, foto: updated.foto },
        ip,
        userAgent,
      },
    });

    return ApiResponse.success(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
