import { NextRequest } from "next/server";

import { processReceivableWhatsappNotifications } from "@/lib/finance/receivable-whatsapp-notifications";
import { claimChargeSendSlot, getChargeAutomationState } from "@/lib/finance/receivable-charge-automation";
import { hasPendingManualCharge, processNextManualCharge } from "@/lib/finance/manual-charge-queue";
import { getErrorMessage } from "@/lib/errors";
import { processAnnualMemberRecurrences } from "@/lib/finance/member-annual-recurrence";
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

    const localHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
    }).format(new Date()));
    // The existing 15-minute cron also renews enabled member recurrences once a day in Nov/Dec.
    const annualRecurrence = localHour === 9 ? await processAnnualMemberRecurrences(temple.id) : null;

    const state = await getChargeAutomationState(temple.id);
    const hasManual = await hasPendingManualCharge(temple.id);
    if (!state.enabled && !hasManual) return ApiResponse.success({ success: true, enabled: false, queued: 0, annualRecurrence });
    if (localHour < 9 || localHour >= 18) {
      return ApiResponse.success({ success: true, enabled: true, message: "Fora do horário de envio (09h–18h)." });
    }
    if (!(await claimChargeSendSlot(temple.id))) {
      return ApiResponse.success({ success: true, enabled: true, nextSendAt: state.nextSendAt });
    }

    if (hasManual) {
      const manual = await processNextManualCharge(temple.id);
      if (manual.status !== "EMPTY") return ApiResponse.success({ success: true, enabled: state.enabled, manual });
    }
    if (!state.enabled) return ApiResponse.success({ success: true, enabled: false });

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
