import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getFinanceiroMediaBase64 } from "@/lib/evolution/financeiro";
import { getStoredFinanceiroMessagePayload } from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

export const dynamic = "force-dynamic";
const CHANNEL = "tenda" as const;

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const url = new URL(req.url);
    const remoteJid = url.searchParams.get("remoteJid") || "";
    const messageId = url.searchParams.get("messageId") || "";
    const fromMe = url.searchParams.get("fromMe") === "true";
    const download = url.searchParams.get("download") === "1";

    if (!remoteJid || !messageId) {
      return ApiResponse.error("Informe a mídia da mensagem.");
    }

    const storedMessage = await getStoredFinanceiroMessagePayload(
      user.templeId,
      messageId,
      CHANNEL
    );
    const media = await getFinanceiroMediaBase64({
      remoteJid: storedMessage?.remoteJid || remoteJid,
      messageId,
      fromMe: storedMessage?.fromMe ?? fromMe,
      channel: CHANNEL,
      message: storedMessage?.payload,
    });

    if (!media.base64) {
      return ApiResponse.notFound("Mídia não encontrada.");
    }

    const base64 = media.base64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const fileName = (media.fileName || messageId).replace(/[\r\n"\\]/g, "_");

    const range = req.headers.get("range");
    const headers = {
      "Content-Type": media.mimetype || storedMessage?.mimetype || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "Cache-Control": "private, max-age=300",
      "Accept-Ranges": "bytes",
    };

    if (range && !download) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;

        if (start <= end && start < buffer.length) {
          return new Response(buffer.subarray(start, end + 1), {
            status: 206,
            headers: {
              ...headers,
              "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
              "Content-Length": String(end - start + 1),
            },
          });
        }
      }
    }

    return new Response(buffer, {
      headers: { ...headers, "Content-Length": String(buffer.length) },
    });
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao carregar mídia."
    );
  }
}
