import { NextRequest } from "next/server";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import {
  ensureSecuritySeed,
  isLastActiveAdmin,
  userSelect,
} from "@/modules/users-permissions/service";
import { userUpdateSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const user = await prisma.user.findFirst({
      where: { id, templeId: actor.templeId },
      select: userSelect,
    });

    if (!user || user.deletedAt) {
      return ApiResponse.notFound("Usuário não encontrado.");
    }

    return ApiResponse.success(user);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    await ensureSecuritySeed(actor.templeId);
    const { id } = await params;
    const body = await req.json();
    const data = userUpdateSchema.parse(body);
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    const previous = await prisma.user.findFirst({
      where: {
        id,
        templeId: actor.templeId,
        deletedAt: null,
      },
      select: userSelect,
    });

    if (!previous) {
      return ApiResponse.notFound("Usuário não encontrado.");
    }

    if (
      previous.status === "ACTIVE" &&
      data.status !== "ACTIVE" &&
      (await isLastActiveAdmin(id, actor.templeId))
    ) {
      return ApiResponse.error("Não é possível inativar o último administrador ativo.", 409);
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userPermission.deleteMany({ where: { userId: id } });

      const updated = await tx.user.update({
        where: { id },
        data: {
          nome: data.nome,
          email: data.email.toLowerCase(),
          telefone: data.telefone || null,
          cpf: data.cpf,
          cargo: data.cargo || null,
          foto: data.foto || null,
          status: data.status,
          observacoes: data.observacoes || null,
          deveTrocarSenha: data.deveTrocarSenha,
          userRoles: {
            create: data.roleIds.map((roleId) => ({ roleId })),
          },
          userPermissions: {
            create: data.permissionOverrides.map((permission) => ({
              permissionId: permission.permissionId,
              allowed: permission.allowed,
            })),
          },
        },
        select: userSelect,
      });

      await tx.userAuditLog.create({
        data: {
          templeId: actor.templeId,
          userId: id,
          actorUserId: actor.id,
          acao: "editar_usuario",
          descricao: "Usuário atualizado.",
          valorAnterior: previous,
          valorNovo: data,
          ip,
          userAgent,
        },
      });

      return updated;
    });

    return ApiResponse.success(user);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    if (actor.id === id) {
      return ApiResponse.error("Não é possível excluir o próprio usuário.", 409);
    }

    if (await isLastActiveAdmin(id, actor.templeId)) {
      return ApiResponse.error("Não é possível excluir o último administrador ativo.", 409);
    }

    const user = await prisma.user.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
        status: "INACTIVE",
        sessions: {
          updateMany: {
            where: {
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          },
        },
      },
      select: userSelect,
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        userId: id,
        actorUserId: actor.id,
        acao: "inativar_usuario",
        descricao: "Usuário inativado por soft delete.",
        valorNovo: { deletedAt: user.deletedAt, status: user.status },
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
