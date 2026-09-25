import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type EvolutionWhatsappChannel = "financeiro" | "tenda";

const FINANCEIRO_CHANNEL: EvolutionWhatsappChannel = "financeiro";

function getEvolutionInstanceName(channel: EvolutionWhatsappChannel) {
  if (channel === "tenda") {
    return process.env.EVOLUTION_TENDA_INSTANCE || "Tenda";
  }

  return process.env.EVOLUTION_INSTANCE || "Financeiro";
}

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
  status?: string;
};

type EvolutionChat = {
  id?: string;
  remoteJid?: string;
  name?: string;
  pushName?: string;
  profilePicUrl?: string | null;
  updatedAt?: string;
  unreadMessages?: number;
  unreadCount?: number;
  isGroup?: boolean;
  lastMessage?: EvolutionMessage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeWhatsappNumber(value?: string) {
  const raw = String(value || "");
  const altMatch = raw.match(/(\d+)@s\.whatsapp\.net/);

  if (altMatch) {
    return normalizeBrazilianPhone(altMatch[1]);
  }

  if (raw.includes("@lid")) {
    return "";
  }

  return normalizeBrazilianPhone(raw);
}

function normalizeBrazilianPhone(value?: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const withoutLeadingZero = digits.replace(/^0+/, "");

  if (
    withoutLeadingZero.startsWith("55") &&
    (withoutLeadingZero.length === 12 || withoutLeadingZero.length === 13)
  ) {
    return withoutLeadingZero;
  }

  if (withoutLeadingZero.length === 10 || withoutLeadingZero.length === 11) {
    return `55${withoutLeadingZero}`;
  }

  return withoutLeadingZero;
}

function isUsablePhone(phone: string) {
  return /^55\d{10,11}$/.test(normalizeBrazilianPhone(phone));
}

function lastPhoneDigits(value: string, size: number) {
  return value.length >= size ? value.slice(-size) : value;
}

function phonesMatch(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeWhatsappNumber(left || "");
  const normalizedRight = normalizeWhatsappNumber(right || "");

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const left11 = lastPhoneDigits(normalizedLeft, 11);
  const right11 = lastPhoneDigits(normalizedRight, 11);
  if (left11 && right11 && left11 === right11) {
    return true;
  }

  const left10 = lastPhoneDigits(normalizedLeft, 10);
  const right10 = lastPhoneDigits(normalizedRight, 10);
  return Boolean(left10 && right10 && left10 === right10);
}

function getOwnInstanceNames(channel: EvolutionWhatsappChannel) {
  const configuredInstance = getEvolutionInstanceName(channel);
  return new Set(
    [
      configuredInstance,
      process.env.EVOLUTION_DISPLAY_NAME,
      process.env.EVOLUTION_FINANCEIRO_DISPLAY_NAME,
      process.env.EVOLUTION_TENDA_DISPLAY_NAME,
      "Financeiro TUEO",
    ]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function isOwnInstanceName(value: string | null | undefined, channel: EvolutionWhatsappChannel) {
  const name = String(value || "").trim().toLowerCase();
  return Boolean(name && getOwnInstanceNames(channel).has(name));
}

function isPlaceholderContactName(value?: string | null, phone?: string | null) {
  const name = String(value || "").trim();
  const normalizedName = name.toLowerCase();
  const digits = String(phone || "").replace(/\D/g, "");

  return (
    !name ||
    normalizedName === "contato sem nome" ||
    normalizedName === "contato evolution" ||
    name.includes("@lid") ||
    Boolean(digits && (normalizedName === digits || normalizedName === `+${digits}`))
  );
}

function resolveDisplayName(input: {
  name?: string | null;
  pushName?: string | null;
  phone?: string | null;
  channel: EvolutionWhatsappChannel;
  memberName?: string | null;
}) {
  const candidates = [
    input.memberName,
    input.name,
    input.pushName,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      !isPlaceholderContactName(candidate, input.phone) &&
      !isOwnInstanceName(candidate, input.channel)
    ) {
      return candidate;
    }
  }

  return input.phone || "Contato sem nome";
}

function preferContactName(
  primary?: string | null,
  secondary?: string | null,
  phone?: string | null
) {
  if (primary && !isPlaceholderContactName(primary, phone)) {
    return primary;
  }

  if (secondary && !isPlaceholderContactName(secondary, phone)) {
    return secondary;
  }

  return primary || secondary || phone || "Contato sem nome";
}

function extractPhoneFromMessagePayload(payload: unknown) {
  if (!isRecord(payload)) {
    return "";
  }

  const key = isRecord(payload.key) ? payload.key : {};
  return normalizeWhatsappNumber(
    getString(key.remoteJidAlt) ||
      getString(key.remoteJid) ||
      getString(payload.remoteJid)
  );
}

async function resolveMemberNameByPhone(templeId: string, phone: string) {
  if (!isUsablePhone(phone)) {
    return "";
  }

  const members = await prisma.member.findMany({
    where: {
      templeId,
      deletedAt: null,
      OR: [{ whatsapp: { not: null } }, { telefone: { not: null } }],
    },
    select: {
      nome: true,
      whatsapp: true,
      telefone: true,
    },
  });

  const member = members.find((item) => {
    return phonesMatch(item.whatsapp, phone) || phonesMatch(item.telefone, phone);
  });

  return member?.nome || "";
}

async function mergeWhatsappConversations(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) {
    return prisma.whatsappConversation.findUnique({ where: { id: primaryId } });
  }

  const [primary, duplicate] = await Promise.all([
    prisma.whatsappConversation.findUnique({ where: { id: primaryId } }),
    prisma.whatsappConversation.findUnique({ where: { id: duplicateId } }),
  ]);

  if (!primary || !duplicate) {
    return primary;
  }

  const primaryDate = primary.lastMessageAt || primary.updatedAt;
  const duplicateDate = duplicate.lastMessageAt || duplicate.updatedAt;
  const latest = duplicateDate > primaryDate ? duplicate : primary;

  await prisma.$transaction([
    prisma.whatsappMessage.updateMany({
      where: { conversationId: duplicate.id },
      data: { conversationId: primary.id },
    }),
    prisma.whatsappConversation.update({
      where: { id: primary.id },
      data: {
        phone: primary.phone || duplicate.phone,
        name: preferContactName(primary.name, duplicate.name, primary.phone || duplicate.phone),
        pushName: primary.pushName || duplicate.pushName,
        profilePicUrl: primary.profilePicUrl || duplicate.profilePicUrl,
        lastMessage: latest.lastMessage || primary.lastMessage || duplicate.lastMessage,
        lastMessageAt: latest.lastMessageAt || primary.lastMessageAt || duplicate.lastMessageAt,
        unreadCount: Math.max(primary.unreadCount, duplicate.unreadCount),
        hiddenAt: primary.hiddenAt && duplicate.hiddenAt ? latest.hiddenAt : null,
        clearedAt:
          primary.clearedAt && duplicate.clearedAt
            ? primary.clearedAt > duplicate.clearedAt
              ? primary.clearedAt
              : duplicate.clearedAt
            : null,
      },
    }),
    prisma.whatsappConversation.delete({ where: { id: duplicate.id } }),
  ]);

  return prisma.whatsappConversation.findUnique({ where: { id: primary.id } });
}

function toDate(value?: string | number) {
  if (!value) {
    return null;
  }

  const date =
    typeof value === "number"
      ? new Date(value > 9999999999 ? value : value * 1000)
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

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

function getTimestamp(message?: EvolutionMessage) {
  return (
    message?.messageTimestamp ||
    message?.timestamp ||
    message?.createdAt ||
    message?.updatedAt
  );
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
    mediaUrl: getString(mediaValue.url) || null,
    fileName: getString(mediaValue.fileName) || null,
    mimetype: getString(mediaValue.mimetype) || null,
  };
}

function getRemoteJid(message?: EvolutionMessage, fallback?: string) {
  return message?.key?.remoteJid || fallback || "";
}

function getMessageId(message: EvolutionMessage) {
  return message.id || message.key?.id || "";
}

async function resolveEvolutionTempleId() {
  const slug = process.env.EVOLUTION_TEMPLE_SLUG || "estrela";

  const bySlug = await prisma.temple.findFirst({
    where: {
      slug,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (bySlug) {
    return bySlug.id;
  }

  const first = await prisma.temple.findFirst({
    where: {
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!first) {
    throw new Error("Nenhum templo encontrado para salvar mensagens.");
  }

  return first.id;
}

export async function getFinanceiroWebhookTempleId() {
  return resolveEvolutionTempleId();
}

export async function saveFinanceiroChat(
  templeId: string,
  chat: EvolutionChat,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const remoteJid = chat.remoteJid || chat.lastMessage?.key?.remoteJid || "";

  if (!remoteJid || remoteJid.endsWith("@g.us")) {
    return null;
  }

  const sentAt = toDate(chat.updatedAt || getTimestamp(chat.lastMessage));
  const altPhone = chat.lastMessage?.key?.remoteJidAlt;
  const phone = normalizeWhatsappNumber(altPhone || remoteJid);
  const lastMessage = extractText(chat.lastMessage);
  const memberName = await resolveMemberNameByPhone(templeId, phone);
  const incomingName = chat.name || chat.pushName || "";
  const resolvedName = resolveDisplayName({
    name: incomingName,
    phone,
    channel,
    memberName,
  });
  const existingByPhone = isUsablePhone(phone)
    ? await prisma.whatsappConversation.findFirst({
        where: {
          templeId,
          channel,
          phone,
          isGroup: false,
        },
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      })
    : null;
  const existingByRemote = await prisma.whatsappConversation.findUnique({
    where: {
      templeId_channel_remoteJid: { templeId, channel, remoteJid },
    },
  });

  if (
    existingByPhone &&
    existingByRemote &&
    existingByPhone.id !== existingByRemote.id
  ) {
    await mergeWhatsappConversations(existingByPhone.id, existingByRemote.id);
  }

  if (existingByPhone && existingByPhone.remoteJid !== remoteJid) {
    return prisma.whatsappConversation.update({
      where: { id: existingByPhone.id },
      data: {
        instance: getEvolutionInstanceName(channel),
        phone,
        name: resolvedName || existingByPhone.name || phone || "Contato sem nome",
        pushName: chat.pushName || existingByPhone.pushName,
        profilePicUrl: chat.profilePicUrl || existingByPhone.profilePicUrl,
        lastMessage: lastMessage || existingByPhone.lastMessage,
        lastMessageAt: sentAt || existingByPhone.lastMessageAt,
        unreadCount: Math.max(existingByPhone.unreadCount, Number(chat.unreadMessages || chat.unreadCount || 0)),
        isGroup: false,
      },
    });
  }

  return prisma.whatsappConversation.upsert({
    where: {
      templeId_channel_remoteJid: {
        templeId,
        channel,
        remoteJid,
      },
    },
    create: {
      templeId,
      channel,
      instance: getEvolutionInstanceName(channel),
      remoteJid,
      phone,
      name: resolvedName,
      pushName: chat.pushName,
      profilePicUrl: chat.profilePicUrl || null,
      lastMessage: lastMessage || null,
      lastMessageAt: sentAt,
      unreadCount: Number(chat.unreadMessages || chat.unreadCount || 0),
      isGroup: Boolean(chat.isGroup || remoteJid.endsWith("@g.us")),
    },
    update: {
      instance: getEvolutionInstanceName(channel),
      phone,
      name: resolvedName,
      pushName: chat.pushName,
      profilePicUrl: chat.profilePicUrl || null,
      lastMessage: lastMessage || null,
      lastMessageAt: sentAt,
      unreadCount: Number(chat.unreadMessages || chat.unreadCount || 0),
      isGroup: Boolean(chat.isGroup || remoteJid.endsWith("@g.us")),
    },
  });
}

export async function saveFinanceiroMessage(
  templeId: string,
  message: EvolutionMessage,
  fallbackRemoteJid?: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const remoteJid = getRemoteJid(message, fallbackRemoteJid);
  const messageId = getMessageId(message);

  if (!remoteJid || !messageId || remoteJid.endsWith("@g.us")) {
    return null;
  }

  const sentAt = toDate(getTimestamp(message));
  const media = extractMedia(message);
  const text = extractText(message);
  const phone = normalizeWhatsappNumber(message.key?.remoteJidAlt || remoteJid);
  const memberName = await resolveMemberNameByPhone(templeId, phone);
  const resolvedName = resolveDisplayName({
    pushName: message.pushName,
    phone,
    channel,
    memberName,
  });
  const existingByPhone = isUsablePhone(phone)
    ? await prisma.whatsappConversation.findFirst({
        where: {
          templeId,
          channel,
          phone,
          isGroup: false,
        },
        orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      })
    : null;
  const existingByRemote = await prisma.whatsappConversation.findUnique({
    where: {
      templeId_channel_remoteJid: { templeId, channel, remoteJid },
    },
  });
  const mergedConversation =
    existingByPhone &&
    existingByRemote &&
    existingByPhone.id !== existingByRemote.id
      ? await mergeWhatsappConversations(existingByPhone.id, existingByRemote.id)
      : null;
  const canonicalByPhone = mergedConversation || existingByPhone;
  const conversation = canonicalByPhone
    ? await prisma.whatsappConversation.update({
        where: { id: canonicalByPhone.id },
        data: {
          instance: getEvolutionInstanceName(channel),
          phone,
          name: memberName || (isPlaceholderContactName(canonicalByPhone.name, phone)
            ? resolvedName
            : canonicalByPhone.name || resolvedName),
          pushName: message.pushName || canonicalByPhone.pushName,
          lastMessage: text || canonicalByPhone.lastMessage,
          lastMessageAt: sentAt || canonicalByPhone.lastMessageAt,
          hiddenAt: message.key?.fromMe ? canonicalByPhone.hiddenAt : null,
        },
      })
    : await prisma.whatsappConversation.upsert({
    where: {
      templeId_channel_remoteJid: {
        templeId,
        channel,
        remoteJid,
      },
    },
    create: {
      templeId,
      channel,
      instance: getEvolutionInstanceName(channel),
      remoteJid,
      phone,
      name: resolvedName,
      pushName: message.pushName,
      lastMessage: text || null,
      lastMessageAt: sentAt,
      hiddenAt: null,
    },
    update: {
      instance: getEvolutionInstanceName(channel),
      phone,
      pushName: message.pushName,
      lastMessage: text || null,
      lastMessageAt: sentAt,
      hiddenAt: message.key?.fromMe ? undefined : null,
    },
  });

  return prisma.whatsappMessage.upsert({
    where: {
      templeId_channel_messageId: {
        templeId,
        channel,
        messageId,
      },
    },
    create: {
      templeId,
      conversationId: conversation.id,
      channel,
      instance: getEvolutionInstanceName(channel),
      remoteJid,
      messageId,
      fromMe: Boolean(message.key?.fromMe),
      pushName: message.pushName,
      messageType: message.messageType,
      text: text || null,
      status: message.status,
      sentAt,
      payload: message as Prisma.InputJsonValue,
      ...media,
    },
    update: {
      conversationId: conversation.id,
      status: message.status,
      text: text || null,
      sentAt,
      payload: message as Prisma.InputJsonValue,
      ...media,
    },
  });
}

export async function listStoredFinanceiroChats(
  templeId: string,
  query = "",
  limit = 60,
  offset = 0,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const search = query.trim();
  const chats = await prisma.whatsappConversation.findMany({
    where: {
      templeId,
      channel,
      isGroup: false,
      hiddenAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { lastMessage: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: Math.min(Math.max((offset + limit) * 3, 180), 600),
    include: {
      messages: {
        orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
        take: 30,
        select: {
          payload: true,
        },
      },
    },
  });

  const members = await prisma.member.findMany({
    where: {
      templeId,
      deletedAt: null,
      OR: [{ whatsapp: { not: null } }, { telefone: { not: null } }],
    },
    select: {
      nome: true,
      whatsapp: true,
      telefone: true,
    },
  });

  const membersByPhone = new Map<string, string>();
  for (const member of members) {
    const whatsapp = normalizeWhatsappNumber(member.whatsapp || "");
    const telefone = normalizeWhatsappNumber(member.telefone || "");

    if (isUsablePhone(whatsapp)) {
      membersByPhone.set(whatsapp, member.nome);
    }

    if (isUsablePhone(telefone)) {
      membersByPhone.set(telefone, member.nome);
    }
  }

  function resolveMemberName(phone: string) {
    if (!isUsablePhone(phone)) {
      return "";
    }

    for (const [storedPhone, name] of membersByPhone) {
      if (phonesMatch(storedPhone, phone)) {
        return name;
      }
    }

    return "";
  }

  const uniqueChats = Array.from(
    chats
      .reduce((acc, chat) => {
        const phoneFromMessages =
          chat.messages
            .map((message) => extractPhoneFromMessagePayload(message.payload))
            .find(isUsablePhone) || "";
        const displayPhone = isUsablePhone(chat.phone || "")
          ? chat.phone || ""
          : phoneFromMessages;
        const key =
          displayPhone || chat.remoteJid;
        const current = acc.get(key);
        const normalizedChat = {
          ...chat,
          phone: displayPhone,
          name: resolveDisplayName({
            name: chat.name,
            pushName: chat.pushName,
            phone: displayPhone,
            channel,
            memberName: resolveMemberName(displayPhone),
          }),
        };

        if (!current) {
          acc.set(key, normalizedChat);
          return acc;
        }

        const currentDate = current.lastMessageAt || current.updatedAt;
        const nextDate = chat.lastMessageAt || chat.updatedAt;

        if (nextDate > currentDate) {
          acc.set(key, {
            ...normalizedChat,
            phone: displayPhone,
            name: preferContactName(normalizedChat.name, current.name, displayPhone),
            unreadCount: current.unreadCount + chat.unreadCount,
          });
        } else {
          acc.set(key, {
            ...current,
            phone: current.phone || displayPhone,
            name: preferContactName(current.name, normalizedChat.name, current.phone || displayPhone),
            unreadCount: current.unreadCount + chat.unreadCount,
          });
        }

        return acc;
      }, new Map<string, (typeof chats)[number]>())
      .values()
  );

  const resolvedAvatarPhones = new Map<string, string>();
  for (const chat of uniqueChats) {
    if (chat.profilePicUrl && isUsablePhone(chat.phone || "")) {
      const current = resolvedAvatarPhones.get(chat.profilePicUrl);
      resolvedAvatarPhones.set(
        chat.profilePicUrl,
        current && current !== chat.phone ? "" : chat.phone || ""
      );
    }
  }

  const finalChats = Array.from(
    uniqueChats
      .reduce((acc, chat) => {
        const avatarPhone = chat.profilePicUrl
          ? resolvedAvatarPhones.get(chat.profilePicUrl) || ""
          : "";
        const identity = isUsablePhone(chat.phone || "")
          ? chat.phone || ""
          : avatarPhone || chat.remoteJid;
        const current = acc.get(identity);

        if (!current) {
          acc.set(identity, chat);
          return acc;
        }

        const currentDate = current.lastMessageAt || current.updatedAt;
        const nextDate = chat.lastMessageAt || chat.updatedAt;
        const latest = nextDate > currentDate ? chat : current;
        const other = latest.id === chat.id ? current : chat;

        acc.set(identity, {
          ...latest,
          phone: latest.phone || other.phone || avatarPhone,
          name:
            resolveMemberName(identity) ||
            preferContactName(latest.name, other.name, latest.phone || other.phone),
          profilePicUrl: latest.profilePicUrl || other.profilePicUrl,
          unreadCount: Math.max(latest.unreadCount, other.unreadCount),
        });
        return acc;
      }, new Map<string, (typeof uniqueChats)[number]>())
      .values()
  ).slice(offset, offset + limit);

  return finalChats.map((chat) => ({
    id: chat.remoteJid,
    remoteJid: chat.remoteJid,
    name: chat.name || "Contato sem nome",
    phone: isUsablePhone(chat.phone || "") ? chat.phone || "" : "",
    avatarUrl: chat.profilePicUrl,
    lastMessage: chat.lastMessage || "Sem mensagens recentes",
    lastTime: formatTime(chat.lastMessageAt || chat.updatedAt),
    unread: chat.unreadCount,
  }));
}

export async function getStoredFinanceiroAvatarUrl(
  templeId: string,
  remoteJid: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const conversation = await prisma.whatsappConversation.findFirst({
    where: {
      templeId,
      channel,
      remoteJid,
      isGroup: false,
    },
    select: { profilePicUrl: true },
  });

  return conversation?.profilePicUrl || null;
}

export async function updateStoredFinanceiroAvatarUrl(
  templeId: string,
  remoteJid: string,
  profilePicUrl: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  await prisma.whatsappConversation.updateMany({
    where: { templeId, channel, remoteJid },
    data: { profilePicUrl },
  });
}

export async function listStoredFinanceiroMessages(
  templeId: string,
  remoteJid: string,
  limit = 60,
  offset = 0,
  phoneIdentity?: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const normalizedPhone = normalizeWhatsappNumber(phoneIdentity || remoteJid);
  const selectedConversation = await prisma.whatsappConversation.findFirst({
    where: {
      templeId,
      channel,
      OR: [
        ...(remoteJid ? [{ remoteJid }] : []),
        ...(isUsablePhone(normalizedPhone) ? [{ phone: normalizedPhone }] : []),
      ],
    },
    select: {
      phone: true,
      clearedAt: true,
    },
  });

  const messages = await prisma.whatsappMessage.findMany({
    where: {
      templeId,
      channel,
      ...(selectedConversation?.phone
        ? {
            conversation: {
              phone: selectedConversation.phone,
            },
          }
        : { remoteJid }),
      ...(selectedConversation?.clearedAt
        ? {
            OR: [
              { sentAt: { gt: selectedConversation.clearedAt } },
              {
                sentAt: null,
                createdAt: { gt: selectedConversation.clearedAt },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    skip: offset,
  });

  return messages
    .slice()
    .filter((message) => message.messageType !== "reactionMessage")
    .reverse()
    .map((message) => ({
      id: message.messageId,
      remoteJid: message.remoteJid || remoteJid,
      fromMe: message.fromMe,
      author: message.fromMe ? "atendente" : "contato",
      text: message.text || "",
      time: formatTime(message.sentAt || message.createdAt),
      type: message.messageType?.includes("image")
        ? "image"
        : message.messageType?.includes("video")
          ? "video"
          : message.messageType?.includes("audio")
            ? "audio"
            : message.messageType?.includes("document")
              ? "document"
              : "text",
      mediaUrl: message.mediaUrl || undefined,
      fileName: message.fileName || undefined,
    }));
}

export async function listHiddenFinanceiroConversationIdentities(templeId: string) {
  const conversations = await prisma.whatsappConversation.findMany({
    where: {
      templeId,
      channel: FINANCEIRO_CHANNEL,
      isGroup: false,
      hiddenAt: { not: null },
    },
    select: {
      phone: true,
      remoteJid: true,
    },
  });

  return conversations.map((conversation) => ({
    phone: conversation.phone || "",
    remoteJid: conversation.remoteJid,
  }));
}

export async function getStoredFinanceiroMessagePayload(
  templeId: string,
  messageId: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  return prisma.whatsappMessage.findFirst({
    where: { templeId, channel, messageId },
    select: {
      payload: true,
      remoteJid: true,
      fromMe: true,
      mimetype: true,
      fileName: true,
    },
  });
}

export async function createStoredWhatsappConversation(
  templeId: string,
  phoneInput: string,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const phone = normalizeBrazilianPhone(phoneInput);

  if (!isUsablePhone(phone)) {
    throw new Error("Informe um WhatsApp válido com DDD.");
  }

  const existing = await prisma.whatsappConversation.findFirst({
    where: { templeId, channel, phone, isGroup: false },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });
  const memberName = await resolveMemberNameByPhone(templeId, phone);
  const remoteJid = `${phone}@s.whatsapp.net`;
  const conversation = existing
    ? await prisma.whatsappConversation.update({
        where: { id: existing.id },
        data: {
          name: memberName || existing.name || phone,
          hiddenAt: null,
        },
      })
    : await prisma.whatsappConversation.upsert({
        where: {
          templeId_channel_remoteJid: { templeId, channel, remoteJid },
        },
        create: {
          templeId,
          channel,
          instance: getEvolutionInstanceName(channel),
          remoteJid,
          phone,
          name: memberName || phone,
          isGroup: false,
        },
        update: {
          phone,
          name: memberName || phone,
          hiddenAt: null,
        },
      });

  return {
    id: conversation.remoteJid,
    remoteJid: conversation.remoteJid,
    name: conversation.name || phone,
    phone,
    avatarUrl: conversation.profilePicUrl,
    lastMessage: conversation.lastMessage || "Nova conversa",
    lastTime: formatTime(conversation.lastMessageAt || conversation.updatedAt),
    unread: conversation.unreadCount,
  };
}

export async function getFinanceiroConversationState(
  templeId: string,
  identity: { remoteJid?: string; phone?: string }
) {
  const conversations = await findFinanceiroConversationsByIdentity(templeId, identity);

  if (!conversations.length) {
    return null;
  }

  return prisma.whatsappConversation.findFirst({
    where: {
      id: { in: conversations.map((conversation) => conversation.id) },
    },
    select: {
      clearedAt: true,
      hiddenAt: true,
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });
}

async function findFinanceiroConversationsByIdentity(
  templeId: string,
  identity: { remoteJid?: string; phone?: string },
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const phone = normalizeWhatsappNumber(identity.phone || identity.remoteJid || "");
  const remoteJid = identity.remoteJid || "";

  return prisma.whatsappConversation.findMany({
    where: {
      templeId,
      channel,
      isGroup: false,
      OR: [
        ...(remoteJid ? [{ remoteJid }] : []),
        ...(isUsablePhone(phone) ? [{ phone }] : []),
      ],
    },
    select: {
      id: true,
      phone: true,
      remoteJid: true,
    },
  });
}

export async function clearStoredFinanceiroConversation(
  templeId: string,
  identity: { remoteJid?: string; phone?: string },
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const conversations = await findFinanceiroConversationsByIdentity(templeId, identity, channel);
  const now = new Date();

  if (!conversations.length) {
    return { updated: 0 };
  }

  const result = await prisma.whatsappConversation.updateMany({
    where: {
      id: { in: conversations.map((conversation) => conversation.id) },
    },
    data: {
      clearedAt: now,
      lastMessage: null,
      unreadCount: 0,
    },
  });

  return { updated: result.count };
}

export async function hideStoredFinanceiroConversation(
  templeId: string,
  identity: { remoteJid?: string; phone?: string },
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const conversations = await findFinanceiroConversationsByIdentity(templeId, identity, channel);
  const now = new Date();

  if (!conversations.length) {
    return { updated: 0 };
  }

  const result = await prisma.whatsappConversation.updateMany({
    where: {
      id: { in: conversations.map((conversation) => conversation.id) },
    },
    data: {
      hiddenAt: now,
      unreadCount: 0,
    },
  });

  return { updated: result.count };
}

export async function persistFinanceiroWebhookPayload(
  payload: unknown,
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  const templeId = await resolveEvolutionTempleId();
  const record = isRecord(payload) ? payload : {};
  const rawData = record.data ?? record;
  const rawMessages = Array.isArray(rawData)
    ? rawData
    : isRecord(rawData) && Array.isArray(rawData.messages)
      ? rawData.messages
      : isRecord(rawData) &&
          isRecord(rawData.messages) &&
          Array.isArray(rawData.messages.records)
        ? rawData.messages.records
        : [rawData];
  const savedMessages = [];
  let lastRemoteJid = "";
  let lastPhone = "";

  for (const rawMessage of rawMessages) {
    const data = isRecord(rawMessage) ? rawMessage : {};
  const remoteJid =
    isRecord(data.key) && typeof data.key.remoteJid === "string"
      ? data.key.remoteJid
      : typeof data.remoteJid === "string"
        ? data.remoteJid
        : "";

  const messageLike = {
    id: getString(data.id),
    key: isRecord(data.key) ? data.key : undefined,
    pushName: getString(data.pushName),
    messageType: getString(data.messageType),
    message: isRecord(data.message) ? data.message : undefined,
    messageTimestamp:
      typeof data.messageTimestamp === "string" ||
      typeof data.messageTimestamp === "number"
        ? data.messageTimestamp
        : undefined,
    timestamp:
      typeof data.timestamp === "string" || typeof data.timestamp === "number"
        ? data.timestamp
        : undefined,
    createdAt: getString(data.createdAt),
    updatedAt: getString(data.updatedAt),
    status: getString(data.status),
  } as EvolutionMessage;

  const savedMessage = await saveFinanceiroMessage(templeId, messageLike, remoteJid, channel);

    if (savedMessage) {
      savedMessages.push(savedMessage);
      lastRemoteJid = remoteJid || messageLike.key?.remoteJid || lastRemoteJid;
      lastPhone =
        normalizeWhatsappNumber(messageLike.key?.remoteJidAlt || lastRemoteJid) ||
        lastPhone;
    }
  }

  return {
    templeId,
    remoteJid: lastRemoteJid,
    phone: lastPhone,
    savedMessage: savedMessages[0] || null,
    savedMessages,
  };
}

export async function persistFinanceiroChatsFromEvolution(
  templeId: string,
  chats: unknown[],
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  for (const chat of chats) {
    if (isRecord(chat)) {
      await saveFinanceiroChat(templeId, chat as EvolutionChat, channel);
    }
  }
}

export async function persistFinanceiroMessagesFromEvolution(
  templeId: string,
  remoteJid: string,
  messages: unknown[],
  channel: EvolutionWhatsappChannel = FINANCEIRO_CHANNEL
) {
  for (const message of messages) {
    if (isRecord(message)) {
      await saveFinanceiroMessage(templeId, message as EvolutionMessage, remoteJid, channel);
    }
  }
}
