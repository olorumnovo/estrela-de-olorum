import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, getUserPermissionCodes } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const usuario = await getCurrentUser(req);

    if (!usuario) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        foto: usuario.foto,
        templeId: usuario.templeId,
        status: usuario.status,
        roles: usuario.userRoles.map((item) => item.role.nome),
        permissions: Array.from(getUserPermissionCodes(usuario)),
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Erro ao obter usuário." },
      { status: 500 }
    );
  }
}
