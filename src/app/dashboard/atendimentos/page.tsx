"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AttendanceRecord = {
  id: string;
  data: string;
  gira: string;
  quantidade: number;
  observacoes?: string | null;
};

type Summary = {
  selectedTotal: number;
  total: number;
  average: number;
  byDay: Array<{
    date: string;
    total: number;
  }>;
  byGira: Array<{
    gira: string;
    total: number;
    count: number;
  }>;
  byMonth: Array<{
    month: string;
    total: number;
  }>;
};

type ApiData = {
  records: AttendanceRecord[];
  summary: Summary;
};

const giraOptions = [
  "Baianos",
  "Boiadeiros",
  "Caboclos",
  "Ciganos",
  "Erês",
  "Exu e Pombo Gira",
  "Malandros",
  "Marinheiros",
  "Preto Velho",
];

const historyPageSize = 10;

function todayInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function monthInput(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsAgo(amount: number) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - amount);
  return monthInput(date);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(" de ", "/")
    .replace(".", "");
}

function monthsBetween(start: string, end: string) {
  if (!start || !end || start > end) {
    return [];
  }

  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const last = new Date(Date.UTC(endYear, endMonth - 1, 1));
  const months: string[] = [];

  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function dateInput(value: string) {
  return value.slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateInput(value)}T00:00:00`));
}

export default function AtendimentosPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<Summary>({
    selectedTotal: 0,
    total: 0,
    average: 0,
    byDay: [],
    byGira: [],
    byMonth: [],
  });
  const [monthFrom, setMonthFrom] = useState(() => monthsAgo(5));
  const [monthTo, setMonthTo] = useState(() => monthInput());
  const [selectedDate, setSelectedDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    data: todayInput(),
    gira: "Caboclos",
    quantidade: "",
    observacoes: "",
  });

  async function load(date = selectedDate) {
    setLoading(true);
    const params = new URLSearchParams();

    if (date) {
      params.set("data", date);
    }

    const response = await fetch(
      `/api/visitor-attendances${params.toString() ? `?${params}` : ""}`
    );
    const data = (await response.json()) as ApiData;

    setRecords(Array.isArray(data.records) ? data.records : []);
    setHistoryPage(1);
    setSummary(
      data.summary || {
        selectedTotal: 0,
        total: 0,
        average: 0,
        byDay: [],
        byGira: [],
        byMonth: [],
      }
    );
    setLoading(false);
  }

  useEffect(() => {
    // A tela carrega dados de uma API client-side ao abrir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(
    () =>
      summary.byDay.map((day) => ({
        date: dateInput(day.date),
        total: day.total,
      })),
    [summary.byDay]
  );

  const maxGiraTotal = Math.max(
    ...summary.byGira.map((item) => item.total),
    1
  );
  const maxDayTotal = Math.max(...days.map((item) => item.total), 1);
  const monthlyData = useMemo(() => {
    const totals = new Map(
      summary.byMonth.map((item) => [item.month, item.total])
    );

    return monthsBetween(monthFrom, monthTo).map((month) => ({
      month,
      label: monthLabel(month),
      total: totals.get(month) || 0,
    }));
  }, [monthFrom, monthTo, summary.byMonth]);
  const monthlyTotal = monthlyData.reduce((total, item) => total + item.total, 0);
  const monthlyAverage = monthlyData.length
    ? Math.round(monthlyTotal / monthlyData.length)
    : 0;
  const historyTotalPages = Math.max(
    Math.ceil(records.length / historyPageSize),
    1
  );
  const paginatedRecords = records.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  function resetForm() {
    setEditingId("");
    setForm({
      data: selectedDate || todayInput(),
      gira: "Caboclos",
      quantidade: "",
      observacoes: "",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch(
      editingId
        ? `/api/visitor-attendances/${editingId}`
        : "/api/visitor-attendances",
      {
        method: editingId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || "Não foi possível salvar.");
      return;
    }

    const nextDate = selectedDate || "";
    resetForm();
    await load(nextDate);
  }

  async function remove(record: AttendanceRecord) {
    const ok = window.confirm("Deseja excluir este lançamento?");

    if (!ok) {
      return;
    }

    await fetch(`/api/visitor-attendances/${record.id}`, {
      method: "DELETE",
    });
    await load(selectedDate);
  }

  function selectDay(date: string) {
    setSelectedDate(date);
    setForm((current) => ({
      ...current,
      data: date,
    }));
    void load(date);
  }

  function edit(record: AttendanceRecord) {
    setEditingId(record.id);
    setForm({
      data: dateInput(record.data),
      gira: record.gira,
      quantidade: String(record.quantidade),
      observacoes: record.observacoes || "",
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">
              Atendimentos
            </h1>
            <p className="text-slate-500">
              Controle diário de visitantes e consulentes por gira.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void load(selectedDate)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#07111F] px-4 py-3 text-sm font-semibold text-white"
          >
            <RefreshCw size={18} />
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <SummaryCard title="Total" value={summary.total} />
          <SummaryCard title="Média" value={summary.average} />
          <SummaryCard
            title={selectedDate ? "Total do dia" : "Registros"}
            value={selectedDate ? summary.selectedTotal : records.length}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
              Cadastro
            </p>
            <h2 className="mt-2 text-[22px] font-bold text-slate-900">
              {editingId ? "Editar lançamento" : "Novo lançamento"}
            </h2>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Data
                </span>
                <input
                  type="date"
                  value={form.data}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      data: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Gira
                </span>
                <select
                  value={form.gira}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      gira: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                  required
                >
                  {giraOptions.map((gira) => (
                    <option key={gira} value={gira}>
                      {gira}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Quantidade
                </span>
                <input
                  type="number"
                  min="1"
                  value={form.quantidade}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantidade: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Observações
                </span>
                <textarea
                  value={form.observacoes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      observacoes: event.target.value,
                    }))
                  }
                  className="min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#C6921E]"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white shadow-sm"
                >
                  <Save size={18} />
                  Salvar
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Limpar
                </button>
              </div>
            </form>
          </section>

          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Dias
                </p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                  Histórico por data
                </h2>
              </div>

              {selectedDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    void load("");
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Ver todos
                </button>
              )}
            </div>

            <div className="mt-5 flex max-w-full gap-3 overflow-x-auto pb-2">
              {days.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum dia lançado ainda.
                </p>
              ) : (
                days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => selectDay(day.date)}
                    className={`min-w-[132px] rounded-2xl border px-3 py-3 text-left ${
                      selectedDate === day.date
                        ? "border-[#C6921E] bg-[#FFF7E2]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <CalendarDays size={18} className="text-[#C6921E]" />
                    <p className="mt-2 text-xs font-bold text-slate-900">
                      {formatDate(day.date)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {day.total} visitantes
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="mt-6 max-w-full overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-4">Data</th>
                    <th className="px-4 py-4">Gira</th>
                    <th className="px-4 py-4">Quantidade</th>
                    <th className="px-4 py-4">Observações</th>
                    <th className="px-4 py-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        Nenhum lançamento encontrado.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((record) => (
                      <tr key={record.id} className="border-b border-slate-100">
                        <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900">
                          {formatDate(record.data)}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {record.gira}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {record.quantidade}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-4 text-slate-700">
                          <span title={record.observacoes || undefined}>
                            {record.observacoes || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => edit(record)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
                              title="Editar"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(record)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {records.length > 0 && (
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Mostrando{" "}
                  <span className="font-semibold text-slate-700">
                    {(historyPage - 1) * historyPageSize + 1}
                  </span>{" "}
                  até{" "}
                  <span className="font-semibold text-slate-700">
                    {Math.min(historyPage * historyPageSize, records.length)}
                  </span>{" "}
                  de{" "}
                  <span className="font-semibold text-slate-700">
                    {records.length}
                  </span>{" "}
                  lançamento(s)
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setHistoryPage((current) => Math.max(current - 1, 1))
                    }
                    disabled={historyPage <= 1}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Anterior
                  </button>
                  <span className="rounded-xl bg-[#07111F] px-3 py-2 text-sm font-bold text-white">
                    {String(historyPage).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-slate-500">
                    de {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setHistoryPage((current) =>
                        Math.min(current + 1, historyTotalPages)
                      )
                    }
                    disabled={historyPage >= historyTotalPages}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Gráfico
                </p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                  Número de consulentes
                </h2>
              </div>
              <p className="text-sm font-semibold text-slate-500">
                Pico: {maxDayTotal} visitantes
              </p>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-100 bg-linear-to-b from-slate-50 to-white p-4">
              {days.length === 0 ? (
                <div className="flex h-80 items-center justify-center text-sm text-slate-500">
                  Nenhum dado disponível para o gráfico.
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-hidden pb-2">
                  <div className="relative flex h-[360px] min-w-max items-end gap-4 border-b border-slate-200 px-2 pt-8">
                    <div className="pointer-events-none absolute inset-x-2 top-8 bottom-0 grid grid-rows-4">
                      <span className="border-t border-slate-200/70" />
                      <span className="border-t border-slate-200/70" />
                      <span className="border-t border-slate-200/70" />
                      <span className="border-t border-slate-200/70" />
                    </div>

                    {days.map((day) => {
                      const barHeight = Math.max(
                        (day.total / maxDayTotal) * 250,
                        18
                      );

                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => selectDay(day.date)}
                          className="group relative z-10 flex w-[78px] shrink-0 flex-col items-center justify-end gap-3 rounded-2xl px-2 pb-3 transition hover:bg-white/80"
                          title={`${formatDate(day.date)}: ${day.total} visitantes`}
                        >
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-100">
                            {day.total}
                          </span>
                          <span
                            className={`w-12 rounded-t-2xl shadow-sm transition group-hover:scale-105 ${
                              selectedDate === day.date
                                ? "bg-linear-to-t from-[#B8860B] to-[#F2C14E]"
                                : "bg-linear-to-t from-[#174A8B] to-[#68A7E8]"
                            }`}
                            style={{
                              height: `${barHeight}px`,
                            }}
                          />
                          <span className="min-h-10 text-center text-[11px] font-semibold leading-tight text-slate-500">
                            {formatDate(day.date)
                              .replace(" de ", "/")
                              .replace(" de ", "/")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Evolução mensal
                </p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                  Atendimentos por mês
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Comparativo de visitantes no período selecionado.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-2xl bg-[#FFF8E7] px-3 py-2 text-right">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#9A7010]">
                    Média mensal
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    {monthlyAverage}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Mês inicial</span>
                <input
                  type="month"
                  value={monthFrom}
                  max={monthTo}
                  onChange={(event) => setMonthFrom(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#C6921E]"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Mês final</span>
                <input
                  type="month"
                  value={monthTo}
                  min={monthFrom}
                  max={monthInput()}
                  onChange={(event) => setMonthTo(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#C6921E]"
                />
              </label>
            </div>

            <div className="mt-5 h-[330px] rounded-3xl border border-slate-100 bg-linear-to-b from-slate-50 to-white px-2 py-5 sm:px-4">
              {monthlyData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Selecione um período válido para visualizar o gráfico.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 12, right: 16, left: -16, bottom: 4 }}>
                    <defs>
                      <linearGradient id="monthlyLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#174A8B" />
                        <stop offset="100%" stopColor="#D9A520" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#94A3B8", fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ stroke: "#D9A520", strokeWidth: 1, strokeDasharray: "4 4" }}
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)",
                        fontSize: 13,
                      }}
                      formatter={(value) => [`${Number(value)} visitantes`, "Total"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="url(#monthlyLine)"
                      strokeWidth={4}
                      dot={{ r: 5, fill: "#FFFFFF", stroke: "#C6921E", strokeWidth: 3 }}
                      activeDot={{ r: 7, fill: "#C6921E", stroke: "#FFFFFF", strokeWidth: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">Total no período</span>
              <strong className="text-base text-slate-900">{monthlyTotal} visitantes</strong>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
              Totais
            </p>
            <h2 className="mt-2 text-[22px] font-bold text-slate-900">
              Visitantes por gira
            </h2>
            <div className="mt-6 space-y-4">
              {summary.byGira.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum total disponível.
                </p>
              ) : (
                summary.byGira.map((item) => (
                  <div key={item.gira}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-semibold text-slate-700">
                        {item.gira}
                      </span>
                      <span className="text-slate-500">
                        {item.total}
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100">
                      <div
                        className="h-3 rounded-full bg-linear-to-r from-[#D9A520] to-[#B8860B]"
                        style={{
                          width: `${Math.max((item.total / maxGiraTotal) * 100, 4)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
        {title}
      </p>
      <h2 className="mt-3 text-4xl font-bold text-slate-900">
        {value}
      </h2>
    </section>
  );
}
