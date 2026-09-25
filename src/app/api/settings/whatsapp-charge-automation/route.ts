import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { getChargeAutomationState, setChargeAutomationEnabled } from "@/lib/finance/receivable-charge-automation";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return ApiResponse.success(await getChargeAutomationState(user.templeId));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    if (typeof body.enabled !== "boolean") return ApiResponse.error("Informe se a automação deve ser ativada ou pausada.");
    if (body.enabled && (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.CRON_SECRET)) {
      return ApiResponse.error("Configure a Evolution API e CRON_SECRET antes de ativar.", 409);
    }
    return ApiResponse.success(await setChargeAutomationEnabled(user.templeId, body.enabled));
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
