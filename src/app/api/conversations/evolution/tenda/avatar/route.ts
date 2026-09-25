import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getFinanceiroProfilePictureUrl } from "@/lib/evolution/financeiro";
import {
  getStoredFinanceiroAvatarUrl,
  updateStoredFinanceiroAvatarUrl,
} from "@/lib/evolution/store";
import { ApiResponse } from "@/lib/response";

export const dynamic = "force-dynamic";
const CHANNEL = "tenda" as const;

async function fetchAvatar(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL de imagem inválida.");
  }

  const response = await fetch(parsed, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.startsWith("image/")) {
    throw new Error("Imagem de perfil indisponível.");
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const url = new URL(req.url);
    const remoteJid = url.searchParams.get("remoteJid") || "";
    const phone = url.searchParams.get("phone") || "";

    if (!remoteJid) {
      return ApiResponse.error("Informe a conversa.");
    }

    const storedUrl = await getStoredFinanceiroAvatarUrl(user.templeId, remoteJid, CHANNEL);
    if (storedUrl) {
      try {
        return await fetchAvatar(storedUrl);
      } catch {
        // Atualiza abaixo quando a URL temporária do WhatsApp expirar.
      }
    }

    const profileUrl = await getFinanceiroProfilePictureUrl(phone || remoteJid, CHANNEL);
    if (!profileUrl) {
      return ApiResponse.notFound("Imagem de perfil não encontrada.");
    }

    await updateStoredFinanceiroAvatarUrl(user.templeId, remoteJid, profileUrl, CHANNEL);
    return await fetchAvatar(profileUrl);
  } catch (error) {
    return ApiResponse.serverError(
      error instanceof Error ? error.message : "Erro ao carregar imagem de perfil."
    );
  }
}
