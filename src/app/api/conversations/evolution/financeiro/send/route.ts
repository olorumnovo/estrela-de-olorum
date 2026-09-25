import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import {
  remoteJidToSendNumber,
  sendFinanceiroAudio,
  sendFinanceiroMedia,
  sendFinanceiroText,
} from "@/lib/evolution/financeiro";
import { saveFinanceiroMessage } from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

function bufferToBase64(buffer: ArrayBuffer, mimetype: string) {
  return `data:${mimetype};base64,${Buffer.from(buffer).toString("base64")}`;
}

function mediaTypeFromMime(mimetype: string) {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "document";
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const remoteJid = String(form.get("remoteJid") || "");
      const fallbackPhone = String(form.get("phone") || "");
      const caption = String(form.get("caption") || "");
      const kind = String(form.get("kind") || "media");
      const file = form.get("file");

      if (!remoteJid) {
        return ApiResponse.error("Informe a conversa para enviar.");
      }

      if (!(file instanceof File)) {
        return ApiResponse.error("Selecione um arquivo para enviar.");
      }

      const number = remoteJidToSendNumber(remoteJid, fallbackPhone);
      const mimetype = file.type || "application/octet-stream";
      const media = bufferToBase64(await file.arrayBuffer(), mimetype);

      const providerResponse =
        kind === "audio"
          ? await sendFinanceiroAudio(number, media)
          : await sendFinanceiroMedia({
              number,
              mediatype: mediaTypeFromMime(mimetype),
              media,
              fileName: file.name,
              caption,
              mimetype,
            });

      await persistSentMessage({
        templeId: user.templeId,
        remoteJid,
        providerResponse,
        text: caption,
        messageType: `${mediaTypeFromMime(mimetype)}Message`,
        mimetype,
        fileName: file.name,
      });

      return ApiResponse.success({
        success: true,
        providerResponse,
      });
    }

    const body = await req.json();
    const remoteJid = String(body.remoteJid || "");
    const phone = String(body.phone || "");
    const text = String(body.text || body.message || "").trim();

    if (!remoteJid && !phone) {
      return ApiResponse.error("Informe o telefone ou a conversa.");
    }

    if (!text) {
      return ApiResponse.error("Informe a mensagem.");
    }

    const number = remoteJidToSendNumber(remoteJid || phone, phone);
    const providerResponse = await sendFinanceiroText(number, text);
    await persistSentMessage({
      templeId: user.templeId,
      remoteJid: remoteJid || `${number}@s.whatsapp.net`,
      providerResponse,
      text,
      messageType: "conversation",
    });

    return ApiResponse.success({
      success: true,
      providerResponse,
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao enviar mensagem."
    );
  }
}

async function persistSentMessage(params: {
  templeId: string;
  remoteJid: string;
  providerResponse: unknown;
  text: string;
  messageType: string;
  mimetype?: string;
  fileName?: string;
}) {
  const messageId = resolveEvolutionMessageId(params.providerResponse);
  if (!messageId || !params.remoteJid) {
    return;
  }

  const mediaKey =
    params.messageType === "imageMessage"
      ? "imageMessage"
      : params.messageType === "videoMessage"
        ? "videoMessage"
        : params.messageType === "audioMessage"
          ? "audioMessage"
          : params.messageType === "documentMessage"
            ? "documentMessage"
            : null;

  await saveFinanceiroMessage(
    params.templeId,
    {
      id: messageId,
      key: {
        id: messageId,
        fromMe: true,
        remoteJid: params.remoteJid,
      },
      messageType: params.messageType,
      message: mediaKey
        ? {
            [mediaKey]: {
              caption: params.text,
              fileName: params.fileName,
              mimetype: params.mimetype,
            },
          }
        : { conversation: params.text },
      messageTimestamp: Date.now(),
      status: "sent",
    },
    params.remoteJid
  );
}

function resolveEvolutionMessageId(result: unknown) {
  if (!result || typeof result !== "object") {
    return "";
  }

  const payload = result as {
    key?: { id?: unknown };
    message?: { key?: { id?: unknown } };
    messageId?: unknown;
    id?: unknown;
  };

  const candidates = [
    payload.key?.id,
    payload.message?.key?.id,
    payload.messageId,
    payload.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}
