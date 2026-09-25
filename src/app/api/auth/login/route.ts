import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getRequestIp, getRequestUserAgent } from "@/lib/auth";
import { isPdvOnlyRoleSet } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/modules/users-permissions/service";
import { loginSchema } from "@/modules/users-permissions/validators";

const MAX_LOGIN_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const ip = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);
  let email = "";

  try {
    const body = await req.json();
    const data = loginSchema.parse(body);
    email = data.email.toLowerCase();

    const usuario = await prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      select: {
        id: true,
        templeId: true,
        nome: true,
        email: true,
        senha: true,
        status: true,
        tentativasLogin: true,
        deveTrocarSenha: true,
        userRoles: {
          where: {
            role: {
              deletedAt: null,
              ativo: true,
            },
          },
          select: {
            role: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    });

    if (!usuario) {
      await prisma.loginLog.create({
        data: {
          email,
          success: false,
          ip,
          userAgent,
          reason: "Usuário não encontrado.",
        },
        select: {
          id: true,
        },
      });

      return NextResponse.json(
        { message: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    if (usuario.status === "BLOCKED") {
      await prisma.loginLog.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          email,
          success: false,
          ip,
          userAgent,
          reason: "Usuário bloqueado.",
        },
        select: {
          id: true,
        },
      });

      return NextResponse.json(
        { message: "Usuário bloqueado." },
        { status: 403 }
      );
    }

    if (usuario.status !== "ACTIVE") {
      await prisma.loginLog.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          email,
          success: false,
          ip,
          userAgent,
          reason: "Usuário inativo ou pendente.",
        },
        select: {
          id: true,
        },
      });

      return NextResponse.json(
        { message: "Usuário inativo ou pendente." },
        { status: 403 }
      );
    }

    const senhaCorreta = await bcrypt.compare(data.senha, usuario.senha);

    if (!senhaCorreta) {
      const tentativasLogin = usuario.tentativasLogin + 1;
      const shouldBlock = tentativasLogin >= MAX_LOGIN_ATTEMPTS;

      await prisma.user.update({
        where: {
          id: usuario.id,
        },
        data: {
          tentativasLogin,
          ...(shouldBlock
            ? {
                status: "BLOCKED",
                bloqueadoEm: new Date(),
                bloqueadoMotivo: "Bloqueio automático por tentativas inválidas.",
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

      await prisma.loginLog.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          email,
          success: false,
          ip,
          userAgent,
          reason: shouldBlock
            ? "Bloqueado após tentativas inválidas."
            : "Senha inválida.",
        },
        select: {
          id: true,
        },
      });

      return NextResponse.json(
        { message: "E-mail ou senha inválidos." },
        { status: 401 }
      );
    }

    const now = new Date();
    const token = createSessionToken();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const roleNames = usuario.userRoles.map((userRole) => userRole.role.nome);
    const isPdvUser = isPdvOnlyRoleSet(roleNames);
    const redirectTo = isPdvUser ? "/dashboard/pdv" : "/dashboard";

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: usuario.id,
        },
        data: {
          ultimoLogin: now,
          tentativasLogin: 0,
          ultimoIp: ip,
          ultimoUserAgent: userAgent,
        },
        select: {
          id: true,
        },
      }),
      prisma.userSession.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          token,
          ip,
          userAgent,
          expiresAt,
        },
        select: {
          id: true,
        },
      }),
      prisma.loginLog.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          email,
          success: true,
          ip,
          userAgent,
          reason: "Login realizado.",
        },
        select: {
          id: true,
        },
      }),
      prisma.userAuditLog.create({
        data: {
          templeId: usuario.templeId,
          userId: usuario.id,
          actorUserId: usuario.id,
          acao: "login",
          descricao: "Login realizado.",
          ip,
          userAgent,
        },
        select: {
          id: true,
        },
      }),
    ]);

    const response = NextResponse.json({
      success: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        deveTrocarSenha: usuario.deveTrocarSenha,
      },
      redirectTo,
    });

    response.cookies.set("sessionToken", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    response.cookies.set("userId", usuario.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    if (isPdvUser) {
      response.cookies.set("accessMode", "pdv", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    } else {
      response.cookies.delete("accessMode");
    }

    return response;
  } catch (error) {
    console.error(error);

    try {
      await prisma.loginLog.create({
        data: {
          email: email || "desconhecido",
          success: false,
          ip,
          userAgent,
          reason: "Erro ao realizar login.",
        },
        select: {
          id: true,
        },
      });
    } catch (logError) {
      console.error(logError);
    }

    return NextResponse.json(
      { message: "Erro ao realizar login." },
      { status: 500 }
    );
  }
}
