type EvolutionRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  channel?: EvolutionWhatsappChannel;
};

declare global {
  var financeiroWebhookEnsured: boolean | undefined;
  var financeiroWebhookEnsuring: Promise<unknown> | undefined;
  var evolutionWebhookEnsuredByChannel:
    | Partial<Record<EvolutionWhatsappChannel, boolean>>
    | undefined;
  var evolutionWebhookEnsuringByChannel:
    | Partial<Record<EvolutionWhatsappChannel, Promise<unknown>>>
    | undefined;
}

export type EvolutionWhatsappChannel = "financeiro" | "tenda";

type EvolutionChat = {
  id?: string;
  remoteJid?: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string | null;
  updatedAt?: string;
  unreadMessages?: number;
  unreadCount?: number;
  lastMessage?: EvolutionMessage;
};

type EvolutionMessage = {
  id?: string;
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
  };
  pushName?: string;
  messageType?: string;
  message?: Record<string, unknown>;
  messageTimestamp?: number | string;
  timestamp?: number | string;
  createdAt?: string;
  updatedAt?: string;
};

export type ConversationItem = {
  id: string;
  remoteJid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastTime: string;
  unread: number;
};

export type MessageItem = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  author: "contato" | "atendente";
  text: string;
  time: string;
  sentAt?: string;
  type: "text" | "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  fileName?: string;
};

function getConfig(channel: EvolutionWhatsappChannel = "financeiro") {
  const apiUrl =
    channel === "tenda"
      ? (process.env.EVOLUTION_TENDA_API_URL || process.env.EVOLUTION_API_URL)?.replace(/\/+$/, "")
      : process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey =
    channel === "tenda"
      ? process.env.EVOLUTION_TENDA_API_KEY || process.env.EVOLUTION_API_KEY
      : process.env.EVOLUTION_API_KEY;
  const instance =
    channel === "tenda"
      ? process.env.EVOLUTION_TENDA_INSTANCE || "Tenda"
      : process.env.EVOLUTION_INSTANCE || "Financeiro";

  if (!apiUrl || !apiKey) {
    throw new Error("Evolution API não configurada no servidor.");
  }

  return { apiUrl, apiKey, instance };
}

async function evolutionRequest<T>(
  path: string,
  options: EvolutionRequestOptions = {}
) {
  const { apiUrl, apiKey } = getConfig(options.channel);
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method || "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
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
    const responseRecord = isRecord(data) ? data : {};
    const message =
      typeof responseRecord.message === "string"
        ? responseRecord.message
        : `Evolution API retornou erro ${response.status}.`;
    throw new Error(message);
  }

  return data as T;
}

function normalizeWhatsappNumber(value?: string) {
  const raw = String(value || "");
  const altMatch = raw.match(/(\d+)@s\.whatsapp\.net/);

  if (altMatch) {
    return altMatch[1];
  }

  if (raw.includes("@lid")) {
    return raw;
  }

  return raw.replace(/\D/g, "");
}

function formatTime(value?: string | number) {
  if (!value) {
    return "";
  }

  const date =
    typeof value === "number"
      ? new Date(value > 9999999999 ? value : value * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  return new Intl.DateTimeFormat("pt-BR", {
    hour: sameDay ? "2-digit" : undefined,
    minute: sameDay ? "2-digit" : undefined,
    day: sameDay ? undefined : "2-digit",
    month: sameDay ? undefined : "2-digit",
  }).format(date);
}

function getMessageTimestamp(message: EvolutionMessage) {
  return message.messageTimestamp || message.timestamp || message.createdAt || message.updatedAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNestedMessage(message?: Record<string, unknown>) {
  if (!message) {
    return {};
  }

  const nested =
    message.extendedTextMessage ||
    message.imageMessage ||
    message.videoMessage ||
    message.audioMessage ||
    message.documentMessage ||
    message.stickerMessage;

  return isRecord(nested) ? nested : message;
}

function extractText(message?: EvolutionMessage) {
  if (!message) {
    return "";
  }

  const payload = message.message || {};
  if (
    message.messageType === "reactionMessage" ||
    payload.reactionMessage ||
    payload.protocolMessage
  ) {
    return "";
  }

  const nested = getNestedMessage(payload);

  if (typeof payload.conversation === "string") {
    return payload.conversation;
  }

  return (
    getString(nested.text) ||
    getString(nested.caption) ||
    getString(nested.fileName) ||
    ""
  );
}

function extractMedia(message: EvolutionMessage) {
  const payload = message.message || {};
  const mediaValue =
    payload.imageMessage ||
    payload.videoMessage ||
    payload.audioMessage ||
    payload.documentMessage ||
    null;

  if (!isRecord(mediaValue)) {
    return {};
  }

  return {
    mediaUrl: getString(mediaValue.url) || undefined,
    fileName: getString(mediaValue.fileName) || undefined,
  };
}

function getMessageType(messageType?: string): MessageItem["type"] {
  if (messageType?.includes("image")) return "image";
  if (messageType?.includes("video")) return "video";
  if (messageType?.includes("audio")) return "audio";
  if (messageType?.includes("document")) return "document";
  return "text";
}

export function remoteJidToSendNumber(remoteJid: string, fallbackPhone?: string) {
  if (remoteJid.endsWith("@lid")) {
    return normalizeWhatsappNumber(fallbackPhone || remoteJid);
  }

  return normalizeWhatsappNumber(remoteJid);
}

export async function fetchFinanceiroChatsRaw(
  limit = 60,
  offset = 0,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  const data = await evolutionRequest<EvolutionChat[] | { chats?: EvolutionChat[] }>(
    `/chat/findChats/${encodeURIComponent(instance)}`,
    {
      body: { limit, offset },
      channel,
    }
  );

  return Array.isArray(data) ? data : data.chats || [];
}

export async function listFinanceiroChats(
  query = "",
  limit = 60,
  offset = 0,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const records = await fetchFinanceiroChatsRaw(limit, offset, channel);
  const normalizedRows = records
    .filter((chat) => !chat.remoteJid?.endsWith("@g.us"))
    .map((chat) => {
      const altPhone = chat.lastMessage?.key?.remoteJidAlt;
      const phone = normalizeWhatsappNumber(altPhone || chat.remoteJid);
      return {
        id: chat.remoteJid || chat.id || phone,
        remoteJid: chat.remoteJid || "",
        name: chat.name || chat.pushName || phone || "Contato sem nome",
        phone,
        avatarUrl: chat.profilePicUrl || null,
        lastMessage: extractText(chat.lastMessage) || "Sem mensagens recentes",
        lastTime: formatTime(chat.updatedAt || getMessageTimestamp(chat.lastMessage || {})),
        unread: Number(chat.unreadMessages || chat.unreadCount || 0),
      };
    });
  const normalized = Array.from(
    normalizedRows
      .reduce((acc, chat) => {
        const key = chat.phone || chat.remoteJid || chat.id;
        const current = acc.get(key);

        if (!current) {
          acc.set(key, chat);
          return acc;
        }

        acc.set(key, {
          ...current,
          ...chat,
          name:
            current.name && current.name !== current.phone
              ? current.name
              : chat.name,
          avatarUrl: current.avatarUrl || chat.avatarUrl,
          unread: Number(current.unread || 0) + Number(chat.unread || 0),
        });

        return acc;
      }, new Map<string, (typeof normalizedRows)[number]>())
      .values()
  );

  const search = query.trim().toLowerCase();

  if (!search) {
    return normalized;
  }

  return normalized.filter(
    (chat) =>
      chat.name.toLowerCase().includes(search) ||
      chat.phone.toLowerCase().includes(search) ||
      chat.lastMessage.toLowerCase().includes(search)
  );
}

export async function fetchFinanceiroMessagesRaw(
  remoteJid: string,
  limit = 50,
  offset = 0,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  const data = await evolutionRequest<{
    messages?: { records?: EvolutionMessage[] };
  }>(`/chat/findMessages/${encodeURIComponent(instance)}`, {
    body: {
      where: {
        key: {
          remoteJid,
        },
      },
      limit,
      offset,
    },
    channel,
  });

  return data.messages?.records || [];
}

export async function listFinanceiroMessages(remoteJid: string, limit = 50, offset = 0) {
  return listFinanceiroMessagesAfter(remoteJid, limit, offset);
}

export async function listFinanceiroMessagesAfter(
  remoteJid: string,
  limit = 50,
  offset = 0,
  after?: Date | null
) {
  const records = await fetchFinanceiroMessagesRaw(remoteJid, limit, offset);

  return records
    .slice()
    .filter((message) => message.messageType !== "reactionMessage")
    .filter((message) => {
      if (!after) {
        return true;
      }

      const timestamp = getMessageTimestamp(message);
      const date =
        typeof timestamp === "number"
          ? new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
          : timestamp
            ? new Date(timestamp)
            : null;

      return date ? date > after : true;
    })
    .reverse()
    .map((message) => ({
      id: message.id || message.key?.id || `${remoteJid}-${Math.random()}`,
      remoteJid: message.key?.remoteJid || remoteJid,
      fromMe: Boolean(message.key?.fromMe),
      author: message.key?.fromMe ? "atendente" : "contato",
      text: extractText(message) || "",
      time: formatTime(getMessageTimestamp(message)),
      sentAt: (() => {
        const timestamp = getMessageTimestamp(message);
        const date =
          typeof timestamp === "number"
            ? new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
            : timestamp
              ? new Date(timestamp)
              : null;

        return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
      })(),
      type: getMessageType(message.messageType),
      ...extractMedia(message),
    }));
}

export async function getFinanceiroMediaBase64(params: {
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
  channel?: EvolutionWhatsappChannel;
  message?: unknown;
}) {
  const channel = params.channel || "financeiro";
  const { instance } = getConfig(channel);
  const request = (message: unknown) => evolutionRequest<{
    mediaType?: string;
    fileName?: string;
    mimetype?: string;
    base64?: string;
  }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
    body: { message },
    channel,
  });

  if (isRecord(params.message)) {
    try {
      return await request(params.message);
    } catch {
      // Algumas versões da Evolution recuperam a mídia apenas pela chave.
    }
  }

  return request({
    key: {
      id: params.messageId,
      remoteJid: params.remoteJid,
      fromMe: params.fromMe,
    },
  });
}

export async function getFinanceiroProfilePictureUrl(
  number: string,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  const data = await evolutionRequest<{
    profilePictureUrl?: string | null;
    url?: string | null;
  }>(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, {
    body: { number },
    channel,
  });

  return data.profilePictureUrl || data.url || null;
}

export async function checkFinanceiroWhatsappNumber(
  number: string,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  let normalizedNumber = number.replace(/\D/g, "").replace(/^0+/, "");
  if (
    !normalizedNumber.startsWith("55") &&
    (normalizedNumber.length === 10 || normalizedNumber.length === 11)
  ) {
    normalizedNumber = `55${normalizedNumber}`;
  }
  const data = await evolutionRequest<
    Array<{ jid?: string; exists?: boolean; number?: string; name?: string }>
  >(`/chat/whatsappNumbers/${encodeURIComponent(instance)}`, {
    body: { numbers: [normalizedNumber] },
    channel,
  });

  return data[0] || null;
}

export async function sendFinanceiroText(
  number: string,
  text: string,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  const path = `/message/sendText/${encodeURIComponent(instance)}`;

  try {
    return await evolutionRequest(path, {
      body: {
        number,
        options: {
          delay: 1200,
          presence: "composing",
          linkPreview: false,
        },
        textMessage: {
          text,
        },
      },
      channel,
    });
  } catch (error) {
    return evolutionRequest(path, {
      body: {
        number,
        text,
        options: {
          delay: 1200,
          presence: "composing",
          linkPreview: false,
        },
      },
      channel,
    });
  }
}

export async function sendFinanceiroMedia(params: {
  number: string;
  mediatype: "image" | "document" | "video" | "audio";
  media: string;
  fileName?: string;
  caption?: string;
  mimetype?: string;
  channel?: EvolutionWhatsappChannel;
}) {
  const channel = params.channel || "financeiro";
  const { instance } = getConfig(channel);
  const { channel: _channel, ...payload } = params;

  return evolutionRequest(`/message/sendMedia/${encodeURIComponent(instance)}`, {
    body: payload,
    channel,
  });
}

export async function sendFinanceiroAudio(
  number: string,
  audio: string,
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  return evolutionRequest(
    `/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`,
    {
      body: {
        number,
        audio,
      },
      channel,
    }
  );
}

export async function configureFinanceiroWebhook(
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  const { instance } = getConfig(channel);
  const url =
    channel === "tenda"
      ? process.env.EVOLUTION_TENDA_WEBHOOK_URL ||
        `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution/tenda`
      : process.env.EVOLUTION_WEBHOOK_URL ||
        `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/evolution/financeiro`;

  if (!url) {
    throw new Error("URL do webhook da Evolution não configurada.");
  }

  return evolutionRequest(`/webhook/set/${encodeURIComponent(instance)}`, {
    body: {
      webhook: {
        enabled: true,
        url,
        byEvents: false,
        base64: false,
        events: [
          "CHATS_SET",
          "CHATS_UPSERT",
          "CHATS_UPDATE",
          "MESSAGES_SET",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "SEND_MESSAGE",
          "CONNECTION_UPDATE",
        ],
      },
    },
    channel,
  });
}

export async function ensureFinanceiroWebhookConfigured(
  channel: EvolutionWhatsappChannel = "financeiro"
) {
  global.evolutionWebhookEnsuredByChannel ||= {};
  global.evolutionWebhookEnsuringByChannel ||= {};

  if (global.evolutionWebhookEnsuredByChannel[channel]) {
    return;
  }

  if (!global.evolutionWebhookEnsuringByChannel[channel]) {
    global.evolutionWebhookEnsuringByChannel[channel] = configureFinanceiroWebhook(channel)
      .then((result) => {
        global.evolutionWebhookEnsuredByChannel![channel] = true;
        if (channel === "financeiro") {
          global.financeiroWebhookEnsured = true;
        }
        return result;
      })
      .finally(() => {
        global.evolutionWebhookEnsuringByChannel![channel] = undefined;
      });
  }

  await global.evolutionWebhookEnsuringByChannel[channel];
}
