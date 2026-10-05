import { randomUUID } from "node:crypto";

import { checkFinanceiroWhatsappNumber, sendFinanceiroText } from "@/lib/evolution/financeiro";
import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/search";
import { getReceivableWhatsappTemplates, renderReceivableWhatsappTemplate } from "@/lib/finance/receivable-whatsapp-templates";
import { getChargeAutomationState, overdueReceivablesWhere, saoPauloTodayKey } from "@/lib/finance/receivable-charge-automation";

const QUEUE_KEY = "whatsapp_charge_manual_queue";
const MAX_JOBS = 500;
const PIX_TEXT = "Pix – CNPJ: 48.628.461/0001-30";

export type ManualChargeJob = {
  id: string;
  transactionId: string;
  memberName: string;
  amountOverride: number | null;
  template: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  createdAt: string;
  finishedAt?: string;
  error?: string;
};

function parseJobs(value: string | null): ManualChargeJob[] {
  try {
    const data: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((job): job is ManualChargeJob =>
      !!job && typeof job === "object" && typeof job.id === "string" && typeof job.transactionId === "string" &&
      ["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"].includes(job.status)
    );
  } catch {
    return [];
  }
}

async function queueSetting(templeId: string) {
  return prisma.setting.upsert({
    where: { templeId_chave: { templeId, chave: QUEUE_KEY } },
    create: { templeId, chave: QUEUE_KEY, valor: "[]" },
    update: {},
  });
}

async function mutateQueue<T>(templeId: string, change: (jobs: ManualChargeJob[]) => { jobs: ManualChargeJob[]; result: T }) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const setting = await queueSetting(templeId);
    const update = change(parseJobs(setting.valor));
    const saved = await prisma.setting.updateMany({
      where: { id: setting.id, valor: setting.valor },
      data: { valor: JSON.stringify(update.jobs) },
    });
    if (saved.count === 1) return update.result;
  }
  throw new Error("A fila foi alterada ao mesmo tempo. Tente novamente.");
}

export function parseChargeAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) return NaN;
  const amount = Number(normalized);
  return amount > 0 && amount <= 99999999.99 ? amount : NaN;
}

export async function listManualChargeJobs(templeId: string) {
  return parseJobs((await queueSetting(templeId)).valor).slice(-100).reverse();
}

export async function hasPendingManualCharge(templeId: string) {
  return parseJobs((await queueSetting(templeId)).valor).some((job) => job.status === "QUEUED");
}

export async function cancelManualCharge(templeId: string, id: string) {
  return mutateQueue(templeId, (jobs) => {
    const job = jobs.find((item) => item.id === id && item.status === "QUEUED");
    if (!job) return { jobs, result: false };
    return {
      jobs: jobs.map((item) => item.id === id ? { ...item, status: "SKIPPED" as const, error: "Cancelado manualmente.", finishedAt: new Date().toISOString() } : item),
      result: true,
    };
  });
}

export async function enqueueManualCharges(templeId: string, entries: Array<{ transactionId: string; amountOverride: number | null }>) {
  if (entries.length < 1 || entries.length > 100 || new Set(entries.map((item) => item.transactionId)).size !== entries.length) {
    throw new Error("Selecione de 1 a 100 contas distintas por envio.");
  }
  const activeMembers = await prisma.member.findMany({
    where: { templeId, deletedAt: null, status: "ACTIVE" },
    select: { nome: true, whatsapp: true, telefone: true },
  });
  const today = saoPauloTodayKey();
  const transactions = await prisma.financialTransaction.findMany({
    where: { ...overdueReceivablesWhere(templeId, activeMembers.map((member) => member.nome), today), id: { in: entries.map((item) => item.transactionId) } },
    select: { id: true, centroCusto: true, valor: true, amountPaid: true },
  });
  const byId = new Map(transactions.map((item) => [item.id, item]));
  for (const entry of entries) {
    const transaction = byId.get(entry.transactionId);
    if (!transaction || Number(transaction.valor) - Number(transaction.amountPaid || 0) <= 0) throw new Error("Uma das contas não está mais atrasada ou não tem saldo pendente. Atualize a lista.");
    const members = activeMembers.filter((member) => normalizeSearchText(member.nome) === normalizeSearchText(transaction.centroCusto));
    if (members.length !== 1 || !String(members[0].whatsapp || members[0].telefone || "").replace(/\D/g, "")) {
      throw new Error(`Não foi possível identificar um WhatsApp único para ${transaction.centroCusto || "uma das contas"}.`);
    }
  }
  const state = await getChargeAutomationState(templeId);
  const template = (await getReceivableWhatsappTemplates(templeId)).OVERDUE;
  if (entries.some((entry) => entry.amountOverride !== null) && !template.includes("{{valor_pendente}}")) {
    throw new Error("O modelo de cobrança atrasada precisa conter {{valor_pendente}} para usar valores personalizados.");
  }
  const recent = await prisma.whatsappChargeNotification.findMany({
    where: { templeId, transactionId: { in: entries.map((item) => item.transactionId) }, notificationType: { in: ["OVERDUE", "MANUAL_OVERDUE"] }, error: null, ...(state.repeatDays > 0 ? { createdAt: { gt: new Date(Date.now() - state.repeatDays * 86_400_000) } } : {}) },
    select: { transactionId: true, createdAt: true },
  });
  const cutoff = Date.now() - state.repeatDays * 86_400_000;
  if (recent.some((item) => state.repeatDays === 0 || item.createdAt.getTime() > cutoff)) {
    throw new Error(state.repeatDays === 0
      ? "Uma conta já foi cobrada antes. Configure a repetição para permitir novo envio."
      : `Uma conta já foi cobrada nos últimos ${state.repeatDays} dia(s). Remova-a da seleção antes de enfileirar.`);
  }
  const jobs = entries.map((entry) => ({
    id: randomUUID(), transactionId: entry.transactionId,
    memberName: byId.get(entry.transactionId)?.centroCusto || "",
    amountOverride: entry.amountOverride,
    template,
    status: "QUEUED" as const, createdAt: new Date().toISOString(),
  }));
  return mutateQueue(templeId, (current) => {
    const activeIds = new Set(current.filter((job) => job.status === "QUEUED" || job.status === "SENDING").map((job) => job.transactionId));
    if (jobs.some((job) => activeIds.has(job.transactionId))) throw new Error("Uma das contas já está na fila de cobrança.");
    if (current.filter((job) => job.status === "QUEUED" || job.status === "SENDING").length + jobs.length > 300) throw new Error("A fila está cheia. Aguarde os envios atuais.");
    const completed = current.filter((job) => job.status !== "QUEUED" && job.status !== "SENDING").slice(-100);
    const pending = current.filter((job) => job.status === "QUEUED" || job.status === "SENDING");
    return { jobs: [...completed, ...pending, ...jobs].slice(-MAX_JOBS), result: jobs };
  });
}

async function claimManualJob(templeId: string) {
  return mutateQueue(templeId, (jobs) => {
    const index = jobs.findIndex((job) => job.status === "QUEUED");
    if (index < 0) return { jobs, result: null };
    const next = [...jobs];
    next[index] = { ...next[index], status: "SENDING" };
    return { jobs: next, result: next[index] };
  });
}

async function finishManualJob(templeId: string, id: string, status: ManualChargeJob["status"], error?: string) {
  await mutateQueue(templeId, (jobs) => ({
    jobs: jobs.map((job) => job.id === id ? { ...job, status, finishedAt: new Date().toISOString(), error } : job),
    result: true,
  }));
}

export async function processNextManualCharge(templeId: string) {
  const job = await claimManualJob(templeId);
  if (!job) return { status: "EMPTY" as const };
  let providerAccepted = false;
  try {
    const today = saoPauloTodayKey();
    const members = await prisma.member.findMany({ where: { templeId, deletedAt: null, status: "ACTIVE" }, select: { id: true, nome: true, whatsapp: true, telefone: true } });
    const transaction = await prisma.financialTransaction.findFirst({
      where: { ...overdueReceivablesWhere(templeId, members.map((member) => member.nome), today), id: job.transactionId },
      select: { id: true, centroCusto: true, descricao: true, valor: true, amountPaid: true, vencimento: true },
    });
    const memberMatches = members.filter((member) => normalizeSearchText(member.nome) === normalizeSearchText(transaction?.centroCusto));
    const member = memberMatches.length === 1 ? memberMatches[0] : null;
    const phone = String(member?.whatsapp || member?.telefone || "").replace(/\D/g, "");
    if (!transaction || Number(transaction.valor) - Number(transaction.amountPaid || 0) <= 0 || !member || !phone) {
      await finishManualJob(templeId, job.id, "SKIPPED", "Conta quitada, membro inativo ou WhatsApp indisponível.");
      return { status: "SKIPPED" as const };
    }
    const whatsappNumber = await checkFinanceiroWhatsappNumber(phone);
    if (whatsappNumber?.exists === false) {
      await finishManualJob(templeId, job.id, "SKIPPED", "Número não encontrado no WhatsApp. Confira o telefone do cadastro antes de enfileirar novamente.");
      return { status: "SKIPPED" as const };
    }
    const state = await getChargeAutomationState(templeId);
    const recent = await prisma.whatsappChargeNotification.findFirst({
      where: { templeId, transactionId: job.transactionId, notificationType: { in: ["OVERDUE", "MANUAL_OVERDUE"] }, error: null, ...(state.repeatDays > 0 ? { createdAt: { gt: new Date(Date.now() - state.repeatDays * 86_400_000) } } : {}) },
      select: { id: true },
    });
    if (recent) {
      await finishManualJob(templeId, job.id, "SKIPPED", "Cobrança recente para esta conta.");
      return { status: "SKIPPED" as const };
    }
    const amount = job.amountOverride ?? Math.max(Number(transaction.valor) - Number(transaction.amountPaid || 0), 0);
    const dueDate = transaction.vencimento!;
    const message = renderReceivableWhatsappTemplate(job.template || (await getReceivableWhatsappTemplates(templeId)).OVERDUE, {
      nome: member.nome,
      historico: transaction.descricao || "cobrança",
      valor_pendente: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount),
      vencimento: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(dueDate),
      mes_vencimento: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long" }).format(dueDate).toUpperCase(),
      pix: PIX_TEXT,
    });
    const providerResponse = await sendFinanceiroText(phone, message);
    providerAccepted = true;
    await prisma.whatsappChargeNotification.create({ data: {
      templeId, transactionId: transaction.id, notificationType: "MANUAL_OVERDUE", sentDateKey: job.id,
      memberId: member.id, memberName: member.nome, phone, message, providerResponse: providerResponse as object,
    } });
    await finishManualJob(templeId, job.id, "SENT");
    return { status: "SENT" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no envio.";
    if (providerAccepted) return { status: "REVIEW" as const, error: "O provedor aceitou o envio, mas o registro não foi concluído. Verifique antes de tentar novamente." };
    await finishManualJob(templeId, job.id, "FAILED", message).catch(() => null);
    return { status: "FAILED" as const, error: message };
  }
}
