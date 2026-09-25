import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { fetchFinanceiroMessagesRaw } from "@/lib/evolution/financeiro";
import { listStoredFinanceiroMessages, persistFinanceiroMessagesFromEvolution } from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

const CHANNEL = "tenda" as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const url = new URL(req.url);
    const remoteJid = url.searchParams.get("remoteJid") || "";
    const phone = url.searchParams.get("phone") || "";
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    const shouldSync = url.searchParams.get("sync") === "1";

    if (!remoteJid && !phone) {
      return ApiResponse.error("Informe a conversa para carregar as mensagens.");
    }

    let messages = await listStoredFinanceiroMessages(
      user.templeId,
      remoteJid,
      limit,
      offset,
      phone,
      CHANNEL
    );

    if ((shouldSync || messages.length === 0) && remoteJid) {
      try {
        const rawMessages = await fetchFinanceiroMessagesRaw(remoteJid, limit, offset, CHANNEL);
        await persistFinanceiroMessagesFromEvolution(user.templeId, remoteJid, rawMessages, CHANNEL);
        messages = await listStoredFinanceiroMessages(
          user.templeId,
          remoteJid,
          limit,
          offset,
          phone,
          CHANNEL
        );
      } catch (error) {
        console.warn(
          "[tenda-whatsapp-messages-sync]",
          error instanceof Error ? error.message : error
        );
      }
    }

    return ApiResponse.success({
      success: true,
      messages,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao buscar mensagens."
    );
  }
}
