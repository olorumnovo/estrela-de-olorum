import { NextRequest } from "next/server";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import { prisma } from "@/lib/prisma";
import {
  ensureSecuritySeed,
  hashPassword,
  parseStatus,
  userSelect,
} from "@/modules/users-permissions/service";
import { userCreateSchema } from "@/modules/users-permissions/validators";

const orderFields = new Set([
  "nome",
  "email",
  "ultimoLogin",
  "status",
  "createdAt",
]);

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAuth(req);
    await ensureSecuritySeed(actor.templeId);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = parseStatus(searchParams.get("status"));
    const roleId = searchParams.get("roleId");
    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const perPage = [10, 20, 50, 100].includes(Number(searchParams.get("perPage")))
      ? Number(searchParams.get("perPage"))
      : 10;
    const orderByParam = searchParams.get("orderBy") || "nome";
    const orderBy = orderFields.has(orderByParam) ? orderByParam : "nome";
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";

    const where = {
      templeId: actor.templeId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(roleId
        ? {
            userRoles: {
              some: {
                roleId,
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { telefone: { contains: q, mode: "insensitive" as const } },
              { cpf: { contains: q.replace(/\D/g, ""), mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [users, total, stats, activeSessions] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: {
          [orderBy]: order,
        },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.user.count({ where }),
      prisma.user.groupBy({
        by: ["status"],
        where: {
          templeId: actor.templeId,
          deletedAt: null,
        },
        _count: true,
      }),
      prisma.userSession.count({
        where: {
          templeId: actor.templeId,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
    ]);

    return ApiResponse.success({
      data: users,
      pagination: {
        page,
        perPage,
        total,
        pages: Math.ceil(total / perPage),
      },
      stats: {
        total: stats.reduce((sum, item) => sum + item._count, 0),
        active: stats.find((item) => item.status === "ACTIVE")?._count || 0,
        blocked: stats.find((item) => item.status === "BLOCKED")?._count || 0,
        pending: stats.find((item) => item.status === "PENDING")?._count || 0,
        inactive: stats.find((item) => item.status === "INACTIVE")?._count || 0,
        online: activeSessions,
      },
    });
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
    const body = await req.json();
    const data = userCreateSchema.parse(body);
    const ip = getRequestIp(req);
    const userAgent = getRequestUserAgent(req);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          templeId: actor.templeId,
          nome: data.nome,
          email: data.email.toLowerCase(),
          telefone: data.telefone || null,
          cpf: data.cpf,
          cargo: data.cargo || null,
          foto: data.foto || null,
          status: data.status,
          observacoes: data.observacoes || null,
          senha: await hashPassword(data.senha),
          senhaAlteradaEm: new Date(),
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

      const safeAuditData = {
        nome: data.nome,
        email: data.email,
        telefone: data.telefone,
        cpf: data.cpf,
        cargo: data.cargo,
        status: data.status,
        observacoes: data.observacoes,
        deveTrocarSenha: data.deveTrocarSenha,
        roleIds: data.roleIds,
        permissionOverrides: data.permissionOverrides,
      };

      await tx.userAuditLog.create({
        data: {
          templeId: actor.templeId,
          userId: created.id,
          actorUserId: actor.id,
          acao: "criar_usuario",
          descricao: "Usuário criado.",
          valorNovo: safeAuditData,
          ip,
          userAgent,
        },
      });

      return created;
    });

    return ApiResponse.created(user);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return ApiResponse.unauthorized();
    }

    return ApiResponse.serverError(getErrorMessage(error));
  }
}
