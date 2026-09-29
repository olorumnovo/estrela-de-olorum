"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";

type OverdueItem = { id: string; nome: string | null; historico: string; vencimento: string | null; saldo: number };
type ManualJob = { id: string; memberName: string; amountOverride: number | null; status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED"; error?: string };

function customAmount(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor positivo com até duas casas decimais.");
  const amount = Number(normalized);
  if (amount <= 0) throw new Error("O valor personalizado deve ser maior que zero.");
  return amount;
}

const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

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
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [repeatDays, setRepeatDays] = useState(0);
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [changingState, setChangingState] = useState(false);
  const [overduePage, setOverduePage] = useState(1);
  const [overdue, setOverdue] = useState<{ total: number; pages: number; items: OverdueItem[] }>({ total: 0, pages: 1, items: [] });
  const [overdueError, setOverdueError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [individualAmounts, setIndividualAmounts] = useState<Record<string, string>>({});
  const [bulkAmount, setBulkAmount] = useState("");
  const [queueJobs, setQueueJobs] = useState<ManualJob[]>([]);
  const [queueBusy, setQueueBusy] = useState(false);
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
      .then((data) => {
        setEnabled(data.enabled === true);
        setIntervalMinutes(data.intervalMinutes || 5);
        setRepeatDays(data.repeatDays ?? 0);
      })
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

  async function refreshQueue() {
    const response = await fetch("/api/finance/receivables/manual-whatsapp-charges");
    if (!response.ok) return;
    const data = await response.json();
    setQueueJobs(Array.isArray(data.jobs) ? data.jobs : []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/finance/receivables/manual-whatsapp-charges")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && Array.isArray(data?.jobs)) setQueueJobs(data.jobs); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function saveFrequency() {
    setSavingFrequency(true);
    setFeedback("");
    try {
      const response = await fetch("/api/settings/whatsapp-charge-automation", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "frequency", intervalMinutes, repeatDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível salvar a periodicidade.");
      setFeedback("Periodicidade salva. O cron externo continua chamando a cada 5 minutos; o sistema respeita o intervalo escolhido.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar a periodicidade.");
    } finally {
      setSavingFrequency(false);
    }
  }

  async function enqueue(ids: string[], bulk: boolean) {
    setFeedback("");
    try {
      const commonAmount = bulk ? customAmount(bulkAmount) : null;
      const entries = ids.map((transactionId) => ({
        transactionId,
        amountOverride: customAmount(individualAmounts[transactionId] || "") ?? commonAmount,
      }));
      if (!window.confirm(`Enfileirar ${entries.length} cobrança(s) pelo WhatsApp Financeiro? ${commonAmount !== null ? `${currency(commonAmount)} será informado em cada mensagem sem alterar as contas.` : "O saldo real será informado, exceto nos valores individuais preenchidos."} Os envios serão espaçados conforme a periodicidade salva.`)) return;
      setQueueBusy(true);
      const response = await fetch("/api/finance/receivables/manual-whatsapp-charges", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível enfileirar as cobranças.");
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setFeedback(`${data.queued} cobrança(s) enfileirada(s). Os envios ocorrerão no horário permitido, um por vez.`);
      await refreshQueue();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível enfileirar as cobranças.");
    } finally {
      setQueueBusy(false);
    }
  }

  async function cancelJob(id: string) {
    if (!window.confirm("Cancelar esta cobrança ainda não enviada?")) return;
    setQueueBusy(true);
    try {
      const response = await fetch("/api/finance/receivables/manual-whatsapp-charges", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível cancelar.");
      await refreshQueue();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível cancelar.");
    } finally {
      setQueueBusy(false);
    }
  }

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
          <p className="mt-1 text-xs text-slate-500">Um envio por vez, entre 09h e 18h (São Paulo). A fila manual continua funcionando mesmo se a cobrança automática estiver pausada.</p>
          <p className="mt-1 text-xs text-amber-700">Agendamento externo: configure uma chamada GET autenticada a cada 5 minutos no cron-job.org.</p>
        </div>
        <button type="button" onClick={() => void changeAutomation()} disabled={loadingState || changingState}
          className={`rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${enabled ? "bg-amber-700" : "bg-emerald-700"}`}>
          {changingState ? "Aguarde..." : enabled ? "Pausar cobrança automática" : "Ativar cobrança automática"}
        </button>
      </div>
      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-semibold text-slate-700">Intervalo entre mensagens (minutos)
          <input type="number" min={5} max={1440} step={1} value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Repetir cobrança atrasada após (dias; 0 = nunca)
          <input type="number" min={0} max={365} step={1} value={repeatDays} onChange={(event) => setRepeatDays(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" />
        </label>
        <button type="button" onClick={() => void saveFrequency()} disabled={loadingState || savingFrequency || intervalMinutes < 5 || intervalMinutes > 1440 || repeatDays < 0 || repeatDays > 365} className="rounded-full border border-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-[#2F5BFF] disabled:opacity-50">{savingFrequency ? "Salvando..." : "Salvar frequência"}</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">O cron externo deve continuar rodando a cada 5 minutos. O envio pode ocorrer no próximo ciclo após o intervalo escolhido. A repetição vale para a mesma conta atrasada; avisos de vencimento continuam únicos.</p>
      {feedback && <p role="status" className="mt-3 text-sm text-slate-700">{feedback}</p>}
    </section>
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Membros com contas atrasadas</h2>
        <p className="mt-1 text-sm text-slate-500">Mesmo critério de “Sem competência” → “Atrasadas” em Contas a Receber: apenas membros ativos, sem filtro de mês. {overdue.total} conta(s).</p>
        <p className="mt-1 text-xs text-amber-700">O valor personalizado altera somente o texto da mensagem, nunca a conta a receber. O valor em massa é aplicado a cada conta selecionada; valores individuais têm prioridade.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <button type="button" onClick={() => setSelectedIds((current) => [...new Set([...current, ...overdue.items.map((item) => item.id)])])} disabled={!overdue.items.length} className="rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-50">Selecionar página</button>
          <button type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length} className="rounded-full border px-4 py-2 text-xs font-semibold disabled:opacity-50">Limpar seleção</button>
          <label className="text-xs font-semibold text-slate-700">Valor em massa (R$) — opcional
            <input inputMode="decimal" value={bulkAmount} onChange={(event) => setBulkAmount(event.target.value)} placeholder="Saldo real" className="mt-1 block w-40 rounded-xl border px-3 py-2 font-normal" />
          </label>
          <button type="button" onClick={() => void enqueue(selectedIds, true)} disabled={queueBusy || !selectedIds.length || selectedIds.length > 100} className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Enfileirar selecionadas ({selectedIds.length})</button>
        </div>
        {selectedIds.length > 100 && <p className="mt-2 text-xs text-red-700">Envie no máximo 100 contas por lote.</p>}
      </div>
      {overdueError && <p className="p-5 text-sm text-red-700">{overdueError}</p>}
      <div className="divide-y divide-slate-100">
        {overdue.items.map((item) => (
          <div key={item.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[auto_1fr_1.4fr_auto_auto] sm:items-center sm:gap-4">
            <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`Selecionar cobrança de ${item.nome || "membro"}`} />
            <div><strong>{item.nome}</strong><span className="block text-xs text-slate-500">{item.vencimento?.split("-").reverse().join("/")}</span></div>
            <span className="text-slate-600">{item.historico}</span>
            <strong className="text-red-700">{currency(item.saldo)}</strong>
            <div className="flex items-end gap-2"><label className="text-xs text-slate-500">Valor na mensagem
              <input inputMode="decimal" value={individualAmounts[item.id] || ""} onChange={(event) => setIndividualAmounts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Saldo real" className="mt-1 block w-28 rounded-lg border px-2 py-1.5 text-sm text-slate-900" />
            </label><button type="button" onClick={() => void enqueue([item.id], false)} disabled={queueBusy} className="rounded-full border border-[#2F5BFF] px-3 py-1.5 text-xs font-semibold text-[#2F5BFF] disabled:opacity-50">Só este</button></div>
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
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Fila de cobranças manuais</h2><p className="text-xs text-slate-500">Próximo envio no horário permitido, respeitando o intervalo. Contas quitadas antes do envio são ignoradas.</p></div><button type="button" onClick={() => void refreshQueue()} className="rounded-full border px-3 py-2 text-xs">Atualizar</button></div>
      <div className="mt-4 max-h-72 divide-y overflow-y-auto">
        {queueJobs.slice(0, 30).map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-medium">{job.memberName}</span><span>{job.amountOverride === null ? "Saldo real" : currency(job.amountOverride)}</span><span className="text-slate-500">{{ QUEUED: "Na fila", SENDING: "Em envio — verificar antes de reenviar", SENT: "Enviada", FAILED: "Falhou — verificar antes de reenviar", SKIPPED: "Ignorada/cancelada" }[job.status]}</span>{job.status === "QUEUED" && <button type="button" onClick={() => void cancelJob(job.id)} disabled={queueBusy} className="text-xs font-semibold text-red-700 disabled:opacity-50">Cancelar</button>}{job.error && <span className="w-full text-xs text-red-700">{job.error}</span>}</div>)}
        {!queueJobs.length && <p className="py-3 text-sm text-slate-500">Nenhuma cobrança manual na fila.</p>}
      </div>
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
