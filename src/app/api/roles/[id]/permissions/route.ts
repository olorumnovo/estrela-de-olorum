import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { rolePermissionsSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;

    const role = await prisma.role.findFirst({
      where: { id, templeId: actor.templeId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      return ApiResponse.notFound("Perfil não encontrado.");
    }

    return ApiResponse.success(role.permissions);
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
    const { id } = await params;
    const data = rolePermissionsSchema.parse(await req.json());

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: data.permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
        skipDuplicates: true,
      });
      await tx.userAuditLog.create({
        data: {
          templeId: actor.templeId,
          actorUserId: actor.id,
          acao: "alterar_permissoes_perfil",
          descricao: "Matriz de permissões atualizada.",
          valorNovo: data,
        },
      });
    });

    return ApiResponse.success({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
