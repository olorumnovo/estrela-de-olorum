import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { ApiResponse } from "@/lib/response";

const channelEnvMap = {
  tenda: "INTELIGENCIABOT_TENDA_CHIP",
  financeiro: "INTELIGENCIABOT_FINANCEIRO_CHIP",
} as const;

type ChannelKey = keyof typeof channelEnvMap;

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();

    const channel = String(body.channel || "").trim() as ChannelKey;
    const phone = String(body.phone || "").trim();
    const message = String(body.message || "").trim();

    if (!channel || !(channel in channelEnvMap)) {
      return ApiResponse.error("Canal de conversa inválido.");
    }

    if (!phone) {
      return ApiResponse.error("Informe o telefone do contato.");
    }

    if (!message) {
      return ApiResponse.error("Informe a mensagem.");
    }

    const apiKey = process.env.INTELIGENCIABOT_API_KEY;
    const chip = process.env[channelEnvMap[channel]];

    if (!apiKey || !chip) {
      return ApiResponse.error(
        "Integração com Inteligencia Bot ainda não configurada no servidor.",
        503
      );
    }

    const url = new URL("https://painel.inteligenciabot.com/api/v1/send-text");
    url.searchParams.set("chip", chip);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        message,
      }),
      cache: "no-store",
    });

    const rawText = await response.text();
    let data: unknown = null;

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }
    }

    if (!response.ok) {
      return ApiResponse.error(
        typeof data === "object" &&
          data &&
          "message" in data &&
          typeof data.message === "string"
          ? data.message
          : "Não foi possível enviar a mensagem pela Inteligencia Bot.",
        response.status
      );
    }

    return ApiResponse.success({
      success: true,
      channel,
      phone,
      providerResponse: data,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro interno ao enviar mensagem."
    );
  }
}
