import { NextRequest } from "next/server";

import { prisma } from "./prisma";

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
export type CurrentBasicUser = Awaited<ReturnType<typeof getCurrentBasicUser>>;

export function getRequestIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export function getRequestUserAgent(req: NextRequest) {
  return req.headers.get("user-agent");
}

export async function getCurrentUserFromTokens(
  sessionToken?: string,
  legacyUserId?: string
) {
  const userSelect = {
    id: true,
    templeId: true,
    nome: true,
    email: true,
    senha: true,
    telefone: true,
    foto: true,
    cargo: true,
    status: true,
    deletedAt: true,
    userRoles: {
      select: {
        role: {
          select: {
            nome: true,
            ativo: true,
            deletedAt: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    codigo: true,
                    chave: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    userPermissions: {
      select: {
        allowed: true,
        permission: {
          select: {
            codigo: true,
            chave: true,
          },
        },
      },
    },
  } as const;

  if (sessionToken) {
    const session = await prisma.userSession.findUnique({
      where: {
        token: sessionToken,
      },
      select: {
        revokedAt: true,
        expiresAt: true,
        user: {
          select: userSelect,
        },
      },
    });

    if (
      session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      !session.user.deletedAt &&
      session.user.status === "ACTIVE"
    ) {
      return session.user;
    }
  }

  if (!legacyUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: legacyUserId,
    },
    select: userSelect,
  });

  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    return null;
  }

  return user;
}

export async function getCurrentUser(req: NextRequest) {
  return getCurrentUserFromTokens(
    req.cookies.get("sessionToken")?.value,
    req.cookies.get("userId")?.value
  );
}

export async function getCurrentBasicUserFromTokens(
  sessionToken?: string,
  legacyUserId?: string
) {
  const userSelect = {
    id: true,
    templeId: true,
    nome: true,
    email: true,
    senha: true,
    telefone: true,
    foto: true,
    cargo: true,
    status: true,
    deletedAt: true,
  } as const;

  if (sessionToken) {
    const session = await prisma.userSession.findUnique({
      where: {
        token: sessionToken,
      },
      select: {
        revokedAt: true,
        expiresAt: true,
        user: {
          select: userSelect,
        },
      },
    });

    if (
      session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      !session.user.deletedAt &&
      session.user.status === "ACTIVE"
    ) {
      return session.user;
    }
  }

  if (!legacyUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: legacyUserId,
    },
    select: userSelect,
  });

  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    return null;
  }

  return user;
}

export async function getCurrentBasicUser(req: NextRequest) {
  return getCurrentBasicUserFromTokens(
    req.cookies.get("sessionToken")?.value,
    req.cookies.get("userId")?.value
  );
}

export async function requireAuth(req: NextRequest) {
  const user = await getCurrentBasicUser(req);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export function getUserPermissionCodes(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
) {
  const inherited = new Set<string>();

  user.userRoles.forEach((userRole) => {
    if (!userRole.role.ativo || userRole.role.deletedAt) {
      return;
    }

    userRole.role.permissions.forEach((rolePermission) => {
      const code =
        rolePermission.permission.codigo ||
        rolePermission.permission.chave;

      inherited.add(code);
    });
  });

  user.userPermissions.forEach((userPermission) => {
    const code =
      userPermission.permission.codigo ||
      userPermission.permission.chave;

    if (userPermission.allowed) {
      inherited.add(code);
    } else {
      inherited.delete(code);
    }
  });

  return inherited;
}

export function hasPermission(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  permissionCode: string
) {
  const codes = getUserPermissionCodes(user);

  return (
    codes.has(permissionCode) ||
    codes.has("usuarios.administrar") ||
    codes.has("administrador.total")
  );
}

export async function requirePermission(
  req: NextRequest,
  permissionCode: string
) {
  const user = await getCurrentUser(req);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!hasPermission(user, permissionCode)) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
