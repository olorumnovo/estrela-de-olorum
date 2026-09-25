import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { checkFinanceiroWhatsappNumber } from "@/lib/evolution/financeiro";
import {
  clearStoredFinanceiroConversation,
  createStoredWhatsappConversation,
  hideStoredFinanceiroConversation,
} from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const remoteJid = String(body.remoteJid || "");
    const phone = String(body.phone || "");
    const action = String(body.action || "");

    if (action === "create") {
      const requestedPhone = String(body.phone || "");
      const whatsapp = await checkFinanceiroWhatsappNumber(requestedPhone);
      if (!whatsapp?.exists) {
        return ApiResponse.error("Este número não possui WhatsApp.");
      }
      const chat = await createStoredWhatsappConversation(
        user.templeId,
        whatsapp.number || requestedPhone
      );

      return ApiResponse.success({ success: true, chat });
    }

    if (!remoteJid && !phone) {
      return ApiResponse.error("Informe a conversa.");
    }

    if (action === "clear") {
      const result = await clearStoredFinanceiroConversation(user.templeId, {
        remoteJid,
        phone,
      });

      return ApiResponse.success({ success: true, ...result });
    }

    if (action === "delete") {
      const result = await hideStoredFinanceiroConversation(user.templeId, {
        remoteJid,
        phone,
      });

      return ApiResponse.success({ success: true, ...result });
    }

    return ApiResponse.error("Ação inválida.");
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
