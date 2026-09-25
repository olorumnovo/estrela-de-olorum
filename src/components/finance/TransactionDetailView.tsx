"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  FileText,
  MoreHorizontal,
  Pencil,
  Printer,
  Repeat2,
  Trash2,
  Wallet,
} from "lucide-react";

type TransactionDetail = {
  id: string;
  categoryId: string;
  descricao: string;
  centroCusto: string | null;
  tipo: "INCOME" | "EXPENSE";
  valor: number;
  amountPaid: number | null;
  metodo: string | null;
  status: string;
  rawStatus: string | null;
  documentNumber: string | null;
  paymentReference: string | null;
  issuedAt: string | null;
  competencia: string | null;
  vencimento: string | null;
  pagamentoEm: string | null;
  comprovante: string | null;
  observacoes: string | null;
  externalSource: string | null;
  externalId: string | null;
  sourcePages: string[];
  sourceFiles: string[];
  createdAt: string;
  updatedAt: string;
  category: {
    nome: string;
  } | null;
};

type Props = {
  transaction: TransactionDetail;
  categories: Array<{
    id: string;
    nome: string;
  }>;
};

const tabs = [
  { id: "gerais", label: "dados gerais" },
  { id: "financeiro", label: "financeiro" },
  { id: "datas", label: "datas" },
  { id: "origem", label: "origem" },
] as const;

type DetailTab = (typeof tabs)[number]["id"];

const methodLabels: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "DINHEIRO",
  CARTAO_CREDITO: "CRÉDITO",
  CARTAO_DEBITO: "DÉBITO",
  BOLETO: "BOLETO",
  TRANSFERENCIA: "TRANSFERÊNCIA",
};

const methodOptions = [
  { label: "Selecione", value: "" },
  { label: "PIX", value: "PIX" },
  { label: "DINHEIRO", value: "DINHEIRO" },
  { label: "CRÉDITO", value: "CARTAO_CREDITO" },
  { label: "DÉBITO", value: "CARTAO_DEBITO" },
  { label: "BOLETO", value: "BOLETO" },
  { label: "TRANSFERÊNCIA", value: "TRANSFERENCIA" },
];

function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function dateOnly(value: string | null) {
  if (!value) {
    return "-";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
  }).format(new Date(value));
}

function dateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function fieldValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function dateInput(value: string | null) {
  if (!value) {
    return "";
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function moneyInput(value: unknown) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function amountNumber(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[R$]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRecurrence(description: string, notes: string | null) {
  const match = description.trim().match(/^(.*)\s+\((\d+)\/(\d+)\)$/);

  if (!match || !(notes || "").toLowerCase().includes("recorrência")) {
    return null;
  }

  return {
    current: Number(match[2]),
    total: Number(match[3]),
  };
}

function statusLabel(status: string, type: "INCOME" | "EXPENSE") {
  if (status === "PAID") {
    return type === "INCOME" ? "Recebida" : "Paga";
  }

  if (status === "OVERDUE") {
    return "Atrasada";
  }

  if (status === "CANCELED") {
    return "Cancelada";
  }

  return "Em aberto";
}

function statusColor(status: string) {
  if (status === "PAID") {
    return "bg-emerald-500";
  }

  if (status === "OVERDUE") {
    return "bg-rose-500";
  }

  if (status === "CANCELED") {
    return "bg-slate-400";
  }

  return "bg-pink-500";
}

function methodLabel(value: string | null) {
  return value ? methodLabels[value] || value : "-";
}

function DetailField({
  label,
  value,
  strong = false,
  negative = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="text-[15px] text-[#6F6A62]">{label}</div>
      <div
        className={`mt-1 text-[16px] ${
          strong ? "font-semibold" : ""
        } ${negative ? "text-red-600" : "text-[#171717]"}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function TransactionDetailView({ transaction, categories }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>("gerais");
  const [showActions, setShowActions] = useState(false);
  const [deleting, setDeleting] = useState<"month" | "recurrence" | null>(null);
  const [currentTransaction, setCurrentTransaction] = useState(transaction);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    descricao: transaction.descricao || "",
    centroCusto: transaction.centroCusto || "",
    categoryId: transaction.categoryId || "",
    valor: moneyInput(transaction.valor),
    metodo: transaction.metodo || "",
    documentNumber: transaction.documentNumber || "",
    issuedAt: dateInput(transaction.issuedAt),
    competencia: dateInput(transaction.competencia),
    vencimento: dateInput(transaction.vencimento),
    pagamentoEm: dateInput(transaction.pagamentoEm),
    comprovante: transaction.comprovante || "",
    observacoes: transaction.observacoes || "",
  });
  const isExpense = currentTransaction.tipo === "EXPENSE";
  const paid = Number(currentTransaction.amountPaid || 0);
  const balance = Math.max(Number(currentTransaction.valor || 0) - paid, 0);
  const detailTitle = isExpense ? "Conta a Pagar" : "Conta a Receber";
  const partyLabel = isExpense ? "Fornecedor" : "Cliente";
  const backHref = `/dashboard/financeiro?tab=${isExpense ? "pagar" : "receber"}`;

  function startEditing() {
    setEditForm({
      descricao: currentTransaction.descricao || "",
      centroCusto: currentTransaction.centroCusto || "",
      categoryId: currentTransaction.categoryId || categories[0]?.id || "",
      valor: moneyInput(currentTransaction.valor),
      metodo: currentTransaction.metodo || "",
      documentNumber: currentTransaction.documentNumber || "",
      issuedAt: dateInput(currentTransaction.issuedAt),
      competencia: dateInput(currentTransaction.competencia),
      vencimento: dateInput(currentTransaction.vencimento),
      pagamentoEm: dateInput(currentTransaction.pagamentoEm),
      comprovante: currentTransaction.comprovante || "",
      observacoes: currentTransaction.observacoes || "",
    });
    setIsEditing(true);
    setTab("gerais");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm.descricao.trim()) {
      window.alert("Informe o histórico/descrição da conta.");
      return;
    }

    if (!editForm.categoryId) {
      window.alert("Selecione a categoria.");
      return;
    }

    const amount = amountNumber(editForm.valor);

    if (amount <= 0) {
      window.alert("Informe um valor válido.");
      return;
    }

    setSaving(true);

    try {
      const recurrence = parseRecurrence(
        currentTransaction.descricao,
        currentTransaction.observacoes
      );
      const applyFutureRecurrence = window.confirm(
        recurrence
          ? `Esta conta faz parte de uma recorrência (${recurrence.current}/${recurrence.total}).\n\nDeseja aplicar esta alteração também nas recorrências futuras?\n\nOK = alterar este mês e os meses futuros\nCancelar = alterar somente este mês`
          : "Deseja aplicar esta alteração também nas recorrências futuras, caso existam?\n\nOK = alterar este mês e os meses futuros\nCancelar = alterar somente este mês"
      );

      const response = await fetch(`/api/finance/transactions/${currentTransaction.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tipo: currentTransaction.tipo,
          descricao: editForm.descricao,
          centroCusto: editForm.centroCusto,
          categoryId: editForm.categoryId,
          valor: amount,
          metodo: editForm.metodo,
          documentNumber: editForm.documentNumber,
          issuedAt: editForm.issuedAt,
          competencia: editForm.competencia,
          vencimento: editForm.vencimento,
          pagamentoEm: editForm.pagamentoEm,
          comprovante: editForm.comprovante,
          observacoes: editForm.observacoes,
          applyFutureRecurrence,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível salvar a transação.");
      }

      setCurrentTransaction(data as TransactionDetail);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar a transação.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentMonth() {
    if (!window.confirm("Deseja excluir somente esta conta deste mês?")) {
      return;
    }

    setDeleting("month");

    try {
      const response = await fetch(`/api/finance/transactions/${currentTransaction.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Não foi possível excluir esta conta.");
      }

      router.push(backHref);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir esta conta.");
    } finally {
      setDeleting(null);
      setShowActions(false);
    }
  }

  async function deleteRecurrence() {
    if (
      !window.confirm(
        "Deseja excluir toda a recorrência desta conta? Isso remove todos os meses ligados a esta recorrência."
      )
    ) {
      return;
    }

    setDeleting("recurrence");

    try {
      const response = await fetch(
        `/api/finance/transactions/${currentTransaction.id}/delete-recurrence`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Não foi possível excluir a recorrência.");
      }

      window.alert(`${data?.deleted || 0} conta(s) da recorrência foram excluídas.`);
      router.push(backHref);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir a recorrência.");
    } finally {
      setDeleting(null);
      setShowActions(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-116px)] bg-white px-5 py-5 text-[#171717] sm:px-6 lg:px-8">
      <section className="bg-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#AEA79B]">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-full border border-[#E4D8C2] px-4 py-2 text-[#171717] transition hover:bg-[#FAF8F3]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2F5BFF] text-white">
                <ArrowLeft size={12} />
              </span>
              voltar
            </button>
            <span>início</span>
            <span>=</span>
            <span>finanças</span>
            <Link href={backHref} className="font-medium text-[#171717]">
              {isExpense ? "contas a pagar" : "contas a receber"}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[15px] text-[#171717]">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F4EFE5] text-[#171717]">
                <Printer size={12} />
              </span>
              imprimir
            </button>
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 font-semibold text-white"
            >
              <Pencil size={16} />
              editar na lista
            </button>
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[#E4D8C2] px-4 py-2.5"
                onClick={() => setShowActions((current) => !current)}
              >
                mais ações
                <MoreHorizontal size={16} />
              </button>

              {showActions && (
                <>
                  <button
                    type="button"
                    aria-label="Fechar ações"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    onClick={() => setShowActions(false)}
                  />
                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-2xl border border-[#E4D8C2] bg-white py-2 text-[15px] shadow-[0_18px_45px_rgba(15,23,42,0.16)]">
                    <button
                      type="button"
                      disabled={Boolean(deleting)}
                      onClick={deleteCurrentMonth}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[#171717] transition hover:bg-[#FAF8F3] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={17} />
                      {deleting === "month" ? "Excluindo..." : "Excluir do mês"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(deleting)}
                      onClick={deleteRecurrence}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Repeat2 size={17} />
                      {deleting === "recurrence" ? "Excluindo..." : "Excluir recorrência"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-[1060px]">
          <div>
            <h1 className="text-[18px] font-semibold text-[#171717]">
              {detailTitle}
            </h1>
            <p className="mt-1 text-[16px] text-[#4B4B4B]">{currentTransaction.descricao}</p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-8 border-b border-[#E7E0D3]">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`pb-3 text-[15px] ${
                  tab === item.id
                    ? "border-b-2 border-[#171717] font-semibold text-[#171717]"
                    : "text-[#5F5A52]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="space-y-8 py-8">
            {isEditing && (
              <form onSubmit={saveEdit} className="space-y-6 rounded-3xl border border-[#E8E1D4] bg-[#FAF8F3] p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Histórico</span>
                    <input
                      value={editForm.descricao}
                      onChange={(event) => setEditForm((current) => ({ ...current, descricao: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">{partyLabel}</span>
                    <input
                      value={editForm.centroCusto}
                      onChange={(event) => setEditForm((current) => ({ ...current, centroCusto: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Categoria</span>
                    <select
                      value={editForm.categoryId}
                      onChange={(event) => setEditForm((current) => ({ ...current, categoryId: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    >
                      <option value="">Selecione</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Valor</span>
                    <input
                      value={editForm.valor}
                      onChange={(event) => setEditForm((current) => ({ ...current, valor: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Método</span>
                    <select
                      value={editForm.metodo}
                      onChange={(event) => setEditForm((current) => ({ ...current, metodo: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    >
                      {methodOptions.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Nº documento</span>
                    <input
                      value={editForm.documentNumber}
                      onChange={(event) => setEditForm((current) => ({ ...current, documentNumber: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Emissão</span>
                    <input
                      type="date"
                      value={editForm.issuedAt}
                      onChange={(event) => setEditForm((current) => ({ ...current, issuedAt: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Competência</span>
                    <input
                      type="date"
                      value={editForm.competencia}
                      onChange={(event) => setEditForm((current) => ({ ...current, competencia: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Vencimento</span>
                    <input
                      type="date"
                      value={editForm.vencimento}
                      onChange={(event) => setEditForm((current) => ({ ...current, vencimento: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[#6F6A62]">{isExpense ? "Pagamento" : "Recebimento"}</span>
                    <input
                      type="date"
                      value={editForm.pagamentoEm}
                      onChange={(event) => setEditForm((current) => ({ ...current, pagamentoEm: event.target.value }))}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-[#6F6A62]">Observações</span>
                    <textarea
                      value={editForm.observacoes}
                      onChange={(event) => setEditForm((current) => ({ ...current, observacoes: event.target.value }))}
                      rows={4}
                      className="w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[#171717] outline-none focus:border-[#2F5BFF]"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-full border border-[#E4D8C2] px-5 py-2.5 text-sm font-semibold text-[#171717]"
                  >
                    cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? "salvando..." : "salvar alterações"}
                  </button>
                </div>
              </form>
            )}

            {tab === "gerais" && (
            <section className="space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-block h-3 w-3 rounded-full ${statusColor(currentTransaction.status)}`} />
                <span className="rounded-full bg-[#F4EFE5] px-3 py-1 text-[13px] font-medium text-[#171717]">
                  {statusLabel(currentTransaction.status, currentTransaction.tipo)}
                </span>
                {currentTransaction.rawStatus && (
                  <span className="rounded-full bg-[#7C7C7C] px-3 py-1 text-[12px] font-medium text-white">
                    {currentTransaction.rawStatus}
                  </span>
                )}
              </div>

              <div>
                <div className="text-[15px] text-[#6F6A62]">Histórico</div>
                <div className="mt-1 text-[16px] text-[#171717]">{currentTransaction.descricao}</div>
              </div>

              <div className="grid gap-6 md:grid-cols-4">
                <DetailField label={partyLabel} value={fieldValue(currentTransaction.centroCusto)} />
                <DetailField label="Categoria" value={fieldValue(currentTransaction.category?.nome)} />
                <DetailField label="Nº documento" value={fieldValue(currentTransaction.documentNumber)} />
                <DetailField label="Método" value={methodLabel(currentTransaction.metodo)} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#C58A00]" />
                  <h2 className="text-[18px] font-semibold">Observações</h2>
                </div>
                <div className="mt-4 rounded-2xl border border-[#E8E1D4] bg-[#FAF8F3] p-5 text-[15px] leading-7 text-[#4E4A43]">
                  {fieldValue(currentTransaction.observacoes)}
                </div>
              </div>
            </section>
            )}

            {tab === "financeiro" && (
            <section className="space-y-8">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-[#C58A00]" />
                <h2 className="text-[18px] font-semibold">Financeiro</h2>
              </div>

              <div className="grid gap-6 md:grid-cols-4">
                <DetailField label="Valor" value={money(currentTransaction.valor)} strong negative={currentTransaction.valor < 0} />
                <DetailField label={isExpense ? "Pago" : "Recebido"} value={money(paid)} strong negative={paid < 0} />
                <DetailField label="Saldo" value={money(balance)} strong negative={balance < 0} />
                <DetailField label="Referência de pagamento" value={fieldValue(currentTransaction.paymentReference)} />
              </div>
            </section>
            )}

            {tab === "datas" && (
            <section className="space-y-8">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-[#C58A00]" />
                <h2 className="text-[18px] font-semibold">Datas</h2>
              </div>

              <div className="grid gap-6 md:grid-cols-4">
                <DetailField label="Emissão" value={dateOnly(currentTransaction.issuedAt)} />
                <DetailField label="Competência" value={dateOnly(currentTransaction.competencia)} />
                <DetailField label="Vencimento" value={dateOnly(currentTransaction.vencimento)} />
                <DetailField label={isExpense ? "Pagamento" : "Recebimento"} value={dateOnly(currentTransaction.pagamentoEm)} />
              </div>

              <div className="grid gap-6 border-t border-[#E7E0D3] pt-8 md:grid-cols-2">
                <DetailField label="Criado em" value={dateTime(currentTransaction.createdAt)} />
                <DetailField label="Atualizado em" value={dateTime(currentTransaction.updatedAt)} />
              </div>
            </section>
            )}

            {tab === "origem" && (
            <section className="space-y-8">
              <div className="flex items-center gap-2">
                <Banknote size={18} className="text-[#C58A00]" />
                <h2 className="text-[18px] font-semibold">Origem e importação</h2>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <DetailField label="Origem externa" value={fieldValue(currentTransaction.externalSource)} />
                <DetailField label="ID externo" value={fieldValue(currentTransaction.externalId)} />
                <DetailField label="Comprovante" value={fieldValue(currentTransaction.comprovante)} />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <DetailField label="Páginas de origem" value={currentTransaction.sourcePages.length ? currentTransaction.sourcePages.join(", ") : "-"} />
                <DetailField label="Arquivos de origem" value={currentTransaction.sourceFiles.length ? currentTransaction.sourceFiles.join(", ") : "-"} />
              </div>
            </section>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
