"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Edit3,
  Link2,
  Paperclip,
  Search,
  Tag,
} from "lucide-react";

type Category = {
  id: string;
  nome: string;
};

type ContactOption = {
  id: string;
  nome: string;
  type: "member" | "supplier";
  ativo?: boolean;
  status?: string | null;
};

type MembersResponse = {
  data?: ContactOption[];
};

type SuppliersResponse = {
  data?: ContactOption[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
};

type Props = {
  type: "INCOME" | "EXPENSE";
  categories: Category[];
};

const methodOptions = [
  { label: "PIX", value: "PIX" },
  { label: "DINHEIRO", value: "DINHEIRO" },
  { label: "CRÉDITO", value: "CARTAO_CREDITO" },
  { label: "DÉBITO", value: "CARTAO_DEBITO" },
  { label: "BOLETO", value: "BOLETO" },
  { label: "TRANSFERÊNCIA", value: "TRANSFERENCIA" },
];

const tabs = [
  { id: "dados", label: "dados da conta" },
  { id: "anexos", label: "anexos" },
  { id: "marcadores", label: "marcadores" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function todayInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchAllPaginatedRows<T extends { data?: unknown[]; pagination?: { pages?: number } }>(
  buildUrl: (page: number) => string
) {
  const firstResponse = await fetch(buildUrl(1));
  const firstData = (await firstResponse.json()) as T;
  const firstRows = Array.isArray(firstData?.data) ? firstData.data : [];
  const totalPages = Number(firstData?.pagination?.pages || 1);

  if (totalPages <= 1) {
    return firstRows;
  }

  const responses = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_item, index) => fetch(buildUrl(index + 2)))
  );
  const pages = (await Promise.all(responses.map((response) => response.json()))) as T[];

  return [
    ...firstRows,
    ...pages.flatMap((page) => (Array.isArray(page?.data) ? page.data : [])),
  ];
}

function moneyInputToNumber(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[R$]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function TransactionCreateView({ type, categories }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("dados");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    party: "",
    dueDate: "",
    amount: "",
    issuedAt: todayInput(),
    documentNumber: "0",
    history: "",
    categoryId: "",
    method: "",
    occurrence: "UNICA",
    recurrenceMonths: "",
    notes: "",
  });

  const isIncome = type === "INCOME";
  const pageTitle = isIncome ? "Conta a receber" : "Conta a pagar";
  const listTitle = isIncome ? "contas a receber" : "contas a pagar";
  const partyLabel = isIncome ? "Cliente" : "Fornecedor";
  const methodLabel = isIncome ? "Forma de recebimento" : "Forma de pagamento";
  const backHref = `/dashboard/financeiro?tab=${isIncome ? "receber" : "pagar"}`;
  const contactPlaceholder = isIncome
    ? "Pesquise pelas iniciais do nome do cliente, pelo cpf/cnpj ou pelo e-mail"
    : "Pesquise pelas iniciais do fornecedor, pelo cpf/cnpj ou pelo e-mail";

  const datalistId = useMemo(
    () => `finance-create-contact-${type.toLowerCase()}`,
    [type]
  );

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      const [membersResponse, suppliersRows] = await Promise.all([
        fetch("/api/members?status=ACTIVE"),
        fetchAllPaginatedRows<SuppliersResponse>(
          (pageNumber) => `/api/finance/supplier-registry?perPage=100&page=${pageNumber}`
        ),
      ]);
      const membersData = (await membersResponse.json()) as MembersResponse | ContactOption[];
      const membersRows = Array.isArray(membersData)
        ? membersData
        : Array.isArray(membersData?.data)
          ? membersData.data
          : [];

      if (!active) {
        return;
      }

      const nextContacts = [
        ...membersRows
          .filter((item) => item?.nome)
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            type: "member" as const,
            status: item.status,
          })),
        ...(suppliersRows as ContactOption[])
          .filter((item) => item?.nome && item.ativo !== false)
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            type: "supplier" as const,
            ativo: item.ativo,
          })),
      ];

      setContacts(
        Array.from(new Map(nextContacts.map((item) => [`${item.type}-${item.nome}`, item])).values()).sort(
          (left, right) => left.nome.localeCompare(right.nome, "pt-BR")
        )
      );
    }

    void loadContacts();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!form.categoryId && categories[0]?.id) {
      setForm((current) => ({ ...current, categoryId: categories[0].id }));
    }
  }, [categories, form.categoryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.party.trim()) {
      window.alert(`Informe o ${partyLabel.toLowerCase()}.`);
      return;
    }

    if (!form.categoryId) {
      window.alert("Selecione a categoria.");
      return;
    }

    const amount = moneyInputToNumber(form.amount);

    if (amount <= 0) {
      window.alert("Informe um valor válido.");
      return;
    }

    setSaving(true);

    const response = await fetch("/api/finance/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tipo: type,
        descricao: form.history || `${pageTitle} - ${form.party}`,
        categoryId: form.categoryId,
        centroCusto: form.party,
        valor: amount,
        vencimento: form.dueDate,
        issuedAt: form.issuedAt,
        documentNumber: form.documentNumber,
        metodo: form.method,
        observacoes: form.notes,
        recorrenciaAtiva: form.occurrence === "RECORRENTE",
        mesesRecorrencia: form.recurrenceMonths,
      }),
    });

    setSaving(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      window.alert(data.message || `Não foi possível salvar ${pageTitle.toLowerCase()}.`);
      return;
    }

    router.push(backHref);
    router.refresh();
  }

  return (
    <main className="min-h-[calc(100vh-116px)] bg-white px-5 py-5 text-[#171717] sm:px-6 lg:px-8">
      <section className="bg-white">
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
            {listTitle}
          </Link>
        </div>

        <div className="mx-auto mt-12 max-w-[1060px]">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#171717]">
            {pageTitle}
          </h1>

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

          {tab === "dados" && (
            <form onSubmit={submit} className="space-y-5 py-7">
              <label className="block space-y-2">
                <span className="text-sm text-[#6E675C]">{partyLabel}</span>
                <div className="flex overflow-hidden rounded-xl border border-[#AFC4FF] bg-white focus-within:ring-2 focus-within:ring-[#C9D7FF]">
                  <input
                    list={datalistId}
                    value={form.party}
                    onChange={(event) => setForm((current) => ({ ...current, party: event.target.value }))}
                    placeholder={contactPlaceholder}
                    className="min-h-11 flex-1 px-4 py-3 text-[15px] outline-none placeholder:text-[#9B9488]"
                  />
                  <datalist id={datalistId}>
                    {contacts.map((contact) => (
                      <option
                        key={`${contact.type}-${contact.id}`}
                        value={contact.nome}
                        label={contact.type === "supplier" ? "Fornecedor" : "Membro"}
                      />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    aria-label="Editar cadastro"
                    className="my-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6E675C]"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Pesquisar cadastro"
                    className="m-2 ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6E675C]"
                  >
                    <Search size={16} />
                  </button>
                </div>
              </label>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm text-[#6E675C]">Vencimento</span>
                  <div className="flex rounded-xl border border-[#E9E1D2] bg-white">
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                      className="min-h-11 flex-1 px-4 py-3 text-[15px] outline-none"
                    />
                    <span className="m-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6E675C]">
                      <CalendarDays size={16} />
                    </span>
                  </div>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-[#6E675C]">Valor</span>
                  <div className="flex rounded-xl border border-[#E9E1D2] bg-white">
                    <span className="m-2 inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-[#F3EEE4] px-2 text-sm text-[#6E675C]">
                      R$
                    </span>
                    <input
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="min-h-11 flex-1 px-2 py-3 text-[15px] outline-none"
                    />
                  </div>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-[#6E675C]">Data emissão</span>
                  <div className="flex rounded-xl border border-[#E9E1D2] bg-white">
                    <input
                      type="date"
                      value={form.issuedAt}
                      onChange={(event) => setForm((current) => ({ ...current, issuedAt: event.target.value }))}
                      className="min-h-11 flex-1 px-4 py-3 text-[15px] outline-none"
                    />
                    <span className="m-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6E675C]">
                      <CalendarDays size={16} />
                    </span>
                  </div>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-[#6E675C]">Nº documento</span>
                  <div className="flex rounded-xl border border-[#E9E1D2] bg-white">
                    <span className="m-2 inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-[#F3EEE4] px-2 text-sm text-[#6E675C]">
                      0
                    </span>
                    <input
                      value={form.documentNumber}
                      onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))}
                      className="min-h-11 flex-1 px-2 py-3 text-[15px] outline-none"
                    />
                  </div>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-[#6E675C]">Histórico</span>
                <textarea
                  value={form.history}
                  onChange={(event) => setForm((current) => ({ ...current, history: event.target.value }))}
                  className="min-h-20 w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] outline-none"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-[#6E675C]">Categoria</span>
                <div className="relative">
                  <select
                    value={form.categoryId}
                    onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                    className="min-h-11 w-full appearance-none rounded-xl border border-[#E9E1D2] bg-white px-4 py-3 text-[15px] outline-none"
                  >
                    <option value="">Selecione</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nome}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9B9488]" />
                </div>
              </label>

              <div className="grid gap-6 md:grid-cols-[1fr_1.25fr]">
                <label className="block space-y-2">
                  <span className="text-sm text-[#6E675C]">{methodLabel}</span>
                  <div className="relative">
                    <select
                      value={form.method}
                      onChange={(event) => setForm((current) => ({ ...current, method: event.target.value }))}
                      className="min-h-11 w-full appearance-none rounded-xl border border-[#E9E1D2] bg-white px-4 py-3 text-[15px] outline-none"
                    >
                      <option value="">Selecione</option>
                      {methodOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9B9488]" />
                  </div>
                </label>

                {isIncome && (
                  <div className="mt-7 hidden items-center rounded-lg bg-[#638BEA] px-3 py-2 text-sm text-[#071225] md:flex">
                    <span className="mr-2 rounded-full bg-[#F9B233] px-3 py-1 text-xs font-semibold text-[#171717]">
                      Novidade
                    </span>
                    Agora você pode receber com
                    <span className="mx-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-semibold">
                      <Link2 size={14} />
                      link de pagamento
                    </span>
                    pela conta digital da olist
                  </div>
                )}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="block max-w-sm space-y-2">
                  <span className="text-sm text-[#6E675C]">Ocorrência</span>
                  <div className="relative">
                    <select
                      value={form.occurrence}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          occurrence: event.target.value,
                          recurrenceMonths:
                            event.target.value === "RECORRENTE"
                              ? current.recurrenceMonths || "12"
                              : "",
                        }))
                      }
                      className="min-h-11 w-full appearance-none rounded-xl border border-[#E9E1D2] bg-white px-4 py-3 text-[15px] outline-none"
                    >
                      <option value="UNICA">Única</option>
                      <option value="RECORRENTE">Recorrente</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9B9488]" />
                  </div>
                </label>

                {form.occurrence === "RECORRENTE" && (
                  <label className="block max-w-sm space-y-2">
                    <span className="text-sm text-[#6E675C]">Meses de recorrência</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={form.recurrenceMonths}
                      onChange={(event) => setForm((current) => ({ ...current, recurrenceMonths: event.target.value }))}
                      placeholder="Opcional"
                      className="min-h-11 w-full rounded-xl border border-[#E9E1D2] bg-white px-4 py-3 text-[15px] outline-none"
                    />
                  </label>
                )}
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-[#6E675C]">Observações</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-20 w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] outline-none"
                />
              </label>

              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#EEE7D9] bg-white/95 px-5 py-4 backdrop-blur">
                <div className="mx-auto flex max-w-[1060px] items-center gap-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? "salvando..." : "salvar"}
                  </button>
                  <Link href={backHref} className="text-sm font-medium text-[#171717]">
                    cancelar
                  </Link>
                </div>
              </div>
            </form>
          )}

          {tab === "anexos" && (
            <div className="py-8">
              <div className="rounded-2xl border border-dashed border-[#E4D8C2] bg-[#FAF8F3] p-8 text-center text-[#6E675C]">
                <Paperclip className="mx-auto mb-3 text-[#C58A00]" />
                Os anexos desta conta poderão ser adicionados aqui.
              </div>
            </div>
          )}

          {tab === "marcadores" && (
            <div className="py-8">
              <div className="rounded-2xl border border-dashed border-[#E4D8C2] bg-[#FAF8F3] p-8 text-center text-[#6E675C]">
                <Tag className="mx-auto mb-3 text-[#C58A00]" />
                Os marcadores desta conta poderão ser configurados aqui.
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
