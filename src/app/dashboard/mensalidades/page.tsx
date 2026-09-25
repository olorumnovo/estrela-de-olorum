"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type MemberRecord = {
  id: string;
  nome: string;
  status: string;
  whatsapp?: string | null;
  telefone?: string | null;
  email?: string | null;
  hierarchy?: {
    nome: string;
  } | null;
  classification?: {
    nome: string;
  } | null;
};

type MemberProfile = {
  memberId: string;
  mensalidade: string;
  valor: number | null;
  curso: string;
  vencimento: string;
};

type ChargeModalState = {
  member: MemberRecord;
  profile: MemberProfile | null;
};

function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : "-";
}

export default function MensalidadesPage() {
  const membersPerPage = 20;
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [profilesByMemberId, setProfilesByMemberId] = useState<Record<string, MemberProfile>>({});
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingMonthlyFee, setCreatingMonthlyFee] = useState(false);
  const [chargeModal, setChargeModal] = useState<ChargeModalState | null>(null);
  const [discountValue, setDiscountValue] = useState("0");
  const [surchargeValue, setSurchargeValue] = useState("0");
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [createForm, setCreateForm] = useState({
    memberId: "",
    competencia: "08/2026",
    tipoContribuicao: "MENSALIDADE_CORRENTE",
    valor: "",
    vencimento: "2026-08-10",
    observacoes: "",
  });

  async function loadPageData() {
    const [data, profilesData] = await Promise.all([
      fetch("/api/members?status=ACTIVE").then((response) => response.json()),
      fetch("/api/monthly-fees/member-profiles").then((response) => response.json()),
    ]);

    if (Array.isArray(data)) {
      setMembers(data);
    }

    const profiles: MemberProfile[] = Array.isArray(profilesData?.profiles)
      ? (profilesData.profiles as MemberProfile[])
      : [];

    setProfilesByMemberId(
      profiles.reduce((acc: Record<string, MemberProfile>, profile) => {
        if (profile?.memberId) {
          acc[profile.memberId] = profile;
        }

        return acc;
      }, {})
    );
  }

  useEffect(() => {
    void loadPageData();
  }, []);

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    if (!query) {
      return members;
    }

    return members.filter((member) =>
      member.nome.toLowerCase().includes(query)
    );
  }, [memberSearch, members]);

  const totalMemberPages = Math.max(
    Math.ceil(filteredMembers.length / membersPerPage),
    1
  );
  const currentMemberPage = Math.min(memberPage, totalMemberPages);

  const paginatedMembers = useMemo(() => {
    const start = (currentMemberPage - 1) * membersPerPage;
    return filteredMembers.slice(start, start + membersPerPage);
  }, [currentMemberPage, filteredMembers]);

  const counters = useMemo(
    () => ({
      total: members.length,
      ativos: members.filter((member) => member.status === "ACTIVE").length,
      inativos: members.filter((member) => member.status === "INACTIVE").length,
    }),
    [members]
  );

  function openChargeModal(member: MemberRecord) {
    const profile = profilesByMemberId[member.id] || null;
    setChargeModal({ member, profile });
    setDiscountValue("0");
    setSurchargeValue("0");
    setChargeError("");
  }

  function closeChargeModal() {
    setChargeModal(null);
    setDiscountValue("0");
    setSurchargeValue("0");
    setCharging(false);
    setChargeError("");
  }

  async function handleCreateMonthlyFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingMonthlyFee(true);

    const response = await fetch("/api/monthly-fees", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: createForm.memberId,
        competencia: createForm.competencia,
        tipoContribuicao: createForm.tipoContribuicao,
        valor: Number(createForm.valor),
        vencimento: createForm.vencimento,
        observacoes: createForm.observacoes,
        status: "PENDING",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível cadastrar o mensalista.");
      setCreatingMonthlyFee(false);
      return;
    }

    await loadPageData();
    setShowCreateModal(false);
    setCreateForm({
      memberId: "",
      competencia: "08/2026",
      tipoContribuicao: "MENSALIDADE_CORRENTE",
      valor: "",
      vencimento: "2026-08-10",
      observacoes: "",
    });
    setCreatingMonthlyFee(false);
  }

  async function handleCharge() {
    if (!chargeModal?.member) {
      return;
    }

    setCharging(true);

    const response = await fetch("/api/monthly-fees/charge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memberId: chargeModal.member.id,
        baseAmount: chargeModal.profile?.valor || 0,
        discountAmount: Number(discountValue || 0),
        surchargeAmount: Number(surchargeValue || 0),
        dueDate: chargeModal.profile?.vencimento || "2026-08-10",
        mensalidade: chargeModal.profile?.mensalidade || "Mensalidade Corrente",
        curso: chargeModal.profile?.curso || "-",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setChargeError(
        data.message ||
          "Não foi possível gerar a cobrança no Santander."
      );
      setCharging(false);
      return;
    }

    window.location.href = data.whatsappUrl;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-7">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#EEE7D9] pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
              <span>início</span>
              <span>—</span>
              <span>recorrência</span>
              <span className="font-medium text-[#191919]">mensalidades</span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">Mensalidades</h1>
            <p className="text-sm text-[#7A746A]">
              Lista dos mensalistas membros com valor, curso, vencimento e cobrança.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <SummaryCard title="Membros" value={String(counters.total)} />
            <SummaryCard title="Ativos" value={String(counters.ativos)} />
            <SummaryCard title="Inativos" value={String(counters.inativos)} />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-[#EEE7D9] px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Registros
                </p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                  Mensalistas membros
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={memberSearch}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setMemberPage(1);
                  }}
                  placeholder="Pesquisar"
                  className="h-11 rounded-2xl border border-[#E9E1D2] px-4 text-sm outline-none"
                />

                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#2F5BFF] px-5 text-sm font-semibold text-white shadow-sm"
                >
                  Novo mensalista
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-[#7A746A]">
                  <tr>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Nome do membro</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Tipo</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Valor líquido</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Curso</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Vencimento</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Status</th>
                    <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-[#8B8478]">
                        Nenhum registro encontrado.
                      </td>
                    </tr>
                  ) : (
                    paginatedMembers.map((member) => {
                      const profile = profilesByMemberId[member.id];

                      return (
                        <tr key={member.id} className="border-b border-[#F0E9DC] text-[15px] text-[#171717] last:border-none">
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {member.nome}
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {profile?.mensalidade || "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {profile?.valor !== null && profile?.valor !== undefined
                              ? money(profile.valor)
                              : "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {profile?.curso || "-"}
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {profile?.vencimento
                              ? new Intl.DateTimeFormat("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                }).format(new Date(profile.vencimento))
                              : "10/08/2026"}
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {text(member.status)}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => openChargeModal(member)}
                              className="rounded-full bg-[#171717] px-4 py-2 text-sm font-semibold text-white"
                            >
                              Cobrar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#EEE7D9] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#9B9488]">
                Mostrando {paginatedMembers.length} de {filteredMembers.length} mensalista(s)
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMemberPage((current) => Math.max(current - 1, 1))}
                  disabled={currentMemberPage === 1}
                  className="rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>

                <span className="text-sm text-[#9B9488]">
                  Página {currentMemberPage} de {totalMemberPages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setMemberPage((current) =>
                      Math.min(current + 1, totalMemberPages)
                    )
                  }
                  disabled={currentMemberPage === totalMemberPages}
                  className="rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
      </section>

      {chargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Cobrança
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  {chargeModal.member.nome}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  O redirecionamento será feito para o WhatsApp Web do cliente com o link de cobrança.
                </p>
              </div>

              <button
                type="button"
                onClick={closeChargeModal}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoField
                label="Mensalidade"
                value={chargeModal.profile?.mensalidade || "-"}
              />
              <InfoField
                label="Curso"
                value={chargeModal.profile?.curso || "-"}
              />
              <InfoField
                label="Valor base"
                value={money(chargeModal.profile?.valor || 0)}
              />
              <InfoField
                label="Vencimento"
                value={
                  chargeModal.profile?.vencimento
                    ? new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }).format(new Date(chargeModal.profile.vencimento))
                    : "10/08/2026"
                }
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Desconto
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Acréscimo
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={surchargeValue}
                  onChange={(event) => setSurchargeValue(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                />
              </label>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Valor final</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">
                {money(
                  Math.max(
                    0,
                    Number(chargeModal.profile?.valor || 0) -
                      Number(discountValue || 0) +
                      Number(surchargeValue || 0)
                  )
                )}
              </h3>
            </div>

            {chargeError && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {chargeError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeChargeModal}
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCharge()}
                disabled={charging}
                className="rounded-xl bg-[#07111F] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {charging ? "Gerando..." : "Gerar e abrir WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Cadastro manual
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  Novo mensalista
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre manualmente o membro, tipo de mensalidade, valor e vencimento.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateMonthlyFee} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Membro</span>
                  <select
                    value={createForm.memberId}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, memberId: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                    required
                  >
                    <option value="">Selecione o membro</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Competência</span>
                  <input
                    value={createForm.competencia}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, competencia: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Tipo</span>
                  <select
                    value={createForm.tipoContribuicao}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, tipoContribuicao: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                    required
                  >
                    <option value="MENSALIDADE_CORRENTE">Mensalidade Corrente</option>
                    <option value="CURSO">Curso</option>
                    <option value="COMBO_PRATA">Combo Prata</option>
                    <option value="COMBO_OURO">Combo Ouro</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Valor</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm.valor}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, valor: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Vencimento</span>
                  <input
                    type="date"
                    value={createForm.vencimento}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, vencimento: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                    required
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Curso / Observações</span>
                <textarea
                  value={createForm.observacoes}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, observacoes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#C6921E]"
                  placeholder="Ex.: Desenvolvimento Mediúnico"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingMonthlyFee}
                  className="rounded-xl bg-[#C6921E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#B8860B] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingMonthlyFee ? "Salvando..." : "Salvar mensalista"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
        {title}
      </p>
      <h2 className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </h2>
    </section>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}
