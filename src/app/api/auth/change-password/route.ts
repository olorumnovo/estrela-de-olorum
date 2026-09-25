import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import {
  getRequestIp,
  getRequestUserAgent,
  requireAuth,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditUserAction, hashPassword } from "@/modules/users-permissions/service";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { message: "Preencha todos os campos." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { message: "A nova senha deve ter pelo menos 8 caracteres." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { message: "A confirmação da senha não confere." },
        { status: 400 }
      );
    }

    const senhaAtualCorreta = await bcrypt.compare(currentPassword, user.senha);

    if (!senhaAtualCorreta) {
      return NextResponse.json(
        { message: "Senha atual incorreta." },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        senha: await hashPassword(newPassword),
        senhaAlteradaEm: new Date(),
        deveTrocarSenha: false,
      },
    });

    await auditUserAction({
      templeId: user.templeId,
      userId: user.id,
      actorUserId: user.id,
      acao: "alterar_senha",
      descricao: "Senha alterada pelo usuário logado.",
      ip: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Erro ao alterar senha." },
      { status: 500 }
    );
  }
}
