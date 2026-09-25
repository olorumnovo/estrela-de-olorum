import {
  MemberStatus,
  PaymentStatus,
  TransactionType,
} from "@prisma/client";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock,
  DollarSign,
  ShoppingCart,
  UserRound,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

import detailedCadastroRecords from "@/data/cadastros-fornecedores-detalhes.json";
import { isPdvOnlyRoleSet } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { monthBounds } from "@/modules/shared";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function decimal(
  value:
    | { toNumber(): number }
    | number
    | string
    | bigint
    | null
    | undefined
) {
  if (!value) {
    return 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return typeof value === "number" ? value : value.toNumber();
}

function shortDate(value: Date | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(value);
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const extendedCadastroMarkerStart = "[CADASTRO_EXTENDIDO_JSON]";
const extendedCadastroMarkerEnd = "[/CADASTRO_EXTENDIDO_JSON]";

function normalizedDocument(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function extendedCadastroClassifications(observations: string | null) {
  const text = observations || "";
  const start = text.indexOf(extendedCadastroMarkerStart);
  const end = text.indexOf(extendedCadastroMarkerEnd);

  if (start < 0 || end <= start) {
    return [] as string[];
  }

  try {
    const data = JSON.parse(
      text.slice(start + extendedCadastroMarkerStart.length, end).trim()
    ) as { classifications?: unknown };

    return Array.isArray(data.classifications)
      ? data.classifications.filter(
          (item): item is string => typeof item === "string"
        )
      : [];
  } catch {
    return [] as string[];
  }
}

function formatCompetence(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function scoreDescription(description: string) {
  const normalized = normalize(description);

  if (normalized.includes("combo ouro")) {
    return 4;
  }

  if (normalized.includes("combo prata")) {
    return 3;
  }

  if (
    normalized.includes("curso de teologia") ||
    normalized.includes("desenvolvimento mediunico")
  ) {
    return 2;
  }

  return 1;
}

function startOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0
  );
}

function endOfDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999
  );
}

function parseMonthParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    return null;
  }

  const [yearText, monthText] = raw.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

function parseDateParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
    value.getDate()
  ).padStart(2, "0")}`;
}

const MIN_LEDGER_DATE = new Date("2020-01-01T00:00:00.000Z");
const MAX_LEDGER_DATE = new Date("2030-12-31T23:59:59.999Z");
const MAX_LEDGER_AMOUNT = 1_000_000;

function isValidLedgerDate(value: Date) {
  return value >= MIN_LEDGER_DATE && value <= MAX_LEDGER_DATE;
}

function isValidLedgerAmount(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_LEDGER_AMOUNT;
}

function openFinancialWhere(
  templeId: string,
  tipo: TransactionType,
  start: Date,
  end: Date
) {
  return {
    templeId,
    deletedAt: null,
    tipo,
    status: {
      in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
    },
    sourcePages: {
      has: "EM_ABERTO",
    },
    vencimento: {
      gte: start,
      lte: end,
    },
    OR: [
      {
        rawStatus: null,
      },
      {
        NOT: {
          rawStatus: {
            contains: "cancel",
            mode: "insensitive" as const,
          },
        },
      },
    ],
  };
}

type DashboardMetricsRow = {
  totalMembers: number | bigint;
  totalActiveMembers: number | bigint;
  totalInactiveMembers: number | bigint;
  activeMembers: number | bigint;
  newMembersThisMonth: number | bigint;
  overdueMembers: number | bigint;
  overdueMonthlyCount: number | bigint;
  salesTotal: number | string | { toNumber(): number } | null;
};

type BirthdayRow = {
  id: string;
  nome: string;
  nascimento: Date | null;
};

type PendingRegistration = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
  createdAt: Date;
};

type ActiveWorkerMemberRow = {
  id: string;
  nome: string;
};

type MonthlyFeeSnapshotRow = {
  memberId: string;
  status: string;
  valor: number | string | { toNumber(): number } | null;
  createdAt: Date;
};

type MonthlyLedgerEntryRow = {
  contact: string | null;
  description: string;
  amount: number | string | { toNumber(): number } | null;
  entryDate: Date;
};

type LedgerSummaryEntryRow = {
  accountName: string;
  movementType: string;
  amount: number | string | { toNumber(): number } | null;
  entryDate: Date;
  createdAt: Date;
  isTransfer: boolean;
};

const ALL_FINANCE_ACCOUNTS = "TODAS";
const DEFAULT_FINANCE_SUMMARY_ACCOUNT = "Santander";
const DEFAULT_FINANCE_ACCOUNT_NAMES = [
  "Santander",
  "Caixa",
  "GetNet",
  "Investimentos Itaú",
  "Investimentos Santander",
  "Itaú",
  "Umbandei",
  "Rede",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const user = await requireCurrentUserFromCookies();
  const currentUserRoles = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      userRoles: {
        where: {
          role: {
            ativo: true,
            deletedAt: null,
          },
        },
        select: {
          role: {
            select: {
              nome: true,
            },
          },
        },
      },
    },
  });
  const roleNames =
    currentUserRoles?.userRoles.map((item) => item.role.nome) || [];

  if (isPdvOnlyRoleSet(roleNames)) {
    redirect("/dashboard/pdv");
  }

  const templeId = user.templeId;
  const today = new Date();
  const saoPauloToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  // A agenda grava datas sem horário ao meio-dia UTC. Comparar com o início
  // do dia preserva o evento no card durante toda a data agendada.
  const scheduleTodayStart = new Date(`${saoPauloToday}T00:00:00.000Z`);
  const month = monthBounds(today);
  const requestedPeriodMode = Array.isArray(resolvedSearchParams.period)
    ? resolvedSearchParams.period[0]
    : resolvedSearchParams.period;
  const selectedFilterMode =
    requestedPeriodMode === "period" || requestedPeriodMode === "custom"
      ? requestedPeriodMode
      : "month";
  const selectedMonthDate =
    parseMonthParam(resolvedSearchParams.month) || today;
  const selectedMonthBounds = monthBounds(selectedMonthDate);
  const parsedCustomStart = parseDateParam(resolvedSearchParams.startDate);
  const parsedCustomEnd = parseDateParam(resolvedSearchParams.endDate);
  const normalizedCustomStart = parsedCustomStart ? startOfDay(parsedCustomStart) : null;
  const normalizedCustomEnd = parsedCustomEnd ? endOfDay(parsedCustomEnd) : null;
  const hasValidCustomRange =
    !!normalizedCustomStart &&
    !!normalizedCustomEnd &&
    normalizedCustomStart <= normalizedCustomEnd;
  const financePeriodStart =
    selectedFilterMode !== "month" && hasValidCustomRange
      ? normalizedCustomStart
      : selectedMonthBounds.start;
  const financePeriodEnd =
    selectedFilterMode !== "month" && hasValidCustomRange
      ? normalizedCustomEnd
      : selectedMonthBounds.end;
  const financePeriodLabel =
    selectedFilterMode !== "month" && hasValidCustomRange
      ? `${new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(financePeriodStart)} até ${new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(financePeriodEnd)}`
      : new Intl.DateTimeFormat("pt-BR", {
          month: "long",
          year: "numeric",
        }).format(selectedMonthDate);
  const currentWorkerClassification =
    "Trabalhador da Corrente";
  const openReceivablesThisMonthWhere = openFinancialWhere(
    templeId,
    TransactionType.INCOME,
    month.start,
    month.end
  );
  const openPayablesThisMonthWhere = openFinancialWhere(
    templeId,
    TransactionType.EXPENSE,
    month.start,
    month.end
  );

  const [
    metricsRows,
    activeWorkerMembers,
    cadastroMembers,
    currentMonthMonthlyFees,
    latestMonthlyFees,
    monthlyLedgerEntries,
    ledgerSummaryEntries,
    schedules,
    birthdays,
    pendingRegistrations,
    pendingRegistrationsCount,
    overdueFinanceNotices,
    openReceivablesThisMonthCount,
    openReceivablesThisMonthSums,
    openPayablesThisMonthCount,
    openPayablesThisMonthSums,
    receivablesPaidThisMonthCount,
    receivablesOverdueThisMonthCount,
    financeBankAccounts,
    financeCashRegisters,
  ] = await Promise.all([
    prisma.$queryRaw<DashboardMetricsRow[]>`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${templeId}
            AND "deletedAt" IS NULL
        ) AS "totalMembers",
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${templeId}
            AND "deletedAt" IS NULL
            AND "status" = 'ACTIVE'
        ) AS "totalActiveMembers",
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${templeId}
            AND "deletedAt" IS NULL
            AND "status" = 'INACTIVE'
        ) AS "totalInactiveMembers",
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${templeId}
            AND "deletedAt" IS NULL
            AND "status" = 'ACTIVE'
            AND (
              EXISTS (
                SELECT 1
                FROM "MemberClassification" mc
                WHERE mc."id" = "Member"."classificationId"
                  AND mc."nome" = ${currentWorkerClassification}
              )
              OR EXISTS (
                SELECT 1
                FROM "MemberClassificationLink" mcl
                INNER JOIN "MemberClassification" mc
                  ON mc."id" = mcl."classificationId"
                WHERE mcl."memberId" = "Member"."id"
                  AND mc."nome" = ${currentWorkerClassification}
              )
            )
        ) AS "activeMembers",
        (
          SELECT COUNT(*)::int
          FROM "Member"
          WHERE "templeId" = ${templeId}
            AND "deletedAt" IS NULL
            AND "createdAt" >= ${month.start}
            AND "createdAt" <= ${month.end}
        ) AS "newMembersThisMonth",
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT "memberId"
            FROM "MonthlyFee"
            WHERE "templeId" = ${templeId}
              AND "deletedAt" IS NULL
              AND "status" = 'OVERDUE'
            GROUP BY "memberId"
          ) overdue
        ) AS "overdueMembers",
        (SELECT COUNT(*)::int FROM "MonthlyFee" WHERE "templeId" = ${templeId} AND "deletedAt" IS NULL AND "status" = 'OVERDUE') AS "overdueMonthlyCount",
        (SELECT COALESCE(SUM("total"), 0) FROM "Sale" WHERE "templeId" = ${templeId} AND "createdAt" >= ${month.start} AND "createdAt" <= ${month.end}) AS "salesTotal"
    `,
    prisma.$queryRaw<ActiveWorkerMemberRow[]>`
      SELECT DISTINCT "Member"."id", "Member"."nome"
      FROM "Member"
      WHERE "Member"."templeId" = ${templeId}
        AND "Member"."deletedAt" IS NULL
        AND "Member"."status" = 'ACTIVE'
        AND (
          EXISTS (
            SELECT 1
            FROM "MemberClassification" mc
            WHERE mc."id" = "Member"."classificationId"
              AND mc."nome" = ${currentWorkerClassification}
          )
          OR EXISTS (
            SELECT 1
            FROM "MemberClassificationLink" mcl
            INNER JOIN "MemberClassification" mc
              ON mc."id" = mcl."classificationId"
            WHERE mcl."memberId" = "Member"."id"
              AND mc."nome" = ${currentWorkerClassification}
          )
        )
      ORDER BY "Member"."nome" ASC
    `,
    prisma.member.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        status: true,
        observacoes: true,
        classification: {
          select: {
            nome: true,
          },
        },
        memberClassifications: {
          select: {
            classification: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    }),
    prisma.monthlyFee.findMany({
      where: {
        templeId,
        deletedAt: null,
        tipoContribuicao: "MENSALIDADE_CORRENTE",
        competencia: formatCompetence(today),
      },
      select: {
        memberId: true,
        status: true,
        valor: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.monthlyFee.findMany({
      where: {
        templeId,
        deletedAt: null,
        tipoContribuicao: "MENSALIDADE_CORRENTE",
      },
      select: {
        memberId: true,
        status: true,
        valor: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.cashLedgerEntry.findMany({
      where: {
        templeId,
        deletedAt: null,
        OR: [
          {
            category: {
              contains: "mensalidade",
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: "mensalidade",
              mode: "insensitive",
            },
          },
        ],
      },
      select: {
        contact: true,
        description: true,
        amount: true,
        entryDate: true,
      },
      orderBy: {
        entryDate: "desc",
      },
    }),
    prisma.cashLedgerEntry.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      select: {
        accountName: true,
        movementType: true,
        amount: true,
        entryDate: true,
        createdAt: true,
        isTransfer: true,
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.schedule.findMany({
      where: {
        templeId,
        deletedAt: null,
        inicio: {
          gte: scheduleTodayStart,
        },
      },
      orderBy: {
        inicio: "asc",
      },
      take: 4,
    }),
    prisma.$queryRaw<BirthdayRow[]>`
      SELECT "id", "nome", "nascimento"
      FROM "Member"
      WHERE "templeId" = ${templeId}
        AND "deletedAt" IS NULL
        AND "status" = 'ACTIVE'
        AND "nascimento" IS NOT NULL
        AND EXTRACT(MONTH FROM "nascimento") = EXTRACT(MONTH FROM ${today}::timestamp)
        AND EXTRACT(DAY FROM "nascimento") >= EXTRACT(DAY FROM ${today}::timestamp)
      ORDER BY EXTRACT(DAY FROM "nascimento") ASC, "nome" ASC
      LIMIT 4
    `,
    prisma.member.findMany({
      where: {
        templeId,
        deletedAt: null,
        status: MemberStatus.PENDING,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        whatsapp: true,
        cidade: true,
        estado: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
    }),
    prisma.member.count({
      where: {
        templeId,
        deletedAt: null,
        status: MemberStatus.PENDING,
      },
    }),
    prisma.financialTransaction.findMany({
      where: {
        templeId,
        deletedAt: null,
        tipo: TransactionType.EXPENSE,
        status: PaymentStatus.OVERDUE,
        sourcePages: {
          has: "EM_ABERTO",
        },
        OR: [
          {
            rawStatus: null,
          },
          {
            NOT: {
              rawStatus: {
                contains: "cancel",
                mode: "insensitive" as const,
              },
            },
          },
        ],
      },
      orderBy: {
        vencimento: "asc",
      },
      take: 4,
      select: {
        id: true,
        descricao: true,
        vencimento: true,
        valor: true,
        amountPaid: true,
      },
    }),
    prisma.financialTransaction.count({
      where: openReceivablesThisMonthWhere,
    }),
    prisma.financialTransaction.aggregate({
      where: openReceivablesThisMonthWhere,
      _sum: {
        valor: true,
        amountPaid: true,
      },
    }),
    prisma.financialTransaction.count({
      where: openPayablesThisMonthWhere,
    }),
    prisma.financialTransaction.aggregate({
      where: openPayablesThisMonthWhere,
      _sum: {
        valor: true,
        amountPaid: true,
      },
    }),
    prisma.financialTransaction.count({
      where: {
        templeId,
        deletedAt: null,
        tipo: "INCOME",
        sourcePages: {
          has: "PAGAS",
        },
        pagamentoEm: {
          gte: month.start,
          lte: month.end,
        },
      },
    }),
    prisma.financialTransaction.count({
      where: {
        templeId,
        deletedAt: null,
        tipo: "INCOME",
        status: "OVERDUE",
        sourcePages: {
          has: "EM_ABERTO",
        },
        vencimento: {
          gte: month.start,
          lte: month.end,
        },
      },
    }),
    prisma.financialBankAccount.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      select: {
        nome: true,
      },
      orderBy: {
        nome: "asc",
      },
    }),
    prisma.cashRegister.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      select: {
        nome: true,
      },
      orderBy: {
        nome: "asc",
      },
    }),
  ]);

  const metrics = metricsRows[0];
  const activeMembers =
    activeWorkerMembers.length || decimal(metrics.activeMembers);
  const currentWorkerKey = normalize(currentWorkerClassification);
  const databaseMemberIds = new Set(cadastroMembers.map((member) => member.id));
  const databaseMemberCpfs = new Set(
    cadastroMembers.map((member) => normalizedDocument(member.cpf)).filter(Boolean)
  );
  const databaseMemberNames = new Set(
    cadastroMembers.map((member) => normalize(member.nome)).filter(Boolean)
  );
  const databaseMemberEmails = new Set(
    cadastroMembers.map((member) => normalize(member.email)).filter(Boolean)
  );
  const databaseCurrentWorkerMembers = cadastroMembers.filter((member) => {
    if (member.status !== MemberStatus.ACTIVE) {
      return false;
    }

    const linkedClassifications = [
      member.classification?.nome,
      ...member.memberClassifications.map((item) => item.classification.nome),
    ].filter((item): item is string => Boolean(item));
    const extendedClassifications = extendedCadastroClassifications(
      member.observacoes
    );
    const displayedClassifications = extendedClassifications.length
      ? extendedClassifications
      : linkedClassifications;

    return displayedClassifications.some(
      (classification) => normalize(classification) === currentWorkerKey
    );
  }).length;
  const legacyCurrentWorkerMembers = detailedCadastroRecords.filter((record) => {
    const cpf = normalizedDocument(record.cpfCnpj);
    const name = normalize(record.name);
    const email = normalize(record.email);
    const alreadyInDatabase =
      databaseMemberIds.has(record.id) ||
      Boolean(cpf && databaseMemberCpfs.has(cpf)) ||
      Boolean(name && databaseMemberNames.has(name)) ||
      Boolean(email && databaseMemberEmails.has(email));

    return (
      !alreadyInDatabase &&
      normalize(record.status) === "ativo" &&
      record.classifications.some(
        (classification) => normalize(classification) === currentWorkerKey
      )
    );
  }).length;
  const currentWorkerMembers =
    databaseCurrentWorkerMembers + legacyCurrentWorkerMembers;
  const newMembersThisMonth = decimal(metrics.newMembersThisMonth);
  const overdueMembers = decimal(metrics.overdueMembers);
  const overdueMonthlyCount = decimal(metrics.overdueMonthlyCount);
  const salesTotal = decimal(metrics.salesTotal);
  const latestMonthlyFeeByMember = new Map<string, MonthlyFeeSnapshotRow>();

  latestMonthlyFees.forEach((fee) => {
    if (!latestMonthlyFeeByMember.has(fee.memberId)) {
      latestMonthlyFeeByMember.set(fee.memberId, fee);
    }
  });

  const currentMonthlyFeeByMember = new Map<string, MonthlyFeeSnapshotRow>();

  currentMonthMonthlyFees.forEach((fee) => {
    if (!currentMonthlyFeeByMember.has(fee.memberId)) {
      currentMonthlyFeeByMember.set(fee.memberId, fee);
    }
  });

  const entriesByName = new Map<
    string,
    Array<{
      amount: number;
      description: string;
      entryDate: Date;
    }>
  >();

  monthlyLedgerEntries.forEach((entry) => {
    const contact = entry.contact?.trim();

    if (!contact) {
      return;
    }

    const key = normalize(contact);
    const current = entriesByName.get(key) || [];

    current.push({
      amount: decimal(entry.amount),
      description: entry.description,
      entryDate: entry.entryDate,
    });

    entriesByName.set(key, current);
  });

  const paidCurrentMemberIds = new Set<string>();
  const canceledCurrentMemberIds = new Set<string>();

  currentMonthMonthlyFees.forEach((fee) => {
    if (fee.status === "PAID") {
      paidCurrentMemberIds.add(fee.memberId);
    }

    if (fee.status === "CANCELED") {
      canceledCurrentMemberIds.add(fee.memberId);
    }
  });

  let inferredOpenMonthlyTotal = 0;

  activeWorkerMembers.forEach((member) => {
    if (
      paidCurrentMemberIds.has(member.id) ||
      canceledCurrentMemberIds.has(member.id)
    ) {
      return;
    }

    const currentFee = currentMonthlyFeeByMember.get(member.id);

    if (currentFee && currentFee.status !== "CANCELED") {
      inferredOpenMonthlyTotal += decimal(currentFee.valor);
      return;
    }

    const latestFee = latestMonthlyFeeByMember.get(member.id);

    if (latestFee) {
      inferredOpenMonthlyTotal += decimal(latestFee.valor);
      return;
    }

    const entries = entriesByName.get(normalize(member.nome)) || [];

    if (entries.length === 0) {
      return;
    }

    const amountStats = new Map<number, { count: number; latestDate: number }>();

    entries.forEach((entry) => {
      const stat = amountStats.get(entry.amount) || {
        count: 0,
        latestDate: 0,
      };

      stat.count += 1;
      stat.latestDate = Math.max(stat.latestDate, entry.entryDate.getTime());
      amountStats.set(entry.amount, stat);
    });

    const inferredAmount =
      [...amountStats.entries()].sort((left, right) => {
        if (right[1].count !== left[1].count) {
          return right[1].count - left[1].count;
        }

        return right[1].latestDate - left[1].latestDate;
      })[0]?.[0] ?? null;

    const referenceEntry = [...entries].sort((left, right) => {
      const scoreDiff =
        scoreDescription(right.description) - scoreDescription(left.description);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return right.entryDate.getTime() - left.entryDate.getTime();
    })[0];

    inferredOpenMonthlyTotal +=
      inferredAmount ?? (referenceEntry ? referenceEntry.amount : 0);
  });

  const paidMonthlyCount = paidCurrentMemberIds.size;
  const openMonthlyCount = Math.max(
    activeMembers - paidCurrentMemberIds.size - canceledCurrentMemberIds.size,
    0
  );
  const pendingMonthlyCount = Math.max(openMonthlyCount - overdueMembers, 0);
  const openMonthlyTotal = inferredOpenMonthlyTotal;
  const openReceivablesThisMonthTotal = Math.max(
    decimal(openReceivablesThisMonthSums._sum.valor) -
      decimal(openReceivablesThisMonthSums._sum.amountPaid),
    0
  );
  const openPayablesThisMonthTotal = Math.max(
    decimal(openPayablesThisMonthSums._sum.valor) -
      decimal(openPayablesThisMonthSums._sum.amountPaid),
    0
  );

  const currentMonthSelected =
    selectedMonthDate.getFullYear() === today.getFullYear() &&
    selectedMonthDate.getMonth() === today.getMonth();
  const effectiveMonthEnd =
    currentMonthSelected ? endOfDay(today) : selectedMonthBounds.end;
  const resolvedFinancePeriodStart = financePeriodStart;
  const resolvedFinancePeriodEnd =
    selectedFilterMode !== "month" && hasValidCustomRange
      ? financePeriodEnd
      : effectiveMonthEnd;
  const financeAccounts = [
    ALL_FINANCE_ACCOUNTS,
    ...Array.from(
      new Set(
        [
          ...ledgerSummaryEntries.map((entry) => entry.accountName?.trim()),
          ...financeBankAccounts.map((entry) => entry.nome?.trim()),
          ...financeCashRegisters.map((entry) => entry.nome?.trim()),
          ...DEFAULT_FINANCE_ACCOUNT_NAMES,
        ].filter(Boolean) as string[]
      )
    ).sort((left, right) => left.localeCompare(right, "pt-BR")),
  ];
  const requestedFinanceAccount = Array.isArray(resolvedSearchParams.account)
    ? resolvedSearchParams.account[0]
    : resolvedSearchParams.account;
  const defaultFinanceSummaryAccount = financeAccounts.includes(DEFAULT_FINANCE_SUMMARY_ACCOUNT)
    ? DEFAULT_FINANCE_SUMMARY_ACCOUNT
    : ALL_FINANCE_ACCOUNTS;
  const selectedFinanceAccount =
    requestedFinanceAccount &&
    financeAccounts.includes(requestedFinanceAccount)
      ? requestedFinanceAccount
      : defaultFinanceSummaryAccount;

  const saneLedgerSummaryEntries = ledgerSummaryEntries.filter((entry) => {
    const amount = decimal(entry.amount);

    return (
      isValidLedgerDate(entry.entryDate) &&
      isValidLedgerAmount(amount)
    );
  });

  const selectedLedgerEntries =
    selectedFinanceAccount === ALL_FINANCE_ACCOUNTS
      ? saneLedgerSummaryEntries
      : saneLedgerSummaryEntries.filter(
          (entry) => entry.accountName === selectedFinanceAccount
        );

  const periodLedgerEntries = selectedLedgerEntries.filter(
    (entry) =>
      entry.entryDate >= resolvedFinancePeriodStart &&
      entry.entryDate <= resolvedFinancePeriodEnd
  );

  const ledgerBalanceByAccount = new Map<
    string,
    {
      latestSnapshotDate: Date | null;
      latestSnapshotCreatedAt: Date | null;
      latestSnapshotAmount: number | null;
      postSnapshotDelta: number;
      runningWithoutSnapshot: number;
    }
  >();

  let received = 0;
  let paidExpenses = 0;

  periodLedgerEntries.forEach((entry) => {
    const amount = decimal(entry.amount);

    if (entry.movementType === "C") {
      received += amount;
    } else if (entry.movementType === "D") {
      paidExpenses += amount;
    }
  });

  selectedLedgerEntries.forEach((entry) => {
    const amount = decimal(entry.amount);
    const currentBalance = ledgerBalanceByAccount.get(entry.accountName) || {
      latestSnapshotDate: null as Date | null,
      latestSnapshotCreatedAt: null as Date | null,
      latestSnapshotAmount: null as number | null,
      postSnapshotDelta: 0,
      runningWithoutSnapshot: 0,
    };

    if (entry.movementType === "C") {
      currentBalance.runningWithoutSnapshot += amount;

      if (currentBalance.latestSnapshotDate) {
        const happenedAfterSnapshot =
          entry.entryDate > currentBalance.latestSnapshotDate ||
          (
            entry.entryDate.getTime() ===
              currentBalance.latestSnapshotDate.getTime() &&
            currentBalance.latestSnapshotCreatedAt &&
            entry.createdAt > currentBalance.latestSnapshotCreatedAt
          );

        if (happenedAfterSnapshot) {
          currentBalance.postSnapshotDelta += amount;
        }
      }
    } else if (entry.movementType === "D") {
      currentBalance.runningWithoutSnapshot -= amount;

      if (currentBalance.latestSnapshotDate) {
        const happenedAfterSnapshot =
          entry.entryDate > currentBalance.latestSnapshotDate ||
          (
            entry.entryDate.getTime() ===
              currentBalance.latestSnapshotDate.getTime() &&
            currentBalance.latestSnapshotCreatedAt &&
            entry.createdAt > currentBalance.latestSnapshotCreatedAt
          );

        if (happenedAfterSnapshot) {
          currentBalance.postSnapshotDelta -= amount;
        }
      }
    } else if (
      entry.movementType === "S" &&
      (
        !currentBalance.latestSnapshotDate ||
        entry.entryDate > currentBalance.latestSnapshotDate ||
        (
          entry.entryDate.getTime() ===
            currentBalance.latestSnapshotDate.getTime() &&
          currentBalance.latestSnapshotCreatedAt &&
          entry.createdAt > currentBalance.latestSnapshotCreatedAt
        )
      )
    ) {
      currentBalance.latestSnapshotDate = entry.entryDate;
      currentBalance.latestSnapshotCreatedAt = entry.createdAt;
      currentBalance.latestSnapshotAmount = amount;
      currentBalance.postSnapshotDelta = 0;
    }

    ledgerBalanceByAccount.set(entry.accountName, currentBalance);
  });

  const balance = [...ledgerBalanceByAccount.values()].reduce((sum, item) => {
    if (item.latestSnapshotAmount !== null) {
      return sum + item.latestSnapshotAmount + item.postSnapshotDelta;
    }

    return sum + item.runningWithoutSnapshot;
  }, 0);
  const paidTransactionWhere = {
    templeId,
    deletedAt: null,
    status: PaymentStatus.PAID,
    pagamentoEm: {
      gte: resolvedFinancePeriodStart,
      lte: resolvedFinancePeriodEnd,
    },
  };
  const [receivedTransactionSummary, paidTransactionSummary] = await Promise.all([
    prisma.financialTransaction.aggregate({
      where: {
        ...paidTransactionWhere,
        tipo: TransactionType.INCOME,
      },
      _sum: {
        amountPaid: true,
        valor: true,
      },
    }),
    prisma.financialTransaction.aggregate({
      where: {
        ...paidTransactionWhere,
        tipo: TransactionType.EXPENSE,
      },
      _sum: {
        amountPaid: true,
        valor: true,
      },
    }),
  ]);
  const financialSummaryReceived = decimal(
    receivedTransactionSummary._sum.amountPaid ||
      receivedTransactionSummary._sum.valor
  );
  const financialSummaryPaid = decimal(
    paidTransactionSummary._sum.amountPaid ||
      paidTransactionSummary._sum.valor
  );
  const financialSummaryBalance =
    financialSummaryReceived - financialSummaryPaid;
  return (
    <main className="bg-[#F8F8F7] px-4 py-5 sm:px-6 lg:h-[calc(100vh-116px)] lg:overflow-hidden lg:px-6 lg:py-4">
      <div className="space-y-5 lg:flex lg:h-full lg:flex-col lg:space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<Users size={28} />}
            title="Total de Cadastros"
            value={String(currentWorkerMembers)}
            helper="Membros • Trabalhador da Corrente"
          />
          <MetricCard
            icon={<CalendarDays size={28} />}
            title="Próximas Giras"
            value={String(schedules.length)}
            helper={`Próxima: ${shortDate(schedules[0]?.inicio)}`}
          />
          <MetricCard
            icon={<Bell size={28} />}
            title="Receber em aberto no mês"
            value={String(openReceivablesThisMonthCount)}
            helper={`Total: ${money(openReceivablesThisMonthTotal)}`}
          />
          <MetricCard
            icon={<ClipboardCheck size={28} />}
            title="Pagar em aberto no mês"
            value={String(openPayablesThisMonthCount)}
            helper={`Total: ${money(openPayablesThisMonthTotal)}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_1fr] lg:min-h-0 lg:flex-1">
          <PendingRegistrationsPanel
            count={pendingRegistrationsCount}
            records={pendingRegistrations}
          />

          <section className="flex min-h-0 flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h2 className="font-serif text-[25px] font-bold text-slate-950">
                Próximas Atividades
              </h2>
              <a
                href="/dashboard/agenda"
                className="text-sm font-medium text-[#B8860B]"
              >
                Ver todas
              </a>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-5">
              {schedules.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  Nenhuma atividade agendada.
                </p>
              ) : (
                schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex flex-wrap items-center gap-3 py-3.5 sm:flex-nowrap sm:gap-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F7E7C0] text-[#B8860B]">
                      {schedule.tipo === "REUNIAO" ? (
                        <Clock size={21} />
                      ) : (
                        <CalendarDays size={21} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[16px] font-semibold text-slate-900">
                        {schedule.titulo}
                      </h3>
                      <p className="mt-1 text-[13px] text-slate-600">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(schedule.inicio)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                      {schedule.status === "AGENDADO"
                        ? "Confirmado"
                        : schedule.status.replaceAll("_", " ")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 lg:min-h-0 lg:flex-1">
          <SmallPanel
            title="Aniversariantes do Mês"
            href="/dashboard/membros?birthdays=month"
            items={birthdays.map((member) => ({
              icon: <UserRound size={25} />,
              title: member.nome,
              detail: shortDate(member.nascimento),
              href: `/dashboard/membros/${member.id}`,
            }))}
          />
          <ReceivablesPanel
            open={openReceivablesThisMonthCount}
            paid={receivablesPaidThisMonthCount}
            overdue={receivablesOverdueThisMonthCount}
            openTotal={openReceivablesThisMonthTotal}
          />
          <SalesPanel total={salesTotal} />
          <SmallPanel
            title="Contas Vencidas"
            items={overdueFinanceNotices.map((notice) => ({
              icon: <Bell size={22} />,
              title: notice.descricao,
              detail: `${shortDate(notice.vencimento)} • ${money(
                Math.max(decimal(notice.valor) - decimal(notice.amountPaid), 0)
              )}`,
            }))}
          />
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  title,
  value,
  helper,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  helper: string;
}) {
  return (
    <section className="flex min-h-[118px] items-center gap-4 rounded-[10px] border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md lg:min-h-[104px]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#D9A520] to-[#B77B17] text-white shadow-[0_8px_24px_rgba(183,123,23,0.24)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="max-w-[210px] text-[13px] font-semibold leading-[1.25] tracking-[-0.01em] text-slate-700 sm:text-[14px]">
          {title}
        </p>
        <h2 className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] text-slate-950 lg:text-[30px]">
          {value}
        </h2>
        <p className="mt-2 text-[12px] font-medium leading-[1.3] text-[#B8860B] sm:text-[13px]">
          {helper}
        </p>
      </div>
    </section>
  );
}

function PendingRegistrationsPanel({
  count,
  records,
}: {
  count: number;
  records: PendingRegistration[];
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#B8860B]">
            Cadastros
          </p>
          <h2 className="mt-1 font-serif text-[23px] font-bold text-slate-950">
            Cadastros Pendentes
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Solicitações feitas pelo link público aguardando conferência.
          </p>
        </div>
        <a
          href="/dashboard/membros?status=pendente"
          className="inline-flex items-center justify-center rounded-full bg-[#0D3B82] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0B316C]"
        >
          Conferir cadastros
        </a>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-5 py-4 lg:grid-cols-[150px_1fr]">
        <div className="rounded-[18px] border border-[#E9E1D2] bg-[#F8F8F7] p-4">
          <p className="text-sm font-medium text-slate-500">
            Total pendente
          </p>
          <h3 className="mt-2 text-[38px] font-bold leading-none tracking-[-0.04em] text-slate-950">
            {count}
          </h3>
          <p className="mt-2 text-xs font-medium text-[#B8860B]">
            Origem: cadastrodireto
          </p>
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto">
          {records.length === 0 ? (
            <div className="flex min-h-[150px] items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-white px-6 text-center">
              <p className="text-sm text-slate-500">
                Nenhum cadastro pendente no momento.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-[18px] border border-slate-100 bg-white">
              {records.map((record) => (
                <a
                  key={record.id}
                  href={`/dashboard/membros/cadastros/${record.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-[#F8F8F7] sm:flex-nowrap"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EAF1FF] text-[#0D3B82]">
                    <UserRound size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-950">
                      {record.nome}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {record.email || record.whatsapp || record.telefone || "Sem contato informado"}
                    </p>
                  </div>
                  <div className="text-left text-xs text-slate-500 sm:text-right">
                    <p>
                      {record.cidade
                        ? `${record.cidade}${record.estado ? `/${record.estado}` : ""}`
                        : "Cidade não informada"}
                    </p>
                    <p className="mt-1 text-[#B8860B]">
                      {new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }).format(record.createdAt)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FinanceNumber({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <p className={color}>{label}</p>
      <p className={`mt-2 text-[24px] font-bold ${color}`}>
        {value}
      </p>
    </div>
  );
}

function SmallPanel({
  title,
  href,
  items,
}: {
  title: string;
  href?: string;
  items: Array<{
    icon: ReactNode;
    title: string;
    detail: string;
    href?: string;
  }>;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="font-serif text-[20px] font-bold text-slate-950">
          {title}
        </h2>
        {href ? (
          <a href={href} className="text-sm text-[#B8860B]">
            Ver todas
          </a>
        ) : (
          <span className="text-sm text-[#B8860B]">Ver todas</span>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum registro.
          </p>
        ) : (
          items.map((item) => {
            const content = (
              <>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#D9A520] to-[#B77B17] text-white">
                {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {item.detail}
                  </p>
                </div>
              </>
            );

            return item.href ? (
              <a
                key={`${item.title}-${item.detail}`}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-[#F8F8F7]"
              >
                {content}
              </a>
            ) : (
              <div
                key={`${item.title}-${item.detail}`}
                className="flex items-center gap-3 rounded-2xl px-2 py-2"
              >
                {content}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function ReceivablesPanel({
  open,
  paid,
  overdue,
  openTotal,
}: {
  open: number;
  paid: number;
  overdue: number;
  openTotal: number;
}) {
  const total = Math.max(paid + open + overdue, 1);

  return (
    <section className="flex min-h-0 flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-serif text-[20px] font-bold text-slate-950">
          Contas a Receber
        </h2>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[92px_1fr] items-center gap-4 p-4">
        <div
          className="h-[92px] w-[92px] rounded-full p-4"
          style={{
            background: `conic-gradient(#15803d 0 ${Math.round((paid / total) * 100)}%, #C6921E ${Math.round((paid / total) * 100)}% ${Math.round(((paid + open) / total) * 100)}%, #dc2626 ${Math.round(((paid + open) / total) * 100)}% 100%)`,
          }}
        >
          <div className="h-full w-full rounded-full bg-white" />
        </div>
        <div className="space-y-2 text-xs">
          <Legend color="bg-emerald-600" label="Recebidas" value={`${Math.round((paid / total) * 100)}%`} />
          <Legend color="bg-[#C6921E]" label="Em aberto" value={`${Math.round((open / total) * 100)}%`} />
          <Legend color="bg-red-600" label="Atrasadas" value={`${Math.round((overdue / total) * 100)}%`} />
          <p className="pt-1 text-xs font-medium text-[#B8860B]">
            Total em aberto: {money(openTotal)}
          </p>
        </div>
      </div>
    </section>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color}`} />
      <span className="font-medium text-slate-900">{label}</span>
      <span className="text-slate-500">{value}</span>
    </div>
  );
}

function SalesPanel({ total }: { total: number }) {
  return (
    <section className="flex min-h-0 flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-serif text-[20px] font-bold text-slate-950">
          Vendas do Mês
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center p-4">
        <ShoppingCart
          size={46}
          className="text-[#B8860B]"
        />
        <p className="mt-3 text-sm text-slate-700">Total de Vendas</p>
        <h3 className="mt-1 text-[24px] font-bold text-emerald-700">
          {money(total)}
        </h3>
        <p className="mt-2 text-xs text-emerald-700">
          {total > 0 ? "Atualizado com vendas reais" : "Nenhuma venda no mês"}
        </p>
      </div>
    </section>
  );
}
