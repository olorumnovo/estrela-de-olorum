import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { ensureSecuritySeed } from "@/modules/users-permissions/service";
import { roleSchema } from "@/modules/users-permissions/validators";

const includeRole = {
  users: true,
  permissions: {
    include: {
      permission: true,
    },
  },
};

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    await ensureSecuritySeed(actor.templeId);

    const roles = await prisma.role.findMany({
      where: {
        templeId: actor.templeId,
        deletedAt: null,
      },
      include: includeRole,
      orderBy: {
        nome: "asc",
      },
    });

    return ApiResponse.success(roles);
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
    const data = roleSchema.parse(await req.json());

    const role = await prisma.role.create({
      data: {
        templeId: actor.templeId,
        nome: data.nome,
        descricao: data.descricao || null,
        ativo: data.ativo,
        permissions: {
          create: data.permissionIds.map((permissionId) => ({
            permissionId,
          })),
        },
      },
      include: includeRole,
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        actorUserId: actor.id,
        acao: "criar_perfil",
        descricao: `Perfil ${role.nome} criado.`,
        valorNovo: data,
      },
    });

    return ApiResponse.created(role);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
