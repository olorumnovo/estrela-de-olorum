import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { userPermissionsSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;

    const user = await prisma.user.findFirst({
      where: { id, templeId: actor.templeId, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        userPermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!user) {
      return ApiResponse.notFound("Usuário não encontrado.");
    }

    const inherited = user.userRoles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => ({
        role: userRole.role.nome,
        permission: rolePermission.permission,
      }))
    );

    return ApiResponse.success({
      inherited,
      direct: user.userPermissions,
    });
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
    const data = userPermissionsSchema.parse(await req.json());

    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId: id } });
      await tx.userPermission.createMany({
        data: data.permissions.map((permission) => ({
          userId: id,
          permissionId: permission.permissionId,
          allowed: permission.allowed,
        })),
        skipDuplicates: true,
      });
      await tx.userAuditLog.create({
        data: {
          templeId: actor.templeId,
          userId: id,
          actorUserId: actor.id,
          acao: "alterar_permissoes_usuario",
          descricao: "Permissões diretas do usuário atualizadas.",
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
