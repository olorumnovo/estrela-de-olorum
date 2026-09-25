import {
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

type ContributionType =
  | "MENSALIDADE_CORRENTE"
  | "CURSO"
  | "MATRICULA"
  | "COMBO_PRATA"
  | "COMBO_OURO";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeStatus(status: PaymentStatus) {
  if (status === "CANCELED") {
    return "CANCELED";
  }

  if (status === "OVERDUE") {
    return "OVERDUE";
  }

  if (status === "PAID") {
    return "PAID";
  }

  return "PENDING";
}

function mergeStatuses(
  statuses: PaymentStatus[]
): PaymentStatus {
  if (statuses.includes("PAID")) {
    return "PAID";
  }

  if (statuses.includes("OVERDUE")) {
    return "OVERDUE";
  }

  if (statuses.every((status) => status === "CANCELED")) {
    return "CANCELED";
  }

  return "PENDING";
}

function classifyContribution(input: {
  category: string;
  description: string;
  amount: number;
}): ContributionType | null {
  const text = normalizeText(
    `${input.category} ${input.description}`
  );

  if (
    text.includes("combo ouro") ||
    text.includes("combo 2")
  ) {
    return "COMBO_OURO";
  }

  if (
    text.includes("combo prata") ||
    text.includes("combo 1") ||
    (text.includes("mensalidade") &&
      text.includes("curso") &&
      text.includes("combo"))
  ) {
    return "COMBO_PRATA";
  }

  if (text.includes("matricula")) {
    return "MATRICULA";
  }

  if (
    text.includes("curso") ||
    text.includes("desenvolvimento")
  ) {
    return "CURSO";
  }

  if (text.includes("mensalidade")) {
    return "MENSALIDADE_CORRENTE";
  }

  if (input.amount === 190 || input.amount === 230 || input.amount === 300) {
    return "MENSALIDADE_CORRENTE";
  }

  return null;
}

function competenciaFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function bestReferenceDate(input: {
  vencimento: Date | null;
  paymentDate: Date | null;
  createdAt: Date;
}) {
  return input.vencimento || input.paymentDate || input.createdAt;
}

async function main() {
  const templeId = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!templeId) {
    throw new Error(
      "Informe o templeId: npx tsx scripts/sync-monthly-fees-from-financial.ts <templeId> [--apply]"
    );
  }

  const members = await prisma.member.findMany({
    where: {
      templeId,
      deletedAt: null,
    },
    select: {
      id: true,
      templeId: true,
      nome: true,
    },
  });

  const membersByTemple = members.reduce<
    Map<string, Map<string, { id: string; nome: string }>>
  >((map, member) => {
    const templeMembers =
      map.get(member.templeId) || new Map();

    templeMembers.set(normalizeText(member.nome), {
      id: member.id,
      nome: member.nome,
    });

    map.set(member.templeId, templeMembers);
    return map;
  }, new Map());

  const transactions =
    await prisma.financialTransaction.findMany({
      where: {
        templeId,
        deletedAt: null,
        tipo: "INCOME",
        centroCusto: {
          not: null,
        },
      },
      include: {
        category: {
          select: {
            nome: true,
          },
        },
      },
      orderBy: [
        {
          vencimento: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });
  const existingMonthlyCount =
    await prisma.monthlyFee.count({
      where: {
        templeId,
        deletedAt: null,
      },
    });

  const unmatchedMembers = new Set<string>();
  const ignoredTransactions = new Set<string>();
  const operations = new Map<
    string,
    {
      memberId: string;
      memberName: string;
      competencia: string;
      contributionType: ContributionType;
      transactionIds: string[];
      activeAmount: number;
      canceledAmount: number;
      statuses: PaymentStatus[];
      referenceDate: Date;
      dueDate: Date;
      paymentDate: Date | null;
      method: PaymentMethod | null;
      templeId: string;
      notes: string[];
    }
  >();

  for (const transaction of transactions) {
    const supplierOrMember = normalizeText(
      transaction.centroCusto || ""
    );

    if (
      !supplierOrMember ||
      supplierOrMember === "consumidor final"
    ) {
      continue;
    }

    const contributionType = classifyContribution({
      category: transaction.category.nome,
      description: transaction.descricao,
      amount: Number(transaction.valor),
    });

    if (!contributionType) {
      ignoredTransactions.add(transaction.id);
      continue;
    }

    const templeMembers =
      membersByTemple.get(transaction.templeId);
    const member = templeMembers?.get(
      supplierOrMember
    );

    if (!member) {
      unmatchedMembers.add(transaction.centroCusto || "");
      continue;
    }

    const referenceDate = bestReferenceDate({
      vencimento: transaction.vencimento,
      paymentDate: transaction.pagamentoEm,
      createdAt: transaction.createdAt,
    });
    const competencia =
      competenciaFromDate(referenceDate);
    const normalizedStatus = normalizeStatus(
      transaction.status
    ) as PaymentStatus;

    const key = [
      member.id,
      competencia,
      contributionType,
    ].join("::");
    const current = operations.get(key);

    if (current) {
      current.transactionIds.push(transaction.id);
      current.statuses.push(normalizedStatus);
      if (normalizedStatus === "CANCELED") {
        current.canceledAmount += Number(
          transaction.valor
        );
      } else {
        current.activeAmount += Number(
          transaction.valor
        );
      }
      current.referenceDate =
        current.referenceDate < referenceDate
          ? current.referenceDate
          : referenceDate;
      current.dueDate =
        current.dueDate < (transaction.vencimento || referenceDate)
          ? current.dueDate
          : transaction.vencimento || referenceDate;
      current.paymentDate =
        transaction.pagamentoEm || current.paymentDate;

      if (!current.method && transaction.metodo) {
        current.method =
          transaction.metodo as PaymentMethod;
      }

      if (transaction.observacoes) {
        current.notes.push(transaction.observacoes);
      }
    } else {
      operations.set(key, {
        memberId: member.id,
        memberName: member.nome,
        competencia,
        contributionType,
        transactionIds: [transaction.id],
        activeAmount:
          normalizedStatus === "CANCELED"
            ? 0
            : Number(transaction.valor),
        canceledAmount:
          normalizedStatus === "CANCELED"
            ? Number(transaction.valor)
            : 0,
        statuses: [normalizedStatus],
        referenceDate,
        dueDate:
          transaction.vencimento || referenceDate,
        paymentDate: transaction.pagamentoEm,
        method:
          (transaction.metodo as PaymentMethod | null) ||
          null,
        templeId: transaction.templeId,
        notes: transaction.observacoes
          ? [transaction.observacoes]
          : [],
      });
    }
  }

  if (apply) {
    const payload = Array.from(operations.values()).map(
      (operation) => ({
        templeId: operation.templeId,
        memberId: operation.memberId,
        competencia: operation.competencia,
        tipoContribuicao: operation.contributionType,
        referencia: operation.referenceDate,
        valor:
          operation.activeAmount > 0
            ? operation.activeAmount
            : operation.canceledAmount,
        vencimento: operation.dueDate,
        pagamentoEm: operation.paymentDate,
        metodo: operation.method,
        status: mergeStatuses(operation.statuses),
        observacoes: [
          "Importado automaticamente do financeiro.",
          `Transações origem: ${operation.transactionIds.join(", ")}.`,
          ...operation.notes,
        ]
          .filter(Boolean)
          .join(" "),
      })
    );

    if (existingMonthlyCount === 0) {
      for (let index = 0; index < payload.length; index += 500) {
        await prisma.monthlyFee.createMany({
          data: payload.slice(index, index + 500),
        });
      }
    } else {
      for (const item of payload) {
        await prisma.monthlyFee.upsert({
          where: {
            memberId_competencia_tipoContribuicao: {
              memberId: item.memberId,
              competencia: item.competencia,
              tipoContribuicao:
                item.tipoContribuicao,
            },
          },
          update: item,
          create: item,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        templeId,
        apply,
        existingMonthlyCount,
        processedTransactions: transactions.length,
        createdOrUpdated: operations.size,
        preview: Array.from(operations.values())
          .slice(0, 10)
          .map((item) => ({
            memberId: item.memberId,
            memberName: item.memberName,
            competencia: item.competencia,
            contributionType:
              item.contributionType,
            amount:
              item.activeAmount > 0
                ? item.activeAmount
                : item.canceledAmount,
            status: mergeStatuses(item.statuses),
            transactionIds: item.transactionIds,
          })),
        unmatchedMembers: Array.from(
          unmatchedMembers
        ).sort(),
        ignoredTransactions: ignoredTransactions.size,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
