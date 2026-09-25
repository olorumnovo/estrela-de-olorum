import {
  CalendarDays,
  CheckCircle2,
  Mail,
  MessageCircle,
  ShieldAlert,
  Users,
} from "lucide-react";
import { ReactNode } from "react";

import { prisma } from "@/lib/prisma";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function normalizePhone(value: string | null) {
  return (value || "").replace(/\D/g, "");
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function memberRole(member: {
  hierarchy?: { nome: string } | null;
  classification?: { nome: string } | null;
  memberHierarchies?: Array<{ hierarchy: { nome: string } }>;
  memberClassifications?: Array<{ classification: { nome: string } }>;
}) {
  return normalize(
    [
      member.hierarchy?.nome || "",
      member.classification?.nome || "",
      ...(member.memberHierarchies ?? []).map((item) => item.hierarchy.nome),
      ...(member.memberClassifications ?? []).map(
        (item) => item.classification.nome
      ),
    ].join(" ")
  );
}

function isCurrentWorker(member: Parameters<typeof memberRole>[0]) {
  return memberRole(member).includes(normalize("trabalhador da corrente"));
}

export default async function MensalistasAtrasadosPage() {
  const user = await requireCurrentUserFromCookies();
  const [fees, overdueTransactions, settings, activeMembers] = await Promise.all([
    prisma.monthlyFee.findMany({
      where: {
        templeId: user.templeId,
        deletedAt: null,
        status: "OVERDUE",
        tipoContribuicao: "MENSALIDADE_CORRENTE",
      },
      include: {
        member: {
          include: {
            hierarchy: true,
            classification: true,
            memberHierarchies: {
              include: {
                hierarchy: true,
              },
            },
            memberClassifications: {
              include: {
                classification: true,
              },
            },
          },
        },
      },
      orderBy: {
        vencimento: "asc",
      },
    }),
    prisma.financialTransaction.findMany({
      where: {
        templeId: user.templeId,
        deletedAt: null,
        tipo: "INCOME",
        status: "OVERDUE",
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
      orderBy: {
        vencimento: "asc",
      },
    }),
    prisma.setting.findMany({
      where: {
        templeId: user.templeId,
        chave: {
          in: ["pix_key", "pix_name", "pix_bank"],
        },
      },
    }),
    prisma.member.findMany({
      where: {
        templeId: user.templeId,
        deletedAt: null,
        status: "ACTIVE",
      },
      include: {
        hierarchy: true,
        classification: true,
        memberHierarchies: {
          include: {
            hierarchy: true,
          },
        },
        memberClassifications: {
          include: {
            classification: true,
          },
        },
      },
    }),
  ]);

  const filteredFees = fees.filter(
    (fee) => fee.member?.status === "ACTIVE" && isCurrentWorker(fee.member)
  );

  const memberByName = new Map(
    activeMembers.map((member) => [normalize(member.nome), member])
  );
  const seenMembers = new Set(filteredFees.map((fee) => fee.memberId));
  const receivableOnlyFees = overdueTransactions
    .map((transaction) => {
      const member = memberByName.get(normalize(transaction.centroCusto));

      if (!member || !isCurrentWorker(member) || seenMembers.has(member.id)) {
        return null;
      }

      return {
        memberId: member.id,
        member,
        valor: transaction.valor.toNumber(),
        vencimento: transaction.vencimento ?? transaction.createdAt,
      };
    })
    .filter(
      (
        item
      ): item is {
        memberId: string;
        member: (typeof activeMembers)[number];
        valor: number;
        vencimento: Date;
      } => Boolean(item)
    );

  const pixKey =
    settings.find((item) => item.chave === "pix_key")
      ?.valor || "";
  const pixName =
    settings.find((item) => item.chave === "pix_name")
      ?.valor || "";
  const pixBank =
    settings.find((item) => item.chave === "pix_bank")
      ?.valor || "";

  const groupedFeesSource = [
    ...filteredFees.map((fee) => ({
      memberId: fee.memberId,
      member: fee.member,
      valor: fee.valor.toNumber(),
      vencimento: fee.vencimento,
    })),
    ...receivableOnlyFees,
  ];

  const grouped = Array.from(
    groupedFeesSource
      .reduce((map, fee) => {
        const current = map.get(fee.memberId) || {
          member: fee.member,
          total: 0,
          count: 0,
          oldest: fee.vencimento,
        };

        current.total += fee.valor;
        current.count += 1;

        if (fee.vencimento < current.oldest) {
          current.oldest = fee.vencimento;
        }

        map.set(fee.memberId, current);
        return map;
      }, new Map<string, { member: NonNullable<(typeof fees)[number]["member"]>; total: number; count: number; oldest: Date }>())
      .values()
  );

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
        <div className="space-y-2 border-b border-[#EEE7D9] pb-4">
          <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
            <span>início</span>
            <span>—</span>
            <span>recorrência</span>
            <span className="font-medium text-[#191919]">mensalistas atrasados</span>
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">
            Mensalistas Atrasados
          </h1>
          <p className="text-sm text-[#7A746A]">
            Acompanhe os trabalhadores da corrente com mensalidades vencidas e envie cobranças pelo WhatsApp.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-4 border-b border-[#EEE7D9] px-4 py-4 sm:px-7 sm:gap-5">
            <Tab label="Todos" value={filteredFees.length} active />
            <Tab label="Atrasados" value={grouped.length} />
            <Tab label="WhatsApp" value={grouped.filter((item) => normalizePhone(item.member.telefone).length > 0).length} />
            <div className="flex w-full flex-col gap-3 lg:ml-auto lg:w-auto lg:flex-row lg:gap-4">
              <select className="h-12 rounded-full border border-[#E9E1D2] px-4 text-sm outline-none">
                <option>Tipo: Mensalidade Atrasada</option>
              </select>
              <select className="h-12 rounded-full border border-[#E9E1D2] px-4 text-sm outline-none">
                <option>Período: Últimos 30 dias</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 p-4 sm:p-7 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="font-serif text-[24px] font-bold text-slate-950">
                    Mensalidades Atrasadas
                  </h2>
                  <p className="mt-1 text-slate-600">
                    Total de {grouped.length} trabalhador(es) da corrente em atraso
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat icon={<Mail size={22} />} label="Mensalidades" value={filteredFees.length} />
                  <MiniStat icon={<Users size={22} />} label="Mensalistas" value={grouped.length} />
                  <MiniStat icon={<CheckCircle2 size={22} />} label="Com telefone" value={grouped.filter((item) => normalizePhone(item.member.telefone).length > 0).length} />
                  <MiniStat icon={<ShieldAlert size={22} />} label="Débito" value={money(grouped.reduce((sum, item) => sum + item.total, 0))} />
                </div>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-[#ECE7DB]">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-white text-[#7A746A]">
                    <tr className="border-b border-[#EEE7D9]">
                      <th className="px-6 py-4">Mensalista</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Mensalidades</th>
                      <th className="px-6 py-4">Vencimento mais antigo</th>
                      <th className="px-6 py-4">Valor em débito</th>
                      <th className="px-6 py-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-[#8B8478]">
                          Nenhum mensalista atrasado.
                        </td>
                      </tr>
                    ) : (
                      grouped.map((item) => {
                        const phone = normalizePhone(item.member.telefone);
                        const text = encodeURIComponent(
                          `Olá ${item.member.nome}, identificamos ${item.count} mensalidade(s) em atraso no valor total de ${money(item.total)}. Para regularizar, utilize o PIX: ${pixKey}. Nome: ${pixName}. Banco: ${pixBank}.`
                        );
                        const href = phone
                          ? `https://wa.me/55${phone}?text=${text}`
                          : "#";

                        return (
                          <tr key={item.member.id} className="border-b border-[#F0E9DC] text-[15px] text-[#171717]">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-[#D9A520] to-[#B77B17] text-white">
                                  <CalendarDays size={22} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-950">
                                    {item.member.nome}
                                  </p>
                                  <p className="text-slate-600">
                                    {item.member.telefone || "Sem telefone"}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                                Mensalidade Atrasada
                              </span>
                            </td>
                            <td className="px-6 py-5">{item.count}</td>
                            <td className="px-6 py-5">
                              {new Intl.DateTimeFormat("pt-BR").format(item.oldest)}
                            </td>
                            <td className="px-6 py-5 font-bold text-slate-950">
                              {money(item.total)}
                            </td>
                            <td className="px-6 py-5">
                              <a
                                href={href}
                                target="_blank"
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-white ${
                                  phone
                                    ? "bg-[#C6921E] hover:bg-[#B8860B]"
                                    : "pointer-events-none bg-slate-300"
                                }`}
                              >
                                <MessageCircle size={17} />
                                Notificar Mensalista
                              </a>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-[28px] border border-[#ECE7DB] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-[23px] font-bold text-slate-950">
                  Filtros
                </h2>
                <span className="text-sm text-[#B8860B]">
                  Limpar filtros
                </span>
              </div>
              <div className="mt-6 space-y-5">
                <FilterSelect label="Tipo de Notificação" value="Mensalidade Atrasada" />
                <FilterSelect label="Canal" value="WhatsApp" />
                <FilterSelect label="Status" value="Atrasada" />
                <button className="h-12 w-full rounded-lg bg-linear-to-r from-[#D9A520] to-[#B77B17] font-semibold text-white">
                  Aplicar Filtros
                </button>
              </div>

              <div className="mt-8 space-y-4">
                <h3 className="font-bold text-slate-950">
                  Dados PIX
                </h3>
                <p className="text-sm text-slate-600">
                  Chave: {pixKey || "Não configurada"}
                </p>
                <p className="text-sm text-slate-600">
                  Nome: {pixName || "Não configurado"}
                </p>
                <p className="text-sm text-slate-600">
                  Banco: {pixBank || "Não configurado"}
                </p>
              </div>
            </aside>
          </div>
        </section>
    </main>
  );
}

function Tab({
  label,
  value,
  active = false,
}: {
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <div className={`flex h-12 items-center gap-2 border-b-2 px-2 ${
      active ? "border-[#C6921E]" : "border-transparent"
    }`}>
      <span>{label}</span>
      <span className="rounded-full bg-[#F7E7C0] px-2 py-1 text-xs font-bold text-[#B8860B]">
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-[120px] rounded-[8px] border border-slate-200 p-4">
      <div className="flex gap-3">
        <div className="text-[#C6921E]">{icon}</div>
        <div>
          <p className="text-xs text-slate-600">{label}</p>
          <p className="mt-1 text-[22px] font-bold text-slate-950">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-950">
        {label}
      </span>
      <select className="h-12 w-full rounded-lg border border-slate-200 px-4 outline-none">
        <option>{value}</option>
      </select>
    </label>
  );
}
