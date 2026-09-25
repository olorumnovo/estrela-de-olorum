import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

const keys = ["pix_key", "pix_name", "pix_bank"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const settings = await prisma.setting.findMany({
      where: {
        templeId: user.templeId,
        chave: {
          in: keys,
        },
      },
    });

    return ApiResponse.success({
      pixKey:
        settings.find((item) => item.chave === "pix_key")
          ?.valor || "",
      pixName:
        settings.find((item) => item.chave === "pix_name")
          ?.valor || "",
      pixBank:
        settings.find((item) => item.chave === "pix_bank")
          ?.valor || "",
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const data = {
      pix_key: String(body.pixKey || ""),
      pix_name: String(body.pixName || ""),
      pix_bank: String(body.pixBank || ""),
    };

    await prisma.$transaction(
      Object.entries(data).map(([chave, valor]) =>
        prisma.setting.upsert({
          where: {
            templeId_chave: {
              templeId: user.templeId,
              chave,
            },
          },
          create: {
            templeId: user.templeId,
            chave,
            valor,
          },
          update: {
            valor,
          },
        })
      )
    );

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
