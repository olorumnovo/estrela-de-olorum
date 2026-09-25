import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { configureFinanceiroWebhook } from "@/lib/evolution/financeiro";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const providerResponse = await configureFinanceiroWebhook();

    return ApiResponse.success({
      success: true,
      webhookUrl:
        process.env.EVOLUTION_WEBHOOK_URL ||
        `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution/financeiro`,
      providerResponse,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao configurar webhook."
    );
  }
}
