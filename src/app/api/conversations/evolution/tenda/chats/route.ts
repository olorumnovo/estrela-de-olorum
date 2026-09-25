import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { ensureFinanceiroWebhookConfigured, fetchFinanceiroChatsRaw } from "@/lib/evolution/financeiro";
import { listStoredFinanceiroChats, persistFinanceiroChatsFromEvolution } from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

const CHANNEL = "tenda" as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    const limit = Number(url.searchParams.get("limit") || 60);
    const offset = Number(url.searchParams.get("offset") || 0);
    const shouldSync = url.searchParams.get("sync") === "1";

    let chats = await listStoredFinanceiroChats(user.templeId, q, limit, offset, CHANNEL);

    if (shouldSync || (!q.trim() && offset === 0 && chats.length === 0)) {
      try {
        await ensureFinanceiroWebhookConfigured(CHANNEL).catch((error) => {
          console.warn(
            "[tenda-whatsapp-webhook-auto]",
            error instanceof Error ? error.message : error
          );
        });
        const rawChats = await fetchFinanceiroChatsRaw(limit, offset, CHANNEL);
        await persistFinanceiroChatsFromEvolution(user.templeId, rawChats, CHANNEL);
        chats = await listStoredFinanceiroChats(user.templeId, q, limit, offset, CHANNEL);
      } catch (error) {
        console.warn(
          "[tenda-whatsapp-chats-sync]",
          error instanceof Error ? error.message : error
        );
      }
    }

    return ApiResponse.success({
      success: true,
      chats,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao buscar conversas."
    );
  }
}
