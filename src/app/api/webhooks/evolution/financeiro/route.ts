import { NextRequest } from "next/server";

import { publishEvolutionRealtime } from "@/lib/evolution/realtime";
import { persistFinanceiroWebhookPayload } from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

export async function GET() {
  return ApiResponse.success({
    success: true,
    message: "Webhook Evolution Financeiro ativo.",
  });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const result = await persistFinanceiroWebhookPayload(payload);

    console.info("[evolution-financeiro-webhook]", {
      event: payload?.event,
      instance: payload?.instance,
      receivedAt: new Date().toISOString(),
    });

    if (result.savedMessages.length > 0) {
      publishEvolutionRealtime({
        type: "message",
        channel: "financeiro",
        templeId: result.templeId,
        remoteJid: result.remoteJid,
        phone: result.phone,
      });
    }

    return ApiResponse.success({
      success: true,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro no webhook Evolution."
    );
  }
}
