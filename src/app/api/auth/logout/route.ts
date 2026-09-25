import { NextRequest, NextResponse } from "next/server";

import {
  getCurrentUser,
  getRequestIp,
  getRequestUserAgent,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditUserAction } from "@/modules/users-permissions/service";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("sessionToken")?.value;
  const user = await getCurrentUser(req);
  const ip = getRequestIp(req);
  const userAgent = getRequestUserAgent(req);

  if (token) {
    await prisma.userSession.updateMany({
      where: {
        token,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  if (user) {
    await auditUserAction({
      templeId: user.templeId,
      userId: user.id,
      actorUserId: user.id,
      acao: "logout",
      descricao: "Logout realizado.",
      ip,
      userAgent,
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("sessionToken");
  response.cookies.delete("userId");
  response.cookies.delete("accessMode");

  return response;
}
