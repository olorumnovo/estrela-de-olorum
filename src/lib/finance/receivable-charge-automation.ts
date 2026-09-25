import { PaymentStatus, Prisma, TransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const CHARGE_AUTOMATION_KEY = "whatsapp_charge_automation";
export const CHARGE_INTERVAL_MINUTES = 5;

export type ChargeAutomationState = {
  enabled: boolean;
  nextSendAt: string | null;
};

const initialState: ChargeAutomationState = { enabled: false, nextSendAt: null };

function parseState(value: string | null): ChargeAutomationState {
  try {
    const parsed = JSON.parse(value || "null");
    return {
      enabled: parsed?.enabled === true,
      nextSendAt: typeof parsed?.nextSendAt === "string" ? parsed.nextSendAt : null,
    };
  } catch {
    return initialState;
  }
}

export async function getChargeAutomationSetting(templeId: string) {
  return prisma.setting.upsert({
    where: { templeId_chave: { templeId, chave: CHARGE_AUTOMATION_KEY } },
    create: { templeId, chave: CHARGE_AUTOMATION_KEY, valor: JSON.stringify(initialState) },
    update: {},
  });
}

export async function getChargeAutomationState(templeId: string) {
  return parseState((await getChargeAutomationSetting(templeId)).valor);
}

export async function setChargeAutomationEnabled(templeId: string, enabled: boolean) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const setting = await getChargeAutomationSetting(templeId);
    const current = parseState(setting.valor);
    const next: ChargeAutomationState = {
      enabled,
      nextSendAt: enabled ? (current.enabled ? current.nextSendAt : new Date().toISOString()) : null,
    };
    const updated = await prisma.setting.updateMany({
      where: { id: setting.id, valor: setting.valor },
      data: { valor: JSON.stringify(next) },
    });
    if (updated.count === 1) return next;
  }
  throw new Error("O estado da automação mudou. Tente novamente.");
}

// Reserva um único intervalo no banco antes de chamar o provedor. Invocações
// simultâneas não conseguem reservar o mesmo intervalo.
export async function claimChargeSendSlot(templeId: string) {
  const setting = await getChargeAutomationSetting(templeId);
  const current = parseState(setting.valor);
  const now = Date.now();
  if (!current.enabled || (current.nextSendAt && Date.parse(current.nextSendAt) > now)) {
    return false;
  }
  const next = {
    enabled: true,
    nextSendAt: new Date(now + CHARGE_INTERVAL_MINUTES * 60_000).toISOString(),
  };
  const updated = await prisma.setting.updateMany({
    where: { id: setting.id, valor: setting.valor },
    data: { valor: JSON.stringify(next) },
  });
  return updated.count === 1;
}

export function overdueReceivablesWhere(templeId: string, activeMemberNames: string[], todayKey: string): Prisma.FinancialTransactionWhereInput {
  return {
    templeId,
    deletedAt: null,
    tipo: TransactionType.INCOME,
    status: { in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE] },
    sourcePages: { has: "EM_ABERTO" },
    centroCusto: { in: activeMemberNames },
    vencimento: { lt: new Date(`${todayKey}T00:00:00.000Z`) },
    OR: [
      { rawStatus: null },
      { NOT: { rawStatus: { contains: "cancel", mode: "insensitive" } } },
    ],
  };
}

export function saoPauloTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
