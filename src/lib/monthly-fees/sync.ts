import { PaymentStatus, Prisma } from "@prisma/client";

import { resolveTransactionSourcePages } from "@/lib/finance/payables";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/modules/shared";

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function formatCompetence(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function competenceToDate(competence: string) {
  const match = /^(\d{2})\/(\d{4})$/.exec(competence.trim());

  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const year = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

function buildDueDate(year: number, monthIndex: number, dueDay: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(dueDay, 1), lastDay);

  return new Date(year, monthIndex, safeDay, 12, 0, 0, 0);
}

function resolveFeeStatus(
  currentStatus: PaymentStatus,
  dueDate: Date,
  paidAt: Date | null
) {
  if (currentStatus === "CANCELED") {
    return PaymentStatus.CANCELED;
  }

  if (paidAt || currentStatus === "PAID") {
    return PaymentStatus.PAID;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dueDate < today) {
    return PaymentStatus.OVERDUE;
  }

  return PaymentStatus.PENDING;
}

async function getOrCreateMonthlyFeeCategory(
  templeId: string,
  cache: Map<string, string>
) {
  const cached = cache.get(templeId);

  if (cached) {
    return cached;
  }

  const category = await prisma.financialCategory.upsert({
    where: {
      templeId_nome: {
        templeId,
        nome: "Mensalidades",
      },
    },
    update: {
      ativo: true,
      deletedAt: null,
      descricao: "Categoria criada automaticamente para mensalidades.",
    },
    create: {
      templeId,
      nome: "Mensalidades",
      descricao: "Categoria criada automaticamente para mensalidades.",
      ativo: true,
    },
    select: {
      id: true,
    },
  });

  cache.set(templeId, category.id);
  return category.id;
}

type SyncTempleMonthlyFeesResult = {
  createdFees: number;
  syncedTransactions: number;
  updatedStatuses: number;
};

export async function syncTempleMonthlyFees(templeId: string): Promise<SyncTempleMonthlyFeesResult> {
  const categoryCache = new Map<string, string>();
  let createdFees = 0;
  let syncedTransactions = 0;
  let updatedStatuses = 0;

  const activeMembers = await prisma.member.findMany({
    where: {
      templeId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      nome: true,
      status: true,
      deletedAt: true,
    },
    orderBy: {
      nome: "asc",
    },
  });

  const memberByNormalizedName = new Map(
    activeMembers.map((member) => [normalize(member.nome), member])
  );

  const importedMonthlyTransactions = await prisma.financialTransaction.findMany({
    where: {
      templeId,
      deletedAt: null,
      tipo: "INCOME",
      externalSource: {
        not: "monthly_fee",
      },
      OR: [
        {
          descricao: {
            contains: "mensalidade",
            mode: "insensitive",
          },
        },
        {
          observacoes: {
            contains: "mensalidade",
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      descricao: true,
      centroCusto: true,
      valor: true,
      vencimento: true,
      pagamentoEm: true,
      metodo: true,
      status: true,
      observacoes: true,
      competencia: true,
      createdAt: true,
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
  });

  for (const transaction of importedMonthlyTransactions) {
    const member = memberByNormalizedName.get(normalize(transaction.centroCusto));

    if (!member) {
      continue;
    }

    const competenceDate = transaction.competencia ?? transaction.vencimento ?? transaction.createdAt;
    const competence = formatCompetence(competenceDate);
    const dueDate = transaction.vencimento ?? transaction.createdAt;

    await prisma.monthlyFee.upsert({
      where: {
        memberId_competencia_tipoContribuicao: {
          memberId: member.id,
          competencia: competence,
          tipoContribuicao: "MENSALIDADE_CORRENTE",
        },
      },
      update: {
        referencia: transaction.competencia ?? undefined,
        valor: transaction.valor,
        vencimento: dueDate,
        pagamentoEm: transaction.pagamentoEm,
        metodo: transaction.metodo,
        status: transaction.status,
        observacoes: transaction.observacoes || transaction.descricao,
        deletedAt: null,
      },
      create: {
        templeId,
        memberId: member.id,
        competencia: competence,
        tipoContribuicao: "MENSALIDADE_CORRENTE",
        referencia: transaction.competencia ?? null,
        valor: transaction.valor,
        vencimento: dueDate,
        pagamentoEm: transaction.pagamentoEm,
        metodo: transaction.metodo,
        status: transaction.status,
        observacoes: transaction.observacoes || transaction.descricao,
      },
    });
  }

  const latestCurrentFees = await prisma.monthlyFee.findMany({
    where: {
      templeId,
      deletedAt: null,
      tipoContribuicao: "MENSALIDADE_CORRENTE",
      member: {
        deletedAt: null,
        status: "ACTIVE",
      },
    },
    include: {
      member: {
        select: {
          id: true,
          nome: true,
          status: true,
          deletedAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const latestFeeByMember = new Map<string, (typeof latestCurrentFees)[number]>();

  for (const fee of latestCurrentFees) {
    if (!fee.member || latestFeeByMember.has(fee.memberId)) {
      continue;
    }

    latestFeeByMember.set(fee.memberId, fee);
  }

  const today = new Date();
  const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12, 0, 0, 0);

  for (const template of latestFeeByMember.values()) {
    const dueDay = template.vencimento.getDate();

    for (const targetDate of [currentMonthDate, nextMonthDate]) {
      const competencia = formatCompetence(targetDate);
      const dueDate = buildDueDate(targetDate.getFullYear(), targetDate.getMonth(), dueDay);
      const status = resolveFeeStatus(PaymentStatus.PENDING, dueDate, null);

      await prisma.monthlyFee.upsert({
        where: {
          memberId_competencia_tipoContribuicao: {
            memberId: template.memberId,
            competencia,
            tipoContribuicao: "MENSALIDADE_CORRENTE",
          },
        },
        update: {},
        create: {
          templeId,
          memberId: template.memberId,
          competencia,
          tipoContribuicao: "MENSALIDADE_CORRENTE",
          referencia: targetDate,
          valor: template.valor,
          vencimento: dueDate,
          status,
          observacoes: template.observacoes,
        },
      }).then((record) => {
        if (record.createdAt.getTime() === record.updatedAt.getTime()) {
          createdFees += 1;
        }
      });
    }
  }

  const monthlyFees = await prisma.monthlyFee.findMany({
    where: {
      templeId,
      deletedAt: null,
    },
    include: {
      member: {
        select: {
          id: true,
          nome: true,
          status: true,
        },
      },
    },
    orderBy: [{ vencimento: "asc" }, { createdAt: "desc" }],
  });

  const categoryId = await getOrCreateMonthlyFeeCategory(templeId, categoryCache);

  for (const fee of monthlyFees) {
    if (!fee.member || fee.member.status !== "ACTIVE") {
      continue;
    }

    const normalizedStatus = resolveFeeStatus(fee.status, fee.vencimento, fee.pagamentoEm);

    if (normalizedStatus !== fee.status) {
      await prisma.monthlyFee.update({
        where: { id: fee.id },
        data: {
          status: normalizedStatus,
        },
        select: { id: true },
      });
      updatedStatuses += 1;
    }

    const competenciaDate = competenceToDate(fee.competencia) ?? fee.referencia ?? fee.vencimento;
    const description =
      fee.tipoContribuicao === "MENSALIDADE_CORRENTE"
        ? "Mensalidade Corrente"
        : fee.tipoContribuicao || "Mensalidade";

    await prisma.financialTransaction.upsert({
      where: {
        templeId_externalSource_externalId: {
          templeId,
          externalSource: "monthly_fee",
          externalId: fee.id,
        },
      },
      update: {
        categoryId,
        descricao: description,
        centroCusto: fee.member.nome,
        tipo: "INCOME",
        valor: fee.valor,
        metodo: fee.metodo,
        status: normalizedStatus,
        competencia: competenciaDate,
        rawStatus: normalizedStatus === "PAID" ? "Recebido" : normalizedStatus === "OVERDUE" ? "Atrasado" : "Em aberto",
        amountPaid: normalizedStatus === "PAID" ? fee.valor : toDecimal(0),
        vencimento: fee.vencimento,
        pagamentoEm: fee.pagamentoEm,
        observacoes: fee.observacoes,
        sourcePages: resolveTransactionSourcePages(normalizedStatus),
        sourceFiles: ["monthly_fees"],
        issuedAt: competenciaDate,
        deletedAt: null,
      },
      create: {
        templeId,
        categoryId,
        descricao: description,
        centroCusto: fee.member.nome,
        tipo: "INCOME",
        valor: fee.valor,
        metodo: fee.metodo,
        status: normalizedStatus,
        competencia: competenciaDate,
        rawStatus: normalizedStatus === "PAID" ? "Recebido" : normalizedStatus === "OVERDUE" ? "Atrasado" : "Em aberto",
        amountPaid: normalizedStatus === "PAID" ? fee.valor : toDecimal(0),
        vencimento: fee.vencimento,
        pagamentoEm: fee.pagamentoEm,
        observacoes: fee.observacoes,
        sourcePages: resolveTransactionSourcePages(normalizedStatus),
        sourceFiles: ["monthly_fees"],
        issuedAt: competenciaDate,
        externalSource: "monthly_fee",
        externalId: fee.id,
      },
      select: {
        id: true,
      },
    });

    syncedTransactions += 1;
  }

  return {
    createdFees,
    syncedTransactions,
    updatedStatuses,
  };
}
