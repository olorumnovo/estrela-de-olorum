import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  contributionDefaults,
  contributionKeys,
  contributionSettingKey,
} from "@/lib/contributions";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const settings = await prisma.setting.findMany({
      where: {
        templeId: user.templeId,
        chave: {
          in: contributionKeys.map(contributionSettingKey),
        },
      },
    });

    const data = Object.fromEntries(
      contributionKeys.map((key) => [
        key,
        settings.find((item) => item.chave === contributionSettingKey(key))?.valor ||
          contributionDefaults[key as keyof typeof contributionDefaults],
      ])
    );

    return ApiResponse.success(data);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    await prisma.$transaction(
      contributionKeys.map((key) =>
        prisma.setting.upsert({
          where: {
            templeId_chave: {
              templeId: user.templeId,
              chave: contributionSettingKey(key),
            },
          },
          create: {
            templeId: user.templeId,
            chave: contributionSettingKey(key),
            valor: String(body[key] ?? ""),
          },
          update: {
            valor: String(body[key] ?? ""),
          },
        })
      )
    );

    return ApiResponse.success({ success: true });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
