import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { roleSchema } from "@/modules/users-permissions/validators";

type Params = {
  params: Promise<{ id: string }>;
};

const includeRole = {
  users: true,
  permissions: {
    include: {
      permission: true,
    },
  },
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const actor = await requireAuth(req);
    const { id } = await params;
    const role = await prisma.role.findFirst({
      where: { id, templeId: actor.templeId, deletedAt: null },
      include: includeRole,
    });

    if (!role) {
      return ApiResponse.notFound("Perfil não encontrado.");
    }

    return ApiResponse.success(role);
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
    const body = await req.json();

    if (body.action === "duplicate") {
      const source = await prisma.role.findFirst({
        where: { id, templeId: actor.templeId },
        include: { permissions: true },
      });

      if (!source) {
        return ApiResponse.notFound("Perfil não encontrado.");
      }

      const copy = await prisma.role.create({
        data: {
          templeId: actor.templeId,
          nome: `${source.nome} (cópia)`,
          descricao: source.descricao,
          ativo: source.ativo,
          permissions: {
            create: source.permissions.map((permission) => ({
              permissionId: permission.permissionId,
            })),
          },
        },
        include: includeRole,
      });

      return ApiResponse.success(copy);
    }

    const data = roleSchema.parse(body);

    if (data.nome.toLowerCase() === "administrador" && !data.ativo) {
      return ApiResponse.error("O perfil Administrador não pode ser inativado.", 409);
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });

    const role = await prisma.role.update({
      where: { id },
      data: {
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
        acao: "editar_perfil",
        descricao: `Perfil ${role.nome} atualizado.`,
        valorNovo: data,
      },
    });

    return ApiResponse.success(role);
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

    const role = await prisma.role.findFirst({
      where: { id, templeId: actor.templeId },
      include: { users: { include: { user: true } } },
    });

    if (!role) {
      return ApiResponse.notFound("Perfil não encontrado.");
    }

    if (role.nome.toLowerCase() === "administrador") {
      return ApiResponse.error("O perfil Administrador não pode ser excluído.", 409);
    }

    const hasActiveUsers = role.users.some(
      (item) => item.user.status === "ACTIVE" && !item.user.deletedAt
    );

    await prisma.role.update({
      where: { id },
      data: hasActiveUsers
        ? { ativo: false }
        : { deletedAt: new Date(), ativo: false },
    });

    await prisma.userAuditLog.create({
      data: {
        templeId: actor.templeId,
        actorUserId: actor.id,
        acao: hasActiveUsers ? "inativar_perfil" : "excluir_perfil",
        descricao: `Perfil ${role.nome} ${hasActiveUsers ? "inativado" : "excluído"}.`,
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
