import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";
import { serialize } from "@/modules/shared";

function parseDay(value: unknown) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const date = parseDay(req.nextUrl.searchParams.get("data"));

    if (!date) {
      return ApiResponse.error("Informe a data.");
    }

    const record = await prisma.memberDistribution.findFirst({
      where: {
        templeId: user.templeId,
        data: date,
        deletedAt: null,
      },
    });

    return ApiResponse.success(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const date = parseDay(body.data);

    if (!date || !body.layout) {
      return ApiResponse.error("Informe data e distribuição.");
    }

    const record = await prisma.memberDistribution.upsert({
      where: {
        templeId_data: {
          templeId: user.templeId,
          data: date,
        },
      },
      create: {
        templeId: user.templeId,
        data: date,
        layout: body.layout as Prisma.InputJsonValue,
      },
      update: {
        layout: body.layout as Prisma.InputJsonValue,
        deletedAt: null,
      },
    });

    return ApiResponse.success(serialize(record));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
