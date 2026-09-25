import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function toNumber(value: { toNumber(): number } | number | null | undefined) {
  if (!value) {
    return 0;
  }

  return typeof value === "number" ? value : value.toNumber();
}

const periodOptions = [
  { label: "Diário", value: "diario" },
  { label: "Semanal", value: "semanal" },
  { label: "Mensal", value: "mensal" },
  { label: "Trimestral", value: "trimestral" },
  { label: "Semestral", value: "semestral" },
  { label: "Anual", value: "anual" },
];

function getPeriodRange(period: string) {
  const now = new Date();
  const start = new Date(now);

  start.setHours(0, 0, 0, 0);

  if (period === "diario") {
    return { start, end: now };
  }

  if (period === "semanal") {
    start.setDate(start.getDate() - 6);
    return { start, end: now };
  }

  if (period === "trimestral") {
    start.setMonth(start.getMonth() - 2, 1);
    return { start, end: now };
  }

  if (period === "semestral") {
    start.setMonth(start.getMonth() - 5, 1);
    return { start, end: now };
  }

  if (period === "anual") {
    start.setMonth(0, 1);
    return { start, end: now };
  }

  start.setDate(1);
  return { start, end: now };
}

type Props = {
  searchParams?: Promise<{
    periodo?: string;
    ano?: string;
    membro?: string;
    status?: string;
    hierarquia?: string;
    classificacao?: string;
    pai?: string;
    mae?: string;
    ordenar?: string;
    pagina?: string;
    limite?: string;
  }>;
};

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function yearsBetween(start: Date | null | undefined, end = new Date()) {
  if (!start) {
    return null;
  }

  let years = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < start.getDate())) {
    years -= 1;
  }

  return years;
}

function optionLabel(value: string | null | undefined) {
  return value && value.trim() ? value : "Não informado";
}

function percent(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function clampPercent(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

export default async function RelatoriosPage({ searchParams }: Props) {
  const user = await requireCurrentUserFromCookies();
  const templeId = user.templeId;
  const params = await searchParams;
  const selectedPeriod = periodOptions.some(
    (option) => option.value === params?.periodo
  )
    ? String(params?.periodo)
    : "mensal";
  const selectedYear = Number(params?.ano || new Date().getFullYear());
  const reportYear = Number.isFinite(selectedYear)
    ? selectedYear
    : new Date().getFullYear();
  const memberSearch = String(params?.membro || "").trim();
  const memberStatus = String(params?.status || "TODOS");
  const selectedHierarchy = String(params?.hierarquia || "TODOS");
  const selectedClassification = String(params?.classificacao || "TODOS");
  const selectedFather = String(params?.pai || "TODOS");
  const selectedMother = String(params?.mae || "TODOS");
  const selectedOrder = String(params?.ordenar || "contribuicao");
  const selectedLimit = [10, 25, 50, 100].includes(Number(params?.limite))
    ? Number(params?.limite)
    : 25;
  const selectedPage = Math.max(Number(params?.pagina || 1) || 1, 1);
  const yearStart = new Date(reportYear, 0, 1);
  const yearEnd = new Date(reportYear, 11, 31, 23, 59, 59, 999);
  const period = getPeriodRange(selectedPeriod);

  const [
    members,
    reportMembers,
    hierarchies,
    classifications,
    spiritualEntities,
    schedules,
    care,
    products,
    monthlyFees,
    transactions,
    sales,
  ] = await Promise.all([
    prisma.member.findMany({
      where: {
        templeId,
        deletedAt: null,
        createdAt: {
          gte: period.start,
          lte: period.end,
        },
      },
      select: { status: true, createdAt: true },
    }),
    prisma.member.findMany({
      where: {
        templeId,
        deletedAt: null,
      },
      include: {
        hierarchy: true,
        classification: true,
        fatherEntity1: true,
        fatherEntity2: true,
        motherEntity1: true,
        motherEntity2: true,
        memberHierarchies: {
          include: { hierarchy: true },
          orderBy: { order: "asc" },
        },
        memberClassifications: {
          include: { classification: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.hierarchy.findMany({
      where: { templeId, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.memberClassification.findMany({
      where: { templeId, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.spiritualEntity.findMany({
      where: { templeId, ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.schedule.findMany({
      where: {
        templeId,
        deletedAt: null,
        inicio: {
          gte: period.start,
          lte: period.end,
        },
      },
      select: { tipo: true, status: true, inicio: true },
    }),
    prisma.spiritualCare.findMany({
      where: {
        templeId,
        deletedAt: null,
        data: {
          gte: period.start,
          lte: period.end,
        },
      },
      select: { status: true, tipo: true, data: true },
    }),
    prisma.product.findMany({
      where: { templeId, deletedAt: null },
      select: {
        estoque: true,
        estoqueMinimo: true,
        precoVenda: true,
        ativo: true,
      },
    }),
    prisma.monthlyFee.findMany({
      where: {
        templeId,
        deletedAt: null,
        vencimento: {
          gte: period.start,
          lte: period.end,
        },
      },
      select: { status: true, valor: true, vencimento: true },
    }),
    prisma.financialTransaction.findMany({
      where: {
        templeId,
        deletedAt: null,
        OR: [
          {
            vencimento: {
              gte: period.start,
              lte: period.end,
            },
          },
          {
            createdAt: {
              gte: period.start,
              lte: period.end,
            },
          },
        ],
      },
      select: { tipo: true, status: true, valor: true },
    }),
    prisma.sale.findMany({
      where: {
        templeId,
        createdAt: {
          gte: period.start,
          lte: period.end,
        },
      },
      select: { total: true, status: true, createdAt: true },
    }),
  ]);

  const annualMonthlyFees = await prisma.monthlyFee.findMany({
    where: {
      templeId,
      deletedAt: null,
      status: "PAID",
      OR: [
        {
          pagamentoEm: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
        {
          pagamentoEm: null,
          vencimento: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
      ],
    },
    select: {
      memberId: true,
      valor: true,
    },
  });

  const annualIncomeTransactions = await prisma.financialTransaction.findMany({
    where: {
      templeId,
      deletedAt: null,
      tipo: "INCOME",
      status: "PAID",
      OR: [
        {
          pagamentoEm: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
        {
          pagamentoEm: null,
          vencimento: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
      ],
      AND: [
        {
          OR: [
            { externalSource: null },
            { NOT: { externalSource: "monthly_fee" } },
          ],
        },
      ],
    },
    select: {
      centroCusto: true,
      valor: true,
      amountPaid: true,
    },
  });

  const monthlyContributionByMember = new Map<string, number>();

  for (const fee of annualMonthlyFees) {
    monthlyContributionByMember.set(
      fee.memberId,
      (monthlyContributionByMember.get(fee.memberId) || 0) + toNumber(fee.valor)
    );
  }

  const memberByName = new Map(
    reportMembers.map((member) => [normalize(member.nome), member])
  );
  const transactionContributionByMember = new Map<string, number>();

  for (const transaction of annualIncomeTransactions) {
    const member = memberByName.get(normalize(transaction.centroCusto));

    if (!member) {
      continue;
    }

    const transactionAmount =
      transaction.amountPaid !== null && transaction.amountPaid !== undefined
        ? toNumber(transaction.amountPaid)
        : toNumber(transaction.valor);

    transactionContributionByMember.set(
      member.id,
      (transactionContributionByMember.get(member.id) || 0) + transactionAmount
    );
  }

  const memberReports = reportMembers
    .map((member) => {
      const hierarchyNames = [
        member.hierarchy?.nome,
        ...member.memberHierarchies.map((item) => item.hierarchy.nome),
      ].filter(Boolean) as string[];
      const classificationNames = [
        member.classification?.nome,
        ...member.memberClassifications.map((item) => item.classification.nome),
      ].filter(Boolean) as string[];
      const uniqueHierarchies = Array.from(new Set(hierarchyNames));
      const uniqueClassifications = Array.from(new Set(classificationNames));
      const fatherNames = [
        member.fatherEntity1?.nome,
        member.fatherEntity2?.nome,
      ].filter(Boolean) as string[];
      const motherNames = [
        member.motherEntity1?.nome,
        member.motherEntity2?.nome,
      ].filter(Boolean) as string[];
      const monthlyTotal = monthlyContributionByMember.get(member.id) || 0;
      const transactionTotal = transactionContributionByMember.get(member.id) || 0;
      const total = monthlyTotal + transactionTotal;

      return {
        id: member.id,
        nome: member.nome,
        status: member.status,
        nascimento: member.nascimento,
        admissaoCentro: member.admissaoCentro,
        idade: yearsBetween(member.nascimento),
        anosTerreiro: yearsBetween(member.admissaoCentro),
        hierarquias: uniqueHierarchies,
        classificacoes: uniqueClassifications,
        pais: fatherNames,
        maes: motherNames,
        mensalidades: monthlyTotal,
        contasRecebidas: transactionTotal,
        total,
      };
    })
    .filter((member) => {
      const searchable = normalize(
        [
          member.nome,
          member.status,
          member.hierarquias.join(" "),
          member.classificacoes.join(" "),
          member.pais.join(" "),
          member.maes.join(" "),
        ].join(" ")
      );

      const nameMatches =
        !memberSearch || searchable.includes(normalize(memberSearch));
      const statusMatches =
        memberStatus === "TODOS" || member.status === memberStatus;
      const hierarchyMatches =
        selectedHierarchy === "TODOS" ||
        member.hierarquias.some((item) => item === selectedHierarchy);
      const classificationMatches =
        selectedClassification === "TODOS" ||
        member.classificacoes.some((item) => item === selectedClassification);
      const fatherMatches =
        selectedFather === "TODOS" || member.pais.some((item) => item === selectedFather);
      const motherMatches =
        selectedMother === "TODOS" || member.maes.some((item) => item === selectedMother);

      return (
        nameMatches &&
        statusMatches &&
        hierarchyMatches &&
        classificationMatches &&
        fatherMatches &&
        motherMatches
      );
    })
    .sort((left, right) => {
      if (selectedOrder === "idade") {
        return (right.idade || -1) - (left.idade || -1);
      }

      if (selectedOrder === "terreiro") {
        const leftDate = left.admissaoCentro?.getTime() || Number.MAX_SAFE_INTEGER;
        const rightDate = right.admissaoCentro?.getTime() || Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      }

      if (selectedOrder === "nome") {
        return left.nome.localeCompare(right.nome, "pt-BR");
      }

      return right.total - left.total;
    });

  const topContributor = memberReports.find((member) => member.total > 0);
  const oldestByAge = [...memberReports]
    .filter((member) => member.idade !== null)
    .sort((left, right) => (right.idade || 0) - (left.idade || 0))[0];
  const oldestInTemple = [...memberReports]
    .filter((member) => member.admissaoCentro)
    .sort(
      (left, right) =>
        (left.admissaoCentro?.getTime() || 0) -
        (right.admissaoCentro?.getTime() || 0)
    )[0];
  const filteredContributionTotal = memberReports.reduce(
    (sum, member) => sum + member.total,
    0
  );

  const received =
    monthlyFees
      .filter((item) => item.status === "PAID")
      .reduce((sum, item) => sum + toNumber(item.valor), 0) +
    transactions
      .filter((item) => item.tipo === "INCOME" && item.status === "PAID")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
  const open =
    monthlyFees
      .filter((item) => item.status === "PENDING" || item.status === "OVERDUE")
      .reduce((sum, item) => sum + toNumber(item.valor), 0) +
    transactions
      .filter((item) => item.status === "PENDING" || item.status === "OVERDUE")
      .reduce((sum, item) => sum + toNumber(item.valor), 0);
  const expenses = transactions
    .filter((item) => item.tipo === "EXPENSE" && item.status === "PAID")
    .reduce((sum, item) => sum + toNumber(item.valor), 0);
  const stockValue = products.reduce(
    (sum, product) =>
      sum + toNumber(product.estoque) * toNumber(product.precoVenda),
    0
  );
  const lowStock = products.filter(
    (product) =>
      product.estoqueMinimo !== null &&
      product.estoque.lessThanOrEqualTo(product.estoqueMinimo)
  ).length;
  const paidSales = sales.filter((sale) => sale.status === "PAID");
  const salesTotal = paidSales.reduce(
    (sum, sale) => sum + toNumber(sale.total),
    0
  );
  const balance = received - expenses;
  const activeMembers = members.filter((item) => item.status === "ACTIVE").length;
  const pendingMembers = members.filter((item) => item.status === "PENDING").length;
  const inactiveMembers = members.filter((item) => item.status === "INACTIVE").length;
  const paidMonthlyFees = monthlyFees.filter((item) => item.status === "PAID").length;
  const pendingMonthlyFees = monthlyFees.filter(
    (item) => item.status === "PENDING" || item.status === "OVERDUE"
  ).length;
  const canceledMonthlyFees = monthlyFees.filter(
    (item) => item.status === "CANCELED"
  ).length;
  const completedSchedules = schedules.filter(
    (item) => item.status === "FINALIZADO"
  ).length;
  const pendingSchedules = schedules.filter(
    (item) => item.status === "AGENDADO" || item.status === "EM_ANDAMENTO"
  ).length;
  const canceledSchedules = schedules.filter(
    (item) => item.status === "CANCELADO"
  ).length;
  const completedCare = care.filter((item) => item.status === "FINALIZADO").length;
  const pendingCare = care.filter(
    (item) => item.status === "AGENDADO" || item.status === "EM_ATENDIMENTO"
  ).length;
  const canceledCare = care.filter((item) => item.status === "CANCELADO").length;
  const openSales = sales.filter((item) => item.status === "OPEN").length;
  const canceledSales = sales.filter((item) => item.status === "CANCELED").length;
  const periodLabel =
    periodOptions.find((option) => option.value === selectedPeriod)?.label ||
    "Mensal";
  const financeBreakdown = [
    { label: "Recebido", value: received, color: "#008767" },
    { label: "Despesas", value: expenses, color: "#E11D48" },
    { label: "PDV", value: salesTotal, color: "#2563EB" },
    { label: "Em aberto", value: open, color: "#C6921E" },
  ];
  const maxFinance = Math.max(
    ...financeBreakdown.map((item) => Math.abs(item.value)),
    1
  );
  const operationalRows = [
    {
      area: "Membros",
      total: members.length,
      ok: activeMembers,
      pending: pendingMembers,
      canceled: inactiveMembers,
      caption: "Ativos no período selecionado",
    },
    {
      area: "Agenda",
      total: schedules.length,
      ok: completedSchedules,
      pending: pendingSchedules,
      canceled: canceledSchedules,
      caption: "Compromissos e giras",
    },
    {
      area: "Atendimentos",
      total: care.length,
      ok: completedCare,
      pending: pendingCare,
      canceled: canceledCare,
      caption: "Registros espirituais",
    },
    {
      area: "Mensalidades",
      total: monthlyFees.length,
      ok: paidMonthlyFees,
      pending: pendingMonthlyFees,
      canceled: canceledMonthlyFees,
      caption: "Pagas, pendentes e canceladas",
    },
    {
      area: "PDV",
      total: sales.length,
      ok: paidSales.length,
      pending: openSales,
      canceled: canceledSales,
      caption: "Vendas finalizadas e abertas",
    },
  ];
  const contributionLeaders = memberReports
    .filter((member) => member.total > 0)
    .slice(0, 5);
  const maxContribution = Math.max(
    ...contributionLeaders.map((member) => member.total),
    1
  );
  const totalMemberPages = Math.max(
    Math.ceil(memberReports.length / selectedLimit),
    1
  );
  const currentMemberPage = Math.min(selectedPage, totalMemberPages);
  const memberPageStart = (currentMemberPage - 1) * selectedLimit;
  const paginatedMemberReports = memberReports.slice(
    memberPageStart,
    memberPageStart + selectedLimit
  );
  const firstMemberItem =
    memberReports.length === 0 ? 0 : memberPageStart + 1;
  const lastMemberItem = Math.min(
    memberPageStart + selectedLimit,
    memberReports.length
  );
  const memberPageHref = (page: number) => {
    const query = new URLSearchParams();

    query.set("periodo", selectedPeriod);
    query.set("ano", String(reportYear));
    query.set("pagina", String(page));
    query.set("limite", String(selectedLimit));

    if (memberSearch) query.set("membro", memberSearch);
    if (memberStatus !== "TODOS") query.set("status", memberStatus);
    if (selectedHierarchy !== "TODOS") query.set("hierarquia", selectedHierarchy);
    if (selectedClassification !== "TODOS") {
      query.set("classificacao", selectedClassification);
    }
    if (selectedFather !== "TODOS") query.set("pai", selectedFather);
    if (selectedMother !== "TODOS") query.set("mae", selectedMother);
    if (selectedOrder !== "contribuicao") query.set("ordenar", selectedOrder);

    return `/dashboard/relatorios?${query.toString()}`;
  };

  return (
    <main className="space-y-6 bg-[#F4F7FB] p-4 sm:p-6 lg:p-7">
      <section className="overflow-hidden rounded-[32px] border border-[#DDE7F2] bg-[#07111F] shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="relative px-6 py-6 text-white sm:px-8 lg:px-10">
          <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-[#2F5BFF]/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-80px] left-1/3 h-52 w-52 rounded-full bg-[#C6921E]/25 blur-3xl" />

          <div className="relative grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                <span>início</span>
                <span>—</span>
                <span>finanças</span>
                <span className="font-semibold text-white">relatórios</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#D7A129]">
                  Central analítica
                </p>
                <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  Relatórios profissionais
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  Painel consolidado para acompanhar financeiro, membros,
                  agenda, atendimentos, estoque e contribuições do terreiro.
                </p>
              </div>
            </div>

            <form className="relative rounded-[24px] border border-white/10 bg-white/10 p-4 backdrop-blur">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                  Período do painel
                </span>
                <select
                  name="periodo"
                  defaultValue={selectedPeriod}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white px-4 text-sm font-semibold text-[#0F172A] outline-none"
                >
                  {periodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="mt-3 h-12 w-full rounded-2xl bg-[#2F5BFF] px-5 text-sm font-bold text-white shadow-[0_16px_30px_rgba(47,91,255,0.28)] transition hover:bg-[#244BE0]"
              >
                Atualizar relatórios
              </button>
            </form>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Saldo do período"
          value={money(balance)}
          caption={`${periodLabel} • recebido menos despesas`}
          tone={balance >= 0 ? "green" : "red"}
        />
        <Metric
          title="Total recebido"
          value={money(received)}
          caption={`${paidMonthlyFees} mensalidade(s) pagas`}
          tone="green"
        />
        <Metric
          title="Despesas pagas"
          value={money(expenses)}
          caption={`${transactions.filter((item) => item.tipo === "EXPENSE" && item.status === "PAID").length} conta(s) pagas`}
          tone="red"
        />
        <Metric
          title="Contas em aberto"
          value={money(open)}
          caption={`${pendingMonthlyFees} mensalidade(s)/conta(s)`}
          tone="gold"
        />
        <Metric title="Membros" value={members.length} caption={`${activeMembers} ativo(s)`} tone="blue" />
        <Metric title="Agenda" value={schedules.length} caption={`${completedSchedules} finalizado(s)`} tone="blue" />
        <Metric title="Atendimentos" value={care.length} caption={`${completedCare} finalizado(s)`} tone="blue" />
        <Metric title="Produtos" value={products.length} caption={`${lowStock} com estoque baixo`} tone="gold" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[30px] border border-[#DDE7F2] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                Financeiro
              </p>
              <h2 className="mt-2 text-[24px] font-black tracking-[-0.03em] text-[#0F172A]">
                Fluxo do período
              </h2>
              <p className="mt-1 text-sm text-[#60708F]">
                Comparativo visual dos valores consolidados pelo filtro atual.
              </p>
            </div>
            <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-right">
              <p className="text-xs text-[#60708F]">Total no PDV</p>
              <p className="text-lg font-black text-[#0F172A]">{money(salesTotal)}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {financeBreakdown.map((item) => (
              <FinanceBar
                key={item.label}
                label={item.label}
                value={money(item.value)}
                color={item.color}
                width={clampPercent((Math.abs(item.value) / maxFinance) * 100)}
              />
            ))}
          </div>

          <div className="mt-6 rounded-[24px] bg-gradient-to-r from-[#F8FAFC] to-[#EEF4FF] p-5">
            <p className="text-sm font-semibold text-[#60708F]">
              Resultado líquido do período
            </p>
            <p className={`mt-2 text-3xl font-black ${balance >= 0 ? "text-[#008767]" : "text-[#D90429]"}`}>
              {money(balance)}
            </p>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDE7F2] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Operação
          </p>
          <h2 className="mt-2 text-[24px] font-black tracking-[-0.03em] text-[#0F172A]">
            Saúde por área
          </h2>
          <div className="mt-6 space-y-5">
            {operationalRows.map((row) => (
              <OperationalRow key={row.area} {...row} />
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[30px] border border-[#DDE7F2] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Ranking
          </p>
          <h2 className="mt-2 text-[24px] font-black tracking-[-0.03em] text-[#0F172A]">
            Maiores contribuições
          </h2>
          <p className="mt-1 text-sm text-[#60708F]">
            Baseado nas mensalidades e contas recebidas no ano selecionado.
          </p>

          <div className="mt-6 space-y-4">
            {contributionLeaders.map((member, index) => (
              <ContributionRow
                key={member.id}
                index={index + 1}
                name={member.nome}
                value={money(member.total)}
                width={clampPercent((member.total / maxContribution) * 100)}
              />
            ))}
            {contributionLeaders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#DDE7F2] p-6 text-center text-sm text-[#60708F]">
                Nenhuma contribuição encontrada no ano selecionado.
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Summary title="Valor em estoque" value={money(stockValue)} caption={`${products.length} produto(s) cadastrados`} />
          <Summary title="Vendas canceladas" value={String(canceledSales)} caption={`${sales.length} venda(s) no período`} />
          <Summary title={`Contribuição em ${reportYear}`} value={money(filteredContributionTotal)} caption={`${memberReports.length} membro(s) filtrados`} />
          <Summary title="Mais antigo no terreiro" value={oldestInTemple ? oldestInTemple.nome : "-"} caption={oldestInTemple ? `Desde ${formatDate(oldestInTemple.admissaoCentro)}` : "Sem admissão informada"} />
        </section>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
        <div className="space-y-4 border-b border-[#EEE7D9] px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
              Membros
            </p>
            <h2 className="mt-2 text-[22px] font-bold text-slate-900">
              Contribuições e filtros do terreiro
            </h2>
            <p className="mt-1 text-sm text-[#60708F]">
              Consulte quanto cada membro contribuiu no ano e filtre por idade,
              tempo de casa, hierarquia, classificação e entidades de cabeça.
            </p>
          </div>

          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="periodo" value={selectedPeriod} />
            <input type="hidden" name="pagina" value="1" />
            <input type="hidden" name="limite" value={selectedLimit} />

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Ano</span>
              <input
                name="ano"
                type="number"
                min="2000"
                max="2100"
                defaultValue={reportYear}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Membro</span>
              <input
                name="membro"
                defaultValue={memberSearch}
                placeholder="Nome, pai, mãe, hierarquia..."
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                name="status"
                defaultValue={memberStatus}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="TODOS">Todos</option>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
                <option value="PENDING">Pendente</option>
                <option value="SUSPENDED">Suspenso</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Ordenar por</span>
              <select
                name="ordenar"
                defaultValue={selectedOrder}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="contribuicao">Maior contribuição</option>
                <option value="idade">Membro mais velho</option>
                <option value="terreiro">Mais antigo no terreiro</option>
                <option value="nome">Nome</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Hierarquia</span>
              <select
                name="hierarquia"
                defaultValue={selectedHierarchy}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="TODOS">Todas</option>
                {hierarchies.map((item) => (
                  <option key={item.id} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Classificação</span>
              <select
                name="classificacao"
                defaultValue={selectedClassification}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="TODOS">Todas</option>
                {classifications.map((item) => (
                  <option key={item.id} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Pai de cabeça</span>
              <select
                name="pai"
                defaultValue={selectedFather}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="TODOS">Todos</option>
                {spiritualEntities.map((item) => (
                  <option key={item.id} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Mãe de cabeça</span>
              <select
                name="mae"
                defaultValue={selectedMother}
                className="h-12 w-full rounded-full border border-[#E9E1D2] bg-white px-4 text-sm text-[#1D1B18] outline-none"
              >
                <option value="TODOS">Todas</option>
                {spiritualEntities.map((item) => (
                  <option key={item.id} value={item.nome}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="h-12 rounded-full bg-[#0F172A] px-6 text-sm font-bold text-white transition hover:bg-[#1E293B]"
              >
                Aplicar filtros
              </button>
              <a
                href={`/dashboard/relatorios?periodo=${selectedPeriod}`}
                className="inline-flex h-12 items-center rounded-full border border-[#E9E1D2] bg-white px-6 text-sm font-semibold text-[#1D1B18] transition hover:bg-[#FAF8F3]"
              >
                Limpar
              </a>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-[#EEE7D9] p-6 lg:grid-cols-4">
          <Summary title={`Contribuição em ${reportYear}`} value={money(filteredContributionTotal)} />
          <Summary title="Maior contribuição" value={topContributor ? `${topContributor.nome} • ${money(topContributor.total)}` : "-"} />
          <Summary title="Mais velho por idade" value={oldestByAge ? `${oldestByAge.nome} • ${oldestByAge.idade} anos` : "-"} />
          <Summary title="Mais antigo no terreiro" value={oldestInTemple ? `${oldestInTemple.nome} • desde ${formatDate(oldestInTemple.admissaoCentro)}` : "-"} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#7A746A]">
              <tr>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Membro</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Status</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Contribuição anual</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Mensalidades</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Contas recebidas</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Nascimento</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Admissão</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Hierarquia</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Classificação</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Pai/Mãe de cabeça</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMemberReports.map((member) => (
                <tr key={member.id} className="border-b border-[#F0E9DC] last:border-none">
                  <td className="px-6 py-4 font-semibold text-slate-900">{member.nome}</td>
                  <td className="px-6 py-4 text-slate-700">
                    {member.status === "ACTIVE"
                      ? "Ativo"
                      : member.status === "INACTIVE"
                        ? "Inativo"
                        : member.status === "PENDING"
                          ? "Pendente"
                          : "Suspenso"}
                  </td>
                  <td className="px-6 py-4 font-bold text-[#087F5B]">{money(member.total)}</td>
                  <td className="px-6 py-4 text-slate-700">{money(member.mensalidades)}</td>
                  <td className="px-6 py-4 text-slate-700">{money(member.contasRecebidas)}</td>
                  <td className="px-6 py-4 text-slate-700">
                    {formatDate(member.nascimento)}
                    {member.idade !== null ? ` • ${member.idade} anos` : ""}
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    {formatDate(member.admissaoCentro)}
                    {member.anosTerreiro !== null ? ` • ${member.anosTerreiro} anos` : ""}
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    {member.hierarquias.map(optionLabel).join(", ") || "-"}
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    {member.classificacoes.map(optionLabel).join(", ") || "-"}
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    {[...member.pais, ...member.maes].map(optionLabel).join(", ") || "-"}
                  </td>
                </tr>
              ))}
              {memberReports.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-slate-500">
                    Nenhum membro encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-[#EEE7D9] px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-medium text-[#60708F]">
            Mostrando{" "}
            <span className="font-black text-[#0F172A]">{firstMemberItem}</span>
            {" "}a{" "}
            <span className="font-black text-[#0F172A]">{lastMemberItem}</span>
            {" "}de{" "}
            <span className="font-black text-[#0F172A]">{memberReports.length}</span>
            {" "}membro(s)
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <form className="flex items-center gap-2">
              <input type="hidden" name="periodo" value={selectedPeriod} />
              <input type="hidden" name="ano" value={reportYear} />
              <input type="hidden" name="membro" value={memberSearch} />
              <input type="hidden" name="status" value={memberStatus} />
              <input type="hidden" name="hierarquia" value={selectedHierarchy} />
              <input type="hidden" name="classificacao" value={selectedClassification} />
              <input type="hidden" name="pai" value={selectedFather} />
              <input type="hidden" name="mae" value={selectedMother} />
              <input type="hidden" name="ordenar" value={selectedOrder} />
              <input type="hidden" name="pagina" value="1" />
              <span className="text-sm font-semibold text-[#60708F]">
                Por página
              </span>
              <select
                name="limite"
                defaultValue={selectedLimit}
                className="h-10 rounded-full border border-[#E9E1D2] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <button
                type="submit"
                className="h-10 rounded-full border border-[#E9E1D2] bg-white px-4 text-sm font-bold text-[#0F172A] transition hover:bg-[#FAF8F3]"
              >
                Aplicar
              </button>
            </form>

            <div className="flex items-center gap-2">
              <a
                href={memberPageHref(Math.max(currentMemberPage - 1, 1))}
                aria-disabled={currentMemberPage <= 1}
                className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold transition ${
                  currentMemberPage <= 1
                    ? "pointer-events-none border-[#E9E1D2] bg-[#F8FAFC] text-[#A8B1C1]"
                    : "border-[#E9E1D2] bg-white text-[#0F172A] hover:bg-[#FAF8F3]"
                }`}
              >
                Anterior
              </a>
              <span className="rounded-full bg-[#0F172A] px-4 py-2 text-sm font-black text-white">
                {currentMemberPage} de {totalMemberPages}
              </span>
              <a
                href={memberPageHref(
                  Math.min(currentMemberPage + 1, totalMemberPages)
                )}
                aria-disabled={currentMemberPage >= totalMemberPages}
                className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold transition ${
                  currentMemberPage >= totalMemberPages
                    ? "pointer-events-none border-[#E9E1D2] bg-[#F8FAFC] text-[#A8B1C1]"
                    : "border-[#E9E1D2] bg-white text-[#0F172A] hover:bg-[#FAF8F3]"
                }`}
              >
                Próxima
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({
  title,
  value,
  caption,
  tone = "blue",
}: {
  title: string;
  value: string | number;
  caption?: string;
  tone?: "blue" | "green" | "red" | "gold";
}) {
  const toneClasses = {
    blue: "from-[#EFF6FF] to-white text-[#2F5BFF]",
    green: "from-[#ECFDF5] to-white text-[#008767]",
    red: "from-[#FFF1F2] to-white text-[#D90429]",
    gold: "from-[#FFFBEB] to-white text-[#C6921E]",
  };

  return (
    <section className={`rounded-[28px] border border-[#DDE7F2] bg-gradient-to-br ${toneClasses[tone]} p-6 shadow-sm`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#64748B]">
            {title}
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#0F172A]">
            {value}
          </h2>
          {caption ? (
            <p className="mt-2 text-sm font-medium text-[#60708F]">{caption}</p>
          ) : null}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <span className={`h-3 w-3 rounded-full ${tone === "green" ? "bg-[#008767]" : tone === "red" ? "bg-[#D90429]" : tone === "gold" ? "bg-[#C6921E]" : "bg-[#2F5BFF]"}`} />
        </span>
      </div>
    </section>
  );
}

function Summary({
  title,
  value,
  caption,
}: {
  title: string;
  value: string;
  caption?: string;
}) {
  return (
    <section className="rounded-[28px] border border-[#DDE7F2] bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#C6921E]">
        {title}
      </p>
      <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[#0F172A]">
        {value}
      </h2>
      {caption ? (
        <p className="mt-2 text-sm font-medium text-[#60708F]">{caption}</p>
      ) : null}
    </section>
  );
}

function FinanceBar({
  label,
  value,
  color,
  width,
}: {
  label: string;
  value: string;
  color: string;
  width: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-[#0F172A]">{label}</span>
        <span className="font-black text-[#0F172A]">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#E8EEF7]">
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function OperationalRow({
  area,
  total,
  ok,
  pending,
  canceled,
  caption,
}: {
  area: string;
  total: number;
  ok: number;
  pending: number;
  canceled: number;
  caption: string;
}) {
  const okPercent = clampPercent(percent(ok, total));
  const pendingPercent = clampPercent(percent(pending, total));
  const canceledPercent = clampPercent(percent(canceled, total));

  return (
    <div className="rounded-2xl border border-[#E7EDF5] bg-[#FBFCFE] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-black text-[#0F172A]">{area}</h3>
          <p className="mt-1 text-xs font-medium text-[#60708F]">{caption}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tracking-[-0.04em] text-[#0F172A]">
            {total}
          </p>
          <p className="text-xs text-[#60708F]">total</p>
        </div>
      </div>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#E8EEF7]">
        <div className="bg-[#008767]" style={{ width: `${okPercent}%` }} />
        <div className="bg-[#C6921E]" style={{ width: `${pendingPercent}%` }} />
        <div className="bg-[#D90429]" style={{ width: `${canceledPercent}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <StatusPill color="#008767" label="OK" value={ok} />
        <StatusPill color="#C6921E" label="Pendente" value={pending} />
        <StatusPill color="#D90429" label="Inativo" value={canceled} />
      </div>
    </div>
  );
}

function StatusPill({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-semibold text-[#60708F]">{label}</span>
      </div>
      <p className="mt-1 font-black text-[#0F172A]">{value}</p>
    </div>
  );
}

function ContributionRow({
  index,
  name,
  value,
  width,
}: {
  index: number;
  name: string;
  value: string;
  width: number;
}) {
  return (
    <div className="rounded-2xl border border-[#E7EDF5] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-sm font-black text-white">
            {index}
          </span>
          <span className="truncate font-black text-[#0F172A]">{name}</span>
        </div>
        <span className="shrink-0 font-black text-[#008767]">{value}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EEF7]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2F5BFF] to-[#008767]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
