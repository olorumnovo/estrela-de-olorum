import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { processReceivableWhatsappNotifications } from "@/lib/finance/receivable-whatsapp-notifications";
import { ApiResponse } from "@/lib/response";

function boolParam(value: string | null) {
  return value === "true" || value === "1" || value === "sim";
}

async function getTempleIdForAutomation(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token") || "";
  const cronSecret = process.env.CRON_SECRET || process.env.WHATSAPP_CHARGE_SECRET || "";

  if (cronSecret && token === cronSecret) {
    const temple = await prisma.temple.findFirst({
      where: { ativo: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!temple) {
      throw new Error("Templo ativo não encontrado.");
    }

    return temple.id;
  }

  const user = await requireAuth(req);
  return user.templeId;
}

export async function GET(req: NextRequest) {
  try {
    const templeId = await getTempleIdForAutomation(req);
    const dryRun = boolParam(req.nextUrl.searchParams.get("dryRun")) || boolParam(req.nextUrl.searchParams.get("preview"));
    const send = boolParam(req.nextUrl.searchParams.get("send"));
    const daysAhead = Number(req.nextUrl.searchParams.get("daysAhead") || 10);
    const onlyPhone = req.nextUrl.searchParams.get("phone") || undefined;

    if (send && !onlyPhone) {
      return ApiResponse.error(
        "Para envio manual, informe phone=NUMERO. A cobrança geral usa somente a automação com intervalo.",
        409
      );
    }

    const result = await processReceivableWhatsappNotifications({
      templeId,
      dryRun: !send || dryRun,
      onlyPhone,
      daysAhead: Number.isFinite(daysAhead) ? daysAhead : 10,
    });

    return ApiResponse.success(result);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const onlyPhone = body.phone ? String(body.phone) : undefined;
    const send = body.send === true || body.dryRun === false;

    if (send && !onlyPhone) {
      return ApiResponse.error(
        "Para envio manual, informe phone. A cobrança geral usa somente a automação com intervalo.",
        409
      );
    }

    const result = await processReceivableWhatsappNotifications({
      templeId: user.templeId,
      dryRun: !send,
      onlyPhone,
      daysAhead: Number.isFinite(Number(body.daysAhead)) ? Number(body.daysAhead) : 10,
    });

    return ApiResponse.success(result);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
