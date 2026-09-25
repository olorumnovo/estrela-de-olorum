-- CreateTable
CREATE TABLE "public"."WhatsappConversation" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "pushName" TEXT,
    "profilePicUrl" TEXT,
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WhatsappMessage" (
    "id" TEXT NOT NULL,
    "templeId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channel" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "pushName" TEXT,
    "messageType" TEXT,
    "text" TEXT,
    "mediaUrl" TEXT,
    "fileName" TEXT,
    "mimetype" TEXT,
    "status" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_templeId_channel_remoteJid_key" ON "public"."WhatsappConversation"("templeId", "channel", "remoteJid");

-- CreateIndex
CREATE INDEX "WhatsappConversation_templeId_channel_updatedAt_idx" ON "public"."WhatsappConversation"("templeId", "channel", "updatedAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_remoteJid_idx" ON "public"."WhatsappConversation"("remoteJid");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_templeId_channel_messageId_key" ON "public"."WhatsappMessage"("templeId", "channel", "messageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_templeId_channel_remoteJid_sentAt_idx" ON "public"."WhatsappMessage"("templeId", "channel", "remoteJid", "sentAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_idx" ON "public"."WhatsappMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "public"."WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_templeId_fkey" FOREIGN KEY ("templeId") REFERENCES "public"."Temple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
