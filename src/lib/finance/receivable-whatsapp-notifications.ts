import { PaymentStatus, TransactionType } from "@prisma/client";

import { sendFinanceiroText } from "@/lib/evolution/financeiro";
import { prisma } from "@/lib/prisma";
import { getChargeAutomationState } from "@/lib/finance/receivable-charge-automation";
import {
  getReceivableWhatsappTemplates,
  ReceivableWhatsappTemplates,
  renderReceivableWhatsappTemplate,
} from "@/lib/finance/receivable-whatsapp-templates";

type NotificationKind = "UPCOMING" | "DUE_TODAY" | "OVERDUE";

type Candidate = {
  transaction: {
    id: string;
    templeId: string;
    descricao: string;
    centroCusto: string | null;
    valor: unknown;
    amountPaid: unknown;
    status: PaymentStatus;
    vencimento: Date | null;
  };
  member?: {
    id: string;
    nome: string;
    telefone: string | null;
    whatsapp: string | null;
  };
  kind: NotificationKind;
  phone?: string;
  message?: string;
  skippedReason?: string;
  alreadySent?: boolean;
};

const PIX_TEXT = "Pix – CNPJ: 48.628.461/0001-30";

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function digitsOnly(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function saoPauloDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function dateKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysToDateKey(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + amount);

  return date.toISOString().slice(0, 10);
}

function utcDateRangeFromKey(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${addDaysToDateKey(dateKey, 1)}T00:00:00.000Z`),
  };
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function formatDate(date: Date | null) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatCompetence(date: Date | null) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
  })
    .format(date)
    .toUpperCase();
}

function openAmount(totalValue: unknown, paidValue: unknown) {
  return Math.max(Number(totalValue || 0) - Number(paidValue || 0), 0);
}

function resolveKind(dueDate: Date, todayKey: string, upcomingUntilKey: string): NotificationKind | null {
  const dueKey = dateKeyFromDate(dueDate);

  if (dueKey < todayKey) {
    return "OVERDUE";
  }

  if (dueKey === todayKey) {
    return "DUE_TODAY";
  }

  if (dueKey <= upcomingUntilKey) {
    return "UPCOMING";
  }

  return null;
}

function buildMessage(candidate: Candidate, templates: ReceivableWhatsappTemplates) {
  const { transaction, member, kind } = candidate;
  const name = member?.nome || transaction.centroCusto || "Tudo bem";
  const history = transaction.descricao || "cobrança";
  const dueDate = formatDate(transaction.vencimento);
  const competence = formatCompetence(transaction.vencimento);
  const pendingAmount = formatMoney(openAmount(transaction.valor, transaction.amountPaid));

  return renderReceivableWhatsappTemplate(templates[kind], {
    nome: name,
    historico: history,
    valor_pendente: pendingAmount,
    vencimento: dueDate,
    mes_vencimento: competence,
    pix: PIX_TEXT,
  });
}

export async function processReceivableWhatsappNotifications(args: {
  templeId: string;
  dryRun?: boolean;
  onlyPhone?: string;
  daysAhead?: number;
  today?: Date;
  maxSends?: number;
}) {
  const todayKey = saoPauloDateKey(args.today);
  const todayRange = utcDateRangeFromKey(todayKey);
  const upcomingUntilKey = addDaysToDateKey(todayKey, Math.max(0, args.daysAhead ?? 10));
  const upcomingRange = utcDateRangeFromKey(upcomingUntilKey);
  const onlyPhone = digitsOnly(args.onlyPhone);
  const templates = await getReceivableWhatsappTemplates(args.templeId);

  const members = await prisma.member.findMany({
    where: {
      templeId: args.templeId,
      deletedAt: null,
      status: "ACTIVE",
      OR: [{ whatsapp: { not: null } }, { telefone: { not: null } }],
    },
    select: {
      id: true,
      nome: true,
      telefone: true,
      whatsapp: true,
    },
  });
  const targetMembers = onlyPhone
    ? members.filter((member) => digitsOnly(member.whatsapp || member.telefone) === onlyPhone)
    : members;
  const targetNames = [...new Set(targetMembers.map((member) => member.nome))];

  if (onlyPhone && targetNames.length === 0) {
    return {
      dryRun: Boolean(args.dryRun),
      today: todayKey,
      daysAhead: args.daysAhead ?? 10,
      scanned: 0,
      eligible: 0,
      skipped: 0,
      sent: [],
      failed: [],
      candidates: [],
      message: "Nenhum membro ativo encontrado para este telefone.",
    };
  }

  const transactions = await prisma.financialTransaction.findMany({
    where: {
      templeId: args.templeId,
      deletedAt: null,
      tipo: TransactionType.INCOME,
      status: {
        in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
      },
      sourcePages: { has: "EM_ABERTO" },
      OR: [
        { rawStatus: null },
        { NOT: { rawStatus: { contains: "cancel", mode: "insensitive" } } },
      ],
      ...(onlyPhone
        ? {
            centroCusto: {
              in: targetNames,
            },
          }
        : {}),
      vencimento: {
        lt: upcomingRange.end,
      },
    },
    select: {
      id: true,
      templeId: true,
      descricao: true,
      centroCusto: true,
      valor: true,
      amountPaid: true,
      status: true,
      vencimento: true,
    },
    orderBy: {
      vencimento: "asc",
    },
  });

  const membersByName = new Map<string, typeof members>();

  for (const member of targetMembers) {
    const key = normalizeText(member.nome);
    membersByName.set(key, [...(membersByName.get(key) || []), member]);
  }

  const candidates: Candidate[] = [];
  const candidateSentKeys = new Map<string, string>();

  for (const transaction of transactions) {
    if (!transaction.vencimento || transaction.vencimento >= upcomingRange.end) {
      continue;
    }

    const kind = resolveKind(transaction.vencimento, todayKey, upcomingUntilKey);

    if (!kind) {
      continue;
    }

    if (transaction.vencimento >= todayRange.end && kind !== "UPCOMING") {
      continue;
    }

    const nameKey = normalizeText(transaction.centroCusto);
    const possibleMembers = membersByName.get(nameKey) || [];
    const member = possibleMembers.length === 1 ? possibleMembers[0] : undefined;
    const phone = digitsOnly(member?.whatsapp || member?.telefone);
    const sentDateKey = kind === "DUE_TODAY" ? todayKey : dateKeyFromDate(transaction.vencimento);
    const sentKey = kind === "OVERDUE" ? `${transaction.id}:${kind}` : `${transaction.id}:${kind}:${sentDateKey}`;
    candidateSentKeys.set(transaction.id, sentKey);

    const candidate: Candidate = {
      transaction,
      kind,
      member,
      phone,
    };

    if (!transaction.centroCusto) {
      candidate.skippedReason = "Conta sem cliente/centro de custo.";
    } else if (possibleMembers.length === 0) {
      candidate.skippedReason = "Membro não encontrado pelo nome do cliente.";
    } else if (possibleMembers.length > 1) {
      candidate.skippedReason = "Mais de um membro encontrado com o mesmo nome.";
    } else if (!phone) {
      candidate.skippedReason = "Membro sem WhatsApp/telefone.";
    } else if (onlyPhone && phone !== onlyPhone) {
      candidate.skippedReason = "Ignorado pelo filtro de telefone.";
    } else {
      candidate.message = buildMessage(candidate, templates);
    }

    candidates.push(candidate);
  }

  const sentLogs = candidates.length
    ? await prisma.whatsappChargeNotification.findMany({
        where: {
          templeId: args.templeId,
          error: null,
          OR: candidates
            .filter((candidate) => candidate.transaction.vencimento)
            .map((candidate) => ({
              transactionId: candidate.transaction.id,
              notificationType: candidate.kind,
              ...(candidate.kind === "OVERDUE" ? {} : {
                sentDateKey:
                  candidate.kind === "UPCOMING" && candidate.transaction.vencimento
                    ? dateKeyFromDate(candidate.transaction.vencimento)
                    : todayKey,
              }),
            })),
        },
        select: {
          transactionId: true,
          notificationType: true,
          sentDateKey: true,
        },
      })
    : [];
  const sentLogKeys = new Set(
    sentLogs.map((log) => log.notificationType === "OVERDUE"
      ? `${log.transactionId}:${log.notificationType}`
      : `${log.transactionId}:${log.notificationType}:${log.sentDateKey}`)
  );

  for (const candidate of candidates) {
    const key = candidateSentKeys.get(candidate.transaction.id);

    if (key && sentLogKeys.has(key)) {
      candidate.alreadySent = true;
      candidate.message = undefined;

      if (!candidate.skippedReason) {
        candidate.skippedReason = "Aviso já enviado para esta conta.";
      }
    }
  }

  const sent: Array<{ transactionId: string; phone: string; kind: NotificationKind }> = [];
  const failed: Array<{ transactionId: string; phone?: string; kind: NotificationKind; error: string }> = [];

  if (!args.dryRun) {
    let attempted = 0;
    for (const candidate of candidates) {
      if (!candidate.message || !candidate.phone || candidate.skippedReason) {
        continue;
      }
      if (attempted >= (args.maxSends ?? Number.POSITIVE_INFINITY)) break;
      if (args.maxSends && !(await getChargeAutomationState(args.templeId)).enabled) break;
      const fresh = await prisma.financialTransaction.findFirst({
        where: {
          id: candidate.transaction.id,
          templeId: args.templeId,
          deletedAt: null,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE] },
          sourcePages: { has: "EM_ABERTO" },
          OR: [
            { rawStatus: null },
            { NOT: { rawStatus: { contains: "cancel", mode: "insensitive" } } },
          ],
        },
        select: { valor: true, amountPaid: true },
      });
      if (!fresh || openAmount(fresh.valor, fresh.amountPaid) <= 0) continue;
      attempted++;

      const sentDateKey =
        candidate.kind !== "DUE_TODAY" && candidate.transaction.vencimento
          ? dateKeyFromDate(candidate.transaction.vencimento)
          : todayKey;

      try {
        const providerResponse = await sendFinanceiroText(candidate.phone, candidate.message);
        await prisma.whatsappChargeNotification.upsert({
          where: { templeId_transactionId_notificationType_sentDateKey: {
            templeId: args.templeId,
            transactionId: candidate.transaction.id,
            notificationType: candidate.kind,
            sentDateKey,
          } },
          create: {
            templeId: args.templeId,
            transactionId: candidate.transaction.id,
            notificationType: candidate.kind,
            sentDateKey,
            memberId: candidate.member?.id,
            memberName: candidate.member?.nome || candidate.transaction.centroCusto,
            phone: candidate.phone,
            message: candidate.message,
            providerResponse: providerResponse as object,
          },
          update: {
            message: candidate.message,
            phone: candidate.phone,
            providerResponse: providerResponse as object,
            error: null,
          },
        });
        sent.push({
          transactionId: candidate.transaction.id,
          phone: candidate.phone,
          kind: candidate.kind,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao enviar cobrança.";
        await prisma.whatsappChargeNotification
          .upsert({
            where: { templeId_transactionId_notificationType_sentDateKey: {
              templeId: args.templeId,
              transactionId: candidate.transaction.id,
              notificationType: candidate.kind,
              sentDateKey,
            } },
            create: {
              templeId: args.templeId,
              transactionId: candidate.transaction.id,
              notificationType: candidate.kind,
              sentDateKey,
              memberId: candidate.member?.id,
              memberName: candidate.member?.nome || candidate.transaction.centroCusto,
              phone: candidate.phone,
              message: candidate.message,
              error: message,
            },
            update: { error: message },
          })
          .catch(() => null);
        failed.push({
          transactionId: candidate.transaction.id,
          phone: candidate.phone,
          kind: candidate.kind,
          error: message,
        });
      }
    }
  }

  return {
    dryRun: Boolean(args.dryRun),
    today: todayKey,
    daysAhead: args.daysAhead ?? 10,
    scanned: transactions.length,
    eligible: candidates.filter((candidate) => candidate.message && !candidate.skippedReason).length,
    skipped: candidates.filter((candidate) => candidate.skippedReason).length,
    sent,
    failed,
    candidates: candidates.map((candidate) => ({
      transactionId: candidate.transaction.id,
      cliente: candidate.transaction.centroCusto,
      historico: candidate.transaction.descricao,
      valor: Number(candidate.transaction.valor || 0),
      saldo: openAmount(candidate.transaction.valor, candidate.transaction.amountPaid),
      vencimento: candidate.transaction.vencimento ? dateKeyFromDate(candidate.transaction.vencimento) : null,
      tipoAviso: candidate.kind,
      membro: candidate.member?.nome || null,
      telefone: candidate.phone || null,
      jaEnviado: candidate.alreadySent || false,
      ignorado: candidate.skippedReason || null,
      mensagem: candidate.message || null,
    })),
  };
}
