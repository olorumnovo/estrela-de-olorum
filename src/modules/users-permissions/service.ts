import { Prisma, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";
import { defaultRoles, seededPermissions } from "./defaults";

export const userSelect = {
  id: true,
  templeId: true,
  nome: true,
  email: true,
  telefone: true,
  foto: true,
  cpf: true,
  cargo: true,
  observacoes: true,
  status: true,
  ultimoLogin: true,
  senhaAlteradaEm: true,
  bloqueadoEm: true,
  bloqueadoMotivo: true,
  deveTrocarSenha: true,
  tentativasLogin: true,
  ultimoIp: true,
  ultimoUserAgent: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  userRoles: {
    include: {
      role: true,
    },
  },
  userPermissions: {
    include: {
      permission: true,
    },
  },
} satisfies Prisma.UserSelect;

export async function ensureSecuritySeed(templeId: string) {
  const permissions = await Promise.all(
    seededPermissions.map((permission) =>
      prisma.permission.upsert({
        where: {
          templeId_codigo: {
            templeId,
            codigo: permission.codigo,
          },
        },
        update: {
          chave: permission.chave,
          nome: permission.nome,
          descricao: permission.descricao,
          modulo: permission.modulo,
          acao: permission.acao,
        },
        create: {
          templeId,
          chave: permission.chave,
          codigo: permission.codigo,
          nome: permission.nome,
          descricao: permission.descricao,
          modulo: permission.modulo,
          acao: permission.acao,
        },
      })
    )
  );

  await Promise.all(
    defaultRoles.map((roleName) =>
      prisma.role.upsert({
        where: {
          templeId_nome: {
            templeId,
            nome: roleName,
          },
        },
        update: {
          ativo: true,
        },
        create: {
          templeId,
          nome: roleName,
          descricao: `Perfil ${roleName}`,
          ativo: true,
        },
      })
    )
  );

  const adminRole = await prisma.role.findUnique({
    where: {
      templeId_nome: {
        templeId,
        nome: "Administrador",
      },
    },
  });

  if (adminRole) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    const activeUsersWithoutRole = await prisma.user.findMany({
      where: {
        templeId,
        deletedAt: null,
        status: "ACTIVE",
        userRoles: {
          none: {},
        },
      },
      select: {
        id: true,
      },
    });

    if (activeUsersWithoutRole.length > 0) {
      await prisma.userRole.createMany({
        data: activeUsersWithoutRole.map((user) => ({
          userId: user.id,
          roleId: adminRole.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  const pdvRole = await prisma.role.findUnique({
    where: {
      templeId_nome: {
        templeId,
        nome: "PDV",
      },
    },
  });

  if (pdvRole) {
    const pdvPermissions = permissions.filter((permission) =>
      ["pdv.visualizar", "estoque.visualizar"].includes(
        permission.codigo || permission.chave
      )
    );

    await prisma.rolePermission.createMany({
      data: pdvPermissions.map((permission) => ({
        roleId: pdvRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function auditUserAction(data: {
  templeId: string;
  userId?: string | null;
  actorUserId?: string | null;
  acao: string;
  descricao?: string | null;
  valorAnterior?: Prisma.InputJsonValue;
  valorNovo?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.userAuditLog.create({
    data: {
      templeId: data.templeId,
      userId: data.userId || null,
      actorUserId: data.actorUserId || null,
      acao: data.acao,
      descricao: data.descricao || null,
      valorAnterior: data.valorAnterior ?? Prisma.JsonNull,
      valorNovo: data.valorNovo ?? Prisma.JsonNull,
      ip: data.ip || null,
      userAgent: data.userAgent || null,
    },
  });
}

export async function isLastActiveAdmin(userId: string, templeId: string) {
  const adminRoles = await prisma.role.findMany({
    where: {
      templeId,
      ativo: true,
      OR: [
        { nome: { equals: "Administrador", mode: "insensitive" } },
        {
          permissions: {
            some: {
              permission: {
                OR: [
                  { codigo: "usuarios.administrar" },
                  { codigo: "administrador.total" },
                  { chave: "usuarios.administrar" },
                  { chave: "administrador.total" },
                ],
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (adminRoles.length === 0) {
    return false;
  }

  const adminRoleIds = adminRoles.map((role) => role.id);
  const activeAdmins = await prisma.user.count({
    where: {
      templeId,
      deletedAt: null,
      status: "ACTIVE",
      userRoles: {
        some: {
          roleId: {
            in: adminRoleIds,
          },
        },
      },
    },
  });

  const targetIsAdmin = await prisma.userRole.findFirst({
    where: {
      userId,
      roleId: {
        in: adminRoleIds,
      },
    },
  });

  return Boolean(targetIsAdmin) && activeAdmins <= 1;
}

export function parseStatus(value: string | null): UserStatus | undefined {
  if (!value || value === "TODOS") {
    return undefined;
  }

  if (["ACTIVE", "INACTIVE", "BLOCKED", "PENDING"].includes(value)) {
    return value as UserStatus;
  }

  return undefined;
}
