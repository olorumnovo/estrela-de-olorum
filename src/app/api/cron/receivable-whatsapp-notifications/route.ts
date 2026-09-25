import { NextRequest } from "next/server";

import { processReceivableWhatsappNotifications } from "@/lib/finance/receivable-whatsapp-notifications";
import { claimChargeSendSlot, getChargeAutomationState } from "@/lib/finance/receivable-charge-automation";
import { getErrorMessage } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || "";
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    if (!cronSecret || token !== cronSecret) {
      return ApiResponse.unauthorized("Cron não autorizado.");
    }

    const temple = await prisma.temple.findFirst({
      where: { ativo: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!temple) {
      return ApiResponse.error("Templo ativo não encontrado.", 404);
    }

    const state = await getChargeAutomationState(temple.id);
    if (!state.enabled) return ApiResponse.success({ success: true, enabled: false });
    const localHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
    }).format(new Date()));
    if (localHour < 9 || localHour >= 18) {
      return ApiResponse.success({ success: true, enabled: true, message: "Fora do horário de envio (09h–18h)." });
    }
    if (!(await claimChargeSendSlot(temple.id))) {
      return ApiResponse.success({ success: true, enabled: true, nextSendAt: state.nextSendAt });
    }

    const result = await processReceivableWhatsappNotifications({
      templeId: temple.id,
      dryRun: false,
      daysAhead: Number(process.env.WHATSAPP_CHARGE_DAYS_AHEAD || 10),
      maxSends: 1,
    });

    return ApiResponse.success({
      success: true,
      enabled: true,
      scanned: result.scanned,
      eligible: result.eligible,
      sent: result.sent.length,
      failed: result.failed.length,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
