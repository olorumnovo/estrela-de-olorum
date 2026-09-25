"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  Eraser,
  ExternalLink,
  FileImage,
  Mic,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smile,
  Square,
  Trash2,
  X,
} from "lucide-react";

type ChannelKey = "tenda" | "financeiro";

type ConversationItem = {
  id: string;
  remoteJid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastTime: string;
  unread?: number;
};

type MessageItem = {
  id: string;
  remoteJid?: string;
  fromMe?: boolean;
  author: "contato" | "atendente";
  text: string;
  time: string;
  type?: "text" | "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  fileName?: string;
};

function formatConversationPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits || phone.includes("@lid")) {
    return "";
  }

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return phone;
}

const channels: Array<{ id: ChannelKey; label: string; subtitle: string }> = [
  {
    id: "tenda",
    label: "WhatsApp Tenda",
    subtitle: "Atendimento geral e espiritual",
  },
  {
    id: "financeiro",
    label: "WhatsApp Financeiro",
    subtitle: "Cobranças, pagamentos e dúvidas financeiras",
  },
];

const mockConversations: Record<ChannelKey, ConversationItem[]> = {
  tenda: [],
  financeiro: [],
};

const mockMessages: Record<string, MessageItem[]> = {};
const CHAT_REFRESH_MS = 5000;
const MESSAGE_REFRESH_MS = 5000;

function ConversationAvatar({
  conversation,
  apiBase,
  size = "small",
}: {
  conversation: ConversationItem;
  apiBase: string;
  size?: "small" | "large";
}) {
  const source = `${apiBase}/avatar?remoteJid=${encodeURIComponent(
    conversation.remoteJid
  )}&phone=${encodeURIComponent(conversation.phone)}`;
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "large" ? "h-12 w-12" : "h-11 w-11";
  const initials = conversation.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => setFailed(false), [source]);

  if (failed) {
    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-[#DCE6FF] text-sm font-semibold text-[#2F5BFF]`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={`Foto de ${conversation.name}`}
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 rounded-full object-cover`}
    />
  );
}

export default function ConversasPage() {
  return (
    <Suspense fallback={null}>
      <ConversasContent />
    </Suspense>
  );
}

function ConversasContent() {
  const searchParams = useSearchParams();
  const requestedChannel = searchParams.get("channel");
  const initialChannel: ChannelKey =
    requestedChannel === "financeiro" ? "financeiro" : "tenda";
  const [activeChannel, setActiveChannel] = useState<ChannelKey>(initialChannel);
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationAction, setConversationAction] = useState<"clear" | "delete" | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactError, setNewContactError] = useState("");
  const [newContact, setNewContact] = useState<{
    phone: string;
    channel: ChannelKey;
  }>({ phone: "", channel: initialChannel });
  const [whatsappConversations, setWhatsappConversations] =
    useState<Record<ChannelKey, ConversationItem[]>>(mockConversations);
  const [messageMap, setMessageMap] = useState<Record<string, MessageItem[]>>(
    mockMessages
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const cancelRecordingRef = useRef(false);

  const isWhatsAppChannel = activeChannel === "financeiro" || activeChannel === "tenda";
  const apiBase = `/api/conversations/evolution/${activeChannel}`;

  const loadFinanceiroChats = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoadingChats(true);
      }

      try {
        const response = await fetch(
          `${apiBase}/chats?q=${encodeURIComponent(
            search.trim()
          )}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar conversas.");
        }

        const chats: ConversationItem[] = Array.isArray(data.chats) ? data.chats : [];
        setWhatsappConversations((current) => ({
          ...current,
          [activeChannel]: chats,
        }));
        setSelectedConversationId((current) =>
          chats.some((chat) => chat.id === current) ? current : chats[0]?.id || ""
        );
      } catch (error) {
        setInfoMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as conversas."
        );
      } finally {
        setLoadingChats(false);
      }
    },
    [apiBase, search]
  );

  const loadFinanceiroMessages = useCallback(
    async (conversation: ConversationItem, silent = false) => {
      if (!conversation?.remoteJid) {
        return;
      }

      if (!silent) {
        setLoadingMessages(true);
      }

      try {
        const response = await fetch(
          `${apiBase}/messages?remoteJid=${encodeURIComponent(
            conversation.remoteJid
          )}&phone=${encodeURIComponent(conversation.phone)}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Erro ao carregar mensagens.");
        }

        const mapKey = `${activeChannel}:${conversation.id}`;
        setMessageMap((current) => ({
          ...current,
          [mapKey]: Array.isArray(data.messages) ? data.messages : [],
        }));
      } catch (error) {
        setInfoMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as mensagens."
        );
      } finally {
        setLoadingMessages(false);
      }
    },
    [activeChannel, apiBase]
  );

  useEffect(() => {
    if (!isWhatsAppChannel) {
      return;
    }

    const timeout = window.setTimeout(() => loadFinanceiroChats(), 250);
    return () => window.clearTimeout(timeout);
  }, [isWhatsAppChannel, loadFinanceiroChats]);

  useEffect(() => {
    if (!isWhatsAppChannel) {
      return;
    }

    const interval = window.setInterval(() => {
      loadFinanceiroChats(true);
    }, CHAT_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [isWhatsAppChannel, loadFinanceiroChats]);

  const conversations = useMemo(() => {
    return whatsappConversations[activeChannel] || [];
  }, [activeChannel, whatsappConversations]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ||
    conversations[0] ||
    null;

  const selectedMessageMapKey = selectedConversation
    ? `${activeChannel}:${selectedConversation.id}`
    : "";
  const selectedMessages = selectedMessageMapKey
    ? messageMap[selectedMessageMapKey] || []
    : [];

  const visibleMessages = selectedMessages.filter(
    (message) => message.text || message.mediaUrl || message.type !== "text"
  );

  function mediaSource(message: MessageItem, download = false) {
    if (!message.remoteJid || !message.id) {
      return message.mediaUrl || "";
    }

    return `${apiBase}/media?remoteJid=${encodeURIComponent(
      message.remoteJid
    )}&messageId=${encodeURIComponent(message.id)}&fromMe=${message.fromMe ? "true" : "false"}${
      download ? "&download=1" : ""
    }`;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedConversation?.id, visibleMessages.length]);

  useEffect(() => {
    if (!isWhatsAppChannel || !selectedConversation) {
      return;
    }

    const timeout = window.setTimeout(() => {
      loadFinanceiroMessages(selectedConversation);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isWhatsAppChannel, loadFinanceiroMessages, selectedConversation]);

  useEffect(() => {
    if (!isWhatsAppChannel || !selectedConversation) {
      return;
    }

    const interval = window.setInterval(() => {
      loadFinanceiroMessages(selectedConversation, true);
    }, MESSAGE_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [isWhatsAppChannel, loadFinanceiroMessages, selectedConversation]);

  useEffect(() => {
    if (!isWhatsAppChannel) {
      return;
    }

    const events = new EventSource(
      `${apiBase}/events`
    );

    events.addEventListener("whatsapp", (event) => {
      const payload = JSON.parse((event as MessageEvent).data || "{}");
      loadFinanceiroChats(true);

      if (
        selectedConversation &&
        (!payload.remoteJid ||
          payload.remoteJid === selectedConversation.remoteJid ||
          (payload.phone && payload.phone === selectedConversation.phone))
      ) {
        loadFinanceiroMessages(selectedConversation, true);
      }
    });

    events.onerror = () => {
      events.close();
    };

    return () => events.close();
  }, [
    apiBase,
    isWhatsAppChannel,
    loadFinanceiroChats,
    loadFinanceiroMessages,
    selectedConversation,
  ]);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || !isWhatsAppChannel) {
      return;
    }

    const text = draft.trim();

    if (!text && !attachment && !audioBlob) {
      return;
    }

    setSending(true);
    setInfoMessage("");

    try {
      let response: Response;

      if (audioBlob) {
        const form = new FormData();
        form.set("kind", "audio");
        form.set("remoteJid", selectedConversation.remoteJid);
        form.set("phone", selectedConversation.phone);
        form.set("file", audioBlob, "audio.webm");
        response = await fetch(`${apiBase}/send`, {
          method: "POST",
          body: form,
        });
      } else if (attachment) {
        const form = new FormData();
        form.set("kind", "media");
        form.set("remoteJid", selectedConversation.remoteJid);
        form.set("phone", selectedConversation.phone);
        form.set("caption", text);
        form.set("file", attachment);
        response = await fetch(`${apiBase}/send`, {
          method: "POST",
          body: form,
        });
      } else {
        response = await fetch(`${apiBase}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            remoteJid: selectedConversation.remoteJid,
            phone: selectedConversation.phone,
            text,
          }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível enviar a mensagem.");
      }

      setDraft("");
      setAttachment(null);
      setAudioBlob(null);
      setInfoMessage("Mensagem enviada com sucesso.");
      await loadFinanceiroMessages(selectedConversation, true);
      await loadFinanceiroChats(true);
    } catch (error) {
      setInfoMessage(
        error instanceof Error ? error.message : "Não foi possível enviar a mensagem."
      );
    } finally {
      setSending(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false;
          chunksRef.current = [];
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
        setInfoMessage("Áudio gravado. Clique em enviar para mandar no WhatsApp.");
      };

      cancelRecordingRef.current = false;
      recorder.start();
      setRecording(true);
      setAttachment(null);
      setInfoMessage("Gravando áudio...");
    } catch {
      setInfoMessage("Não foi possível acessar o microfone neste navegador.");
    }
  }

  function cancelPendingMedia() {
    if (recording) {
      cancelRecordingRef.current = true;
      recorderRef.current?.stop();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
    }

    setAttachment(null);
    setAudioBlob(null);
    setInfoMessage("");
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = newContact.phone.replace(/\D/g, "");

    if (phone.length < 10) {
      setNewContactError("Informe um número de WhatsApp válido com DDD.");
      return;
    }

    setCreatingContact(true);
    setNewContactError("");

    try {
      const response = await fetch(
        `/api/conversations/evolution/${newContact.channel}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", phone }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.chat) {
        throw new Error(data.message || "Não foi possível iniciar a conversa.");
      }

      const chat = data.chat as ConversationItem;
      setWhatsappConversations((current) => ({
        ...current,
        [newContact.channel]: [
          chat,
          ...(current[newContact.channel] || []).filter(
            (item) => item.id !== chat.id && item.phone !== chat.phone
          ),
        ],
      }));
      setActiveChannel(newContact.channel);
      setSelectedConversationId(chat.id);
      setNewContact({ phone: "", channel: newContact.channel });
      setNewContactOpen(false);
      setInfoMessage("Nova conversa pronta. Digite a primeira mensagem.");
    } catch (error) {
      setNewContactError(
        error instanceof Error ? error.message : "Não foi possível iniciar a conversa."
      );
    } finally {
      setCreatingContact(false);
    }
  }

  async function handleConversationAction(action: "clear" | "delete") {
    if (!selectedConversation || !isWhatsAppChannel) {
      return;
    }

    const confirmed = window.confirm(
      action === "clear"
        ? `Deseja limpar as mensagens da conversa com ${selectedConversation.name}?`
        : `Deseja apagar a conversa com ${selectedConversation.name} da lista?`
    );

    if (!confirmed) {
      return;
    }

    setConversationAction(action);
    setInfoMessage("");

    try {
      const response = await fetch(
        `${apiBase}/conversations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            remoteJid: selectedConversation.remoteJid,
            phone: selectedConversation.phone,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível atualizar a conversa.");
      }

      if (action === "clear") {
        setMessageMap((current) => ({
          ...current,
          [`${activeChannel}:${selectedConversation.id}`]: [],
        }));
        setInfoMessage("Conversa limpa.");
        await loadFinanceiroMessages(selectedConversation, true);
        await loadFinanceiroChats(true);
      } else {
        setWhatsappConversations((current) => {
          const currentChannelConversations = current[activeChannel] || [];
          const next = currentChannelConversations.filter(
            (conversation) =>
              conversation.remoteJid !== selectedConversation.remoteJid &&
              conversation.phone !== selectedConversation.phone
          );
          setSelectedConversationId(next[0]?.id || "");
          return {
            ...current,
            [activeChannel]: next,
          };
        });
        setInfoMessage("Conversa apagada da lista.");
      }
    } catch (error) {
      setInfoMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a conversa."
      );
    } finally {
      setConversationAction(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-116px)] bg-[#F8F8F7] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="rounded-[28px] border border-[#ECE7DB] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
                <span>início</span>
                <span>—</span>
                <span>conversas</span>
              </div>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#171717]">
                Conversas
              </h1>
              <p className="mt-1 text-sm text-[#7A746A]">
                Central de atendimento integrada ao WhatsApp.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewContact((current) => ({ ...current, channel: activeChannel }));
                  setNewContactOpen(true);
                  setNewContactError("");
                  setInfoMessage("");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#D9A520] bg-[#FFF8E7] px-5 py-2.5 text-sm font-semibold text-[#8B6508] transition hover:bg-[#FFF1C7]"
              >
                <Plus size={17} />
                Novo contato
              </button>
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setActiveChannel(channel.id);
                    setSelectedConversationId(
                      whatsappConversations[channel.id]?.[0]?.id || ""
                    );
                    setSearch("");
                    setInfoMessage("");
                  }}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    activeChannel === channel.id
                      ? "bg-[#2F5BFF] text-white"
                      : "border border-[#E9E1D2] bg-white text-[#1D1B18]"
                  }`}
                >
                  {channel.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="grid h-[calc(100vh-250px)] min-h-[620px] grid-cols-1 overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm lg:grid-cols-[360px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-[#EEE7D9] bg-[#FCFBF8]">
            <div className="border-b border-[#EEE7D9] p-4">
              <p className="text-sm font-semibold text-[#171717]">
                {channels.find((channel) => channel.id === activeChannel)?.label}
              </p>
              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#7A746A]">
                <Search size={16} className="text-[#A1988B]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar conversa ou telefone"
                  className="w-full bg-transparent outline-none placeholder:text-[#A1988B]"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingChats && conversations.length === 0 ? (
                <div className="p-5 text-sm text-[#8B8478]">
                  Carregando conversas...
                </div>
              ) : null}

              {conversations.map((conversation) => {
                const active = conversation.id === selectedConversationId;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setInfoMessage("");
                    }}
                    className={`flex w-full items-start gap-3 border-b border-[#F3EEDF] px-4 py-4 text-left transition ${
                      active ? "bg-[#EEF3FF]" : "hover:bg-white"
                    }`}
                  >
                    <ConversationAvatar conversation={conversation} apiBase={apiBase} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[#171717]">
                          {conversation.name}
                        </p>
                        <span className="shrink-0 text-xs text-[#8B8478]">
                          {conversation.lastTime}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-[#8B8478]">
                        {formatConversationPhone(conversation.phone)}
                      </p>
                      <p className="mt-1 truncate text-sm text-[#5C554A]">
                        {conversation.lastMessage}
                      </p>
                    </div>

                    {conversation.unread ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2F5BFF] px-1 text-[10px] font-bold text-white">
                        {conversation.unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col bg-[#F6F1E9]">
            {selectedConversation ? (
              <>
                <div className="flex items-center justify-between border-b border-[#E7DFD2] bg-white px-5 py-4">
                  <div className="flex items-center gap-3">
                    <ConversationAvatar
                      conversation={selectedConversation}
                      apiBase={apiBase}
                      size="large"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#171717]">
                        {selectedConversation.name}
                      </p>
                      <p className="text-xs text-[#8B8478]">
                        {formatConversationPhone(selectedConversation.phone)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[#8B8478]">
                    {loadingMessages ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : null}
                    {isWhatsAppChannel ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConversationAction("clear")}
                          disabled={Boolean(conversationAction)}
                          className="inline-flex items-center gap-1 rounded-full border border-[#E9E1D2] bg-white px-3 py-2 text-xs font-semibold text-[#5C554A] transition hover:bg-[#FAF7F1] disabled:opacity-60"
                        >
                          <Eraser size={15} />
                          {conversationAction === "clear" ? "Limpando..." : "Limpar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConversationAction("delete")}
                          disabled={Boolean(conversationAction)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 size={15} />
                          {conversationAction === "delete" ? "Apagando..." : "Apagar"}
                        </button>
                      </>
                    ) : null}
                    <Phone size={18} />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
                  {visibleMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.author === "atendente" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                          message.author === "atendente"
                            ? "bg-[#DCF8C6] text-[#171717]"
                            : "bg-white text-[#171717]"
                        }`}
                      >
                        {message.type === "image" ? (
                          <a
                            href={mediaSource(message)}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir imagem"
                          >
                            <img
                              src={mediaSource(message)}
                              alt={message.fileName || "Imagem da conversa"}
                              className="mb-2 max-h-80 cursor-zoom-in rounded-xl object-contain"
                            />
                          </a>
                        ) : null}
                        {message.type === "audio" ? (
                          <audio
                            controls
                            preload="metadata"
                            src={mediaSource(message)}
                            className="mb-2 w-72 max-w-full"
                          >
                            Seu navegador não conseguiu reproduzir este áudio.
                          </audio>
                        ) : null}
                        {message.type === "video" ? (
                          <video
                            controls
                            preload="metadata"
                            src={mediaSource(message)}
                            className="mb-2 max-h-80 rounded-xl"
                          />
                        ) : null}
                        {message.type === "document" ? (
                          <p className="mb-2 text-sm font-semibold text-[#174EA6]">
                            {message.fileName || "Documento"}
                          </p>
                        ) : null}
                        {message.type && message.type !== "text" ? (
                          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#174EA6]">
                            {message.type !== "audio" ? (
                              <a
                                href={mediaSource(message)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                              >
                                <ExternalLink size={14} />
                                abrir mídia
                              </a>
                            ) : null}
                            <a
                              href={mediaSource(message, true)}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <Download size={14} />
                              baixar
                            </a>
                          </div>
                        ) : null}
                        {message.text ? (
                          <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                        ) : null}
                        <p className="mt-1 text-right text-[11px] text-[#8B8478]">
                          {message.time}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-[#E7DFD2] bg-white p-4">
                  {infoMessage ? (
                    <p className="mb-3 text-sm text-[#8B5E00]">{infoMessage}</p>
                  ) : null}

                  {(attachment || audioBlob || recording) && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E9E1D2] bg-[#FAF7F1] px-4 py-3 text-sm text-[#5C554A]">
                      <span>
                        {attachment ? `Arquivo selecionado: ${attachment.name}` : null}
                        {audioBlob ? "Áudio pronto para envio." : null}
                        {recording ? "Gravando áudio..." : null}
                      </span>
                      <button
                        type="button"
                        onClick={cancelPendingMedia}
                        className="rounded-full border border-[#E1D7C7] bg-white px-3 py-1 text-xs font-semibold text-[#8B5E00]"
                      >
                        cancelar
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} className="flex items-end gap-3">
                    <div className="flex gap-2 pb-2 text-[#8B8478]">
                      <label className="cursor-pointer rounded-full p-2 transition hover:bg-[#F5EFE4]">
                        <Paperclip size={18} />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                          onChange={(event) => {
                            setAttachment(event.target.files?.[0] || null);
                            setAudioBlob(null);
                            setInfoMessage("");
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={toggleRecording}
                        className={`rounded-full p-2 transition hover:bg-[#F5EFE4] ${
                          recording ? "bg-red-50 text-red-600" : ""
                        }`}
                      >
                        {recording ? <Square size={18} /> : <Mic size={18} />}
                      </button>

                      <label className="cursor-pointer rounded-full p-2 transition hover:bg-[#F5EFE4]">
                        <FileImage size={18} />
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*"
                          onChange={(event) => {
                            setAttachment(event.target.files?.[0] || null);
                            setAudioBlob(null);
                            setInfoMessage("");
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setDraft((current) => `${current}🙂`)}
                        className="rounded-full p-2 transition hover:bg-[#F5EFE4]"
                      >
                        <Smile size={18} />
                      </button>
                    </div>

                    <div className="flex-1 rounded-[24px] border border-[#E9E1D2] bg-[#F9F7F3] px-4 py-3">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={
                          attachment ? "Legenda opcional" : "Digite uma mensagem"
                        }
                        rows={2}
                        className="max-h-40 w-full resize-none bg-transparent text-sm text-[#171717] outline-none placeholder:text-[#A1988B]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        sending ||
                        recording ||
                        (!draft.trim() && !attachment && !audioBlob)
                      }
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#2F5BFF] text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[#8B8478]">
                {isWhatsAppChannel && loadingChats
                  ? "Carregando conversas..."
                  : "Nenhuma conversa encontrada neste canal."}
              </div>
            )}
          </div>
        </section>
      </div>

      {newContactOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-[#ECE7DB] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C6921E]">
                  WhatsApp
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#171717]">
                  Novo contato
                </h2>
                <p className="mt-1 text-sm text-[#7A746A]">
                  Informe o número e escolha por qual WhatsApp deseja conversar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewContactOpen(false)}
                className="rounded-full border border-[#E9E1D2] p-2 text-[#7A746A] hover:bg-[#F8F5EF]"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="mt-6 space-y-5">
              {newContactError ? (
                <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {newContactError}
                </p>
              ) : null}
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[#39352F]">Número com DDD</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  value={newContact.phone}
                  onChange={(event) =>
                    setNewContact((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Ex.: 11 99999-9999"
                  className="h-12 w-full rounded-2xl border border-[#E9E1D2] px-4 text-sm outline-none focus:border-[#2F5BFF]"
                  required
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-[#39352F]">Enviar pelo</legend>
                <div className="grid grid-cols-2 gap-3">
                  {channels.map((channel) => (
                    <label
                      key={channel.id}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${
                        newContact.channel === channel.id
                          ? "border-[#2F5BFF] bg-[#EEF3FF]"
                          : "border-[#E9E1D2] bg-white hover:bg-[#FAF8F4]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="new-contact-channel"
                        value={channel.id}
                        checked={newContact.channel === channel.id}
                        onChange={() =>
                          setNewContact((current) => ({
                            ...current,
                            channel: channel.id,
                          }))
                        }
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-[#171717]">
                        {channel.id === "tenda" ? "Tenda" : "Financeiro"}
                      </span>
                      <span className="mt-1 block text-xs text-[#7A746A]">
                        {channel.subtitle}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewContactOpen(false)}
                  className="rounded-full border border-[#E9E1D2] px-5 py-2.5 text-sm font-semibold text-[#5C554A]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingContact}
                  className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creatingContact ? "Criando..." : "Iniciar conversa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
