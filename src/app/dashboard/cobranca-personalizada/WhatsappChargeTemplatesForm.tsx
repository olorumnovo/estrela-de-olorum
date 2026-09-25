"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";

import {
  receivableWhatsappTemplateDefaults,
  receivableWhatsappTemplateVariables,
  ReceivableWhatsappTemplateKind,
  ReceivableWhatsappTemplates,
  renderReceivableWhatsappTemplate,
} from "@/lib/finance/receivable-whatsapp-templates";

const templateOptions: Array<{
  id: ReceivableWhatsappTemplateKind;
  label: string;
  description: string;
  badge: string;
}> = [
  {
    id: "UPCOMING",
    label: "Próxima do vencimento",
    description: "Enviada antecipadamente para contas que ainda vão vencer.",
    badge: "Aviso antecipado",
  },
  {
    id: "DUE_TODAY",
    label: "Vence hoje",
    description: "Enviada no próprio dia do vencimento da conta.",
    badge: "Vencimento",
  },
  {
    id: "OVERDUE",
    label: "Conta atrasada",
    description: "Cobrança individual para contas que passaram do vencimento.",
    badge: "Em atraso",
  },
];

const previewVariables = {
  nome: "Maria da Silva",
  historico: "Mensalidade TUEO",
  valor_pendente: "R$ 230,00",
  vencimento: "10/09/2026",
  mes_vencimento: "SETEMBRO",
  pix: "Pix – CNPJ: 48.628.461/0001-30",
};

export default function WhatsappChargeTemplatesForm({
  initialTemplates,
}: {
  initialTemplates: ReceivableWhatsappTemplates;
}) {
  const [activeKind, setActiveKind] =
    useState<ReceivableWhatsappTemplateKind>("UPCOMING");
  const [templates, setTemplates] =
    useState<ReceivableWhatsappTemplates>(initialTemplates);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [changingState, setChangingState] = useState(false);
  const [overduePage, setOverduePage] = useState(1);
  const [overdue, setOverdue] = useState<{ total: number; pages: number; items: Array<{ id: string; nome: string | null; historico: string; vencimento: string | null; saldo: number }> }>({ total: 0, pages: 1, items: [] });
  const [overdueError, setOverdueError] = useState("");
  const activeOption = templateOptions.find((option) => option.id === activeKind)!;
  const preview = useMemo(
    () => renderReceivableWhatsappTemplate(templates[activeKind], previewVariables),
    [activeKind, templates]
  );

  useEffect(() => {
    fetch("/api/settings/whatsapp-charge-automation")
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível consultar a automação.");
        return response.json();
      })
      .then((data) => setEnabled(data.enabled === true))
      .catch((error) => setFeedback(error.message))
      .finally(() => setLoadingState(false));
  }, []);

  useEffect(() => {
    fetch(`/api/finance/receivables/overdue-members?page=${overduePage}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os atrasados.");
        return response.json();
      })
      .then((data) => { setOverdue(data); setOverdueError(""); })
      .catch((error) => setOverdueError(error.message));
  }, [overduePage]);

  async function changeAutomation() {
    setChangingState(true);
    setFeedback("");
    try {
      const response = await fetch("/api/settings/whatsapp-charge-automation", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível alterar a automação.");
      setEnabled(data.enabled);
      setFeedback(data.enabled ? "Cobrança automática ativada." : "Cobrança automática pausada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Erro ao alterar a automação.");
    } finally {
      setChangingState(false);
    }
  }

  function insertVariable(variable: string) {
    setTemplates((current) => ({
      ...current,
      [activeKind]: `${current[activeKind]}${current[activeKind].endsWith(" ") || !current[activeKind] ? "" : " "}${variable}`,
    }));
    setFeedback("");
  }

  async function saveTemplates() {
    setSaving(true);
    setFeedback("");

    try {
      const response = await fetch("/api/settings/whatsapp-charge-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templates),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível salvar as mensagens.");
      }

      setFeedback("Mensagens salvas com sucesso.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Não foi possível salvar as mensagens."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cobrança automática</h2>
          <p className="mt-1 text-sm text-slate-600">{loadingState ? "Consultando estado..." : enabled ? "Ativa — mensagens bloqueadas para edição" : "Pausada — você pode editar as mensagens"}</p>
          <p className="mt-1 text-xs text-slate-500">Um envio por vez, com intervalo mínimo de 5 minutos, entre 09h e 18h (São Paulo). A execução depende do agendador de produção.</p>
          <p className="mt-1 text-xs text-amber-700">Agendamento externo: configure uma chamada GET autenticada a cada 5 minutos no cron-job.org.</p>
        </div>
        <button type="button" onClick={() => void changeAutomation()} disabled={loadingState || changingState}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${enabled ? "bg-amber-700" : "bg-emerald-700"}`}>
          {changingState ? "Aguarde..." : enabled ? "Pausar cobrança automática" : "Ativar cobrança automática"}
        </button>
      </div>
      {feedback && <p role="status" className="mt-3 text-sm text-slate-700">{feedback}</p>}
    </section>
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Membros com contas atrasadas</h2>
        <p className="mt-1 text-sm text-slate-500">Mesmo critério de “Sem competência” → “Atrasadas” em Contas a Receber: apenas membros ativos, sem filtro de mês. {overdue.total} conta(s).</p>
      </div>
      {overdueError && <p className="p-5 text-sm text-red-700">{overdueError}</p>}
      <div className="divide-y divide-slate-100">
        {overdue.items.map((item) => (
          <div key={item.id} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[1fr_1.5fr_auto_auto] sm:gap-4">
            <strong>{item.nome}</strong><span className="text-slate-600">{item.historico}</span>
            <span>{item.vencimento?.split("-").reverse().join("/")}</span>
            <strong className="text-red-700">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.saldo)}</strong>
          </div>
        ))}
        {!overdueError && overdue.items.length === 0 && <p className="p-5 text-sm text-slate-500">Nenhuma conta atrasada encontrada.</p>}
      </div>
      {overdue.pages > 1 && <div className="flex items-center justify-end gap-3 border-t p-4 text-sm">
        <button disabled={overduePage <= 1} onClick={() => setOverduePage((page) => page - 1)} className="disabled:opacity-40">Anterior</button>
        <span>{overduePage} / {overdue.pages}</span>
        <button disabled={overduePage >= overdue.pages} onClick={() => setOverduePage((page) => page + 1)} className="disabled:opacity-40">Próxima</button>
      </div>}
    </section>
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="grid border-b border-slate-200 lg:grid-cols-3">
        {templateOptions.map((option) => {
          const active = option.id === activeKind;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setActiveKind(option.id);
                setFeedback("");
              }}
              className={`border-b px-5 py-5 text-left transition last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${
                active ? "bg-[#FFF8E7]" : "bg-white hover:bg-slate-50"
              }`}
            >
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  active
                    ? "bg-[#F0D58B] text-[#755000]"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {option.badge}
              </span>
              <strong className="mt-3 block text-base text-slate-900">
                {option.label}
              </strong>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        <div className="border-b border-slate-200 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C6921E]">
                Editando modelo
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                {activeOption.label}
              </h2>
            </div>
            <button
              type="button"
              disabled={enabled || loadingState}
              onClick={() => {
                setTemplates((current) => ({
                  ...current,
                  [activeKind]: receivableWhatsappTemplateDefaults[activeKind],
                }));
                setFeedback("Modelo original restaurado. Clique em salvar para confirmar.");
              }}
              className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw size={15} />
              Restaurar modelo
            </button>
          </div>

          <textarea
            disabled={enabled || loadingState}
            value={templates[activeKind]}
            onChange={(event) => {
              setTemplates((current) => ({
                ...current,
                [activeKind]: event.target.value,
              }));
              setFeedback("");
            }}
            className="mt-5 min-h-[430px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm leading-6 text-slate-800 outline-none focus:border-[#C6921E] focus:bg-white"
            spellCheck
          />

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Inserir informação automática
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {receivableWhatsappTemplateVariables.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  disabled={enabled || loadingState}
                  onClick={() => insertVariable(variable.key)}
                  title={variable.description}
                  className="rounded-full border border-[#E7D5A7] bg-[#FFF9EA] px-3 py-1.5 font-mono text-xs font-semibold text-[#76530B] hover:bg-[#FFF1C7]"
                >
                  {variable.key}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              As informações entre chaves são substituídas automaticamente pelos
              dados reais da conta e do membro no momento do envio.
            </p>
          </div>
        </div>

        <aside className="bg-[#F4EFE7] p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8B6508]">
            Prévia no WhatsApp
          </p>
          <div className="mt-5 min-h-[430px] rounded-[24px] bg-[#E9E1D5] p-4 shadow-inner">
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#D9FDD3] px-4 py-3 shadow-sm">
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#1F2C34]">
                {preview}
              </p>
              <p className="mt-1 text-right text-[10px] text-[#667781]">agora ✓✓</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-h-5">
          {feedback ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
              <CheckCircle2 size={17} className="text-emerald-600" />
              {feedback}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void saveTemplates()}
          disabled={saving || enabled || loadingState}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          <Save size={17} />
          {saving ? "Salvando..." : "Salvar mensagens"}
        </button>
      </footer>
    </section>
    </div>
  );
}
