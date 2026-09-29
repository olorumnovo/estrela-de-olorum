"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { exportRowsToXlsx } from "@/lib/export-xlsx";

type ReportKind = "balancete" | "dre" | "fluxo" | "categoria" | "cliente" | "pagar" | "recebimentos" | "receber";
type Column = { key: string; label: string; money?: boolean };
type ReportData = {
  columns: Column[];
  rows: Record<string, string | number>[];
  summary: { count: number; income: number; expense: number; result: number };
  period: { start: string; end: string };
};

const reports: Array<{ kind: ReportKind; group: string; title: string; description: string }> = [
  { kind: "balancete", group: "Geral", title: "Balancete", description: "Entradas e saídas realizadas no período, por conta." },
  { kind: "dre", group: "Geral", title: "DRE", description: "Demonstrativo de receitas e despesas por categoria." },
  { kind: "fluxo", group: "Geral", title: "Fluxo de Caixa", description: "Projeção das contas em aberto por vencimento." },
  { kind: "categoria", group: "Caixa", title: "Entradas e Saídas por Categoria", description: "Movimentações realizadas agrupadas por categoria." },
  { kind: "cliente", group: "Caixa", title: "Entradas e Saídas por Cliente", description: "Movimentações realizadas agrupadas por cliente." },
  { kind: "pagar", group: "Contas a Pagar", title: "Relatório de Contas a Pagar", description: "Contas a pagar com vencimento no período." },
  { kind: "recebimentos", group: "Contas a Receber", title: "Recebimentos", description: "Contas recebidas no período." },
  { kind: "receber", group: "Contas a Receber", title: "Relatório de Contas a Receber", description: "Contas a receber com vencimento no período." },
];

const groups = ["Geral", "Caixa", "Contas a Pagar", "Contas a Receber"];
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const periodLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return `${String(month).padStart(2, "0")}/${year}`;
};

function chartRows(data: ReportData) {
  const hasDates = data.rows.some((row) => row.data);
  const distinctDates = hasDates ? new Set(data.rows.map((row) => String(row.data || ""))) : null;
  const groupByMonth = Boolean(distinctDates && distinctDates.size > 60);
  const groups = new Map<string, { label: string; entradas: number; saidas: number }>();
  for (const row of data.rows) {
    const date = String(row.data || "");
    const label = groupByMonth && date.includes("/")
      ? date.slice(3)
      : String(row.data || row.categoria || row.cliente || "Outros");
    const current = groups.get(label) || { label, entradas: 0, saidas: 0 };
    current.entradas += Number(row.entradas || 0);
    current.saidas += Number(row.saidas || 0);
    groups.set(label, current);
  }
  const values = [...groups.values()];
  if (hasDates) {
    values.sort((a, b) => {
      const toKey = (text: string) => text.split("/").reverse().join("-");
      return toKey(a.label).localeCompare(toKey(b.label));
    });
  }
  return values;
}

export default function FinancialReportsPage() {
  const [group, setGroup] = useState("Geral");
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [periodMode, setPeriodMode] = useState<"month" | "interval">("month");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [includeTransfers, setIncludeTransfers] = useState(false);
  const [visualization, setVisualization] = useState("automatic");
  const [chartType, setChartType] = useState("lines");
  const [options, setOptions] = useState<{ accounts: string[]; categories: string[] }>({ accounts: [], categories: [] });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const report = reports.find((item) => item.kind === kind);
  const isLedger = kind === "balancete" || kind === "categoria" || kind === "cliente";
  const hasChart = Boolean(data?.columns.some((column) => column.key === "entradas"));

  useEffect(() => {
    let active = true;
    void fetch("/api/finance/reports?options=true").then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar contas e categorias.");
      return response.json();
    }).then((result) => { if (active) setOptions(result); }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar filtros.");
    });
    return () => { active = false; };
  }, []);

  const chart = useMemo(() => data ? chartRows(data) : [], [data]);
  function shiftMonth(delta: number) {
    const [year, index] = month.split("-").map(Number);
    setMonth(monthKey(new Date(year, index - 1 + delta, 1)));
    setData(null);
  }

  function selectedRange() {
    if (periodMode === "interval") return { start: startDate, end: endDate };
    const [year, index] = month.split("-").map(Number);
    const last = new Date(year, index, 0).getDate();
    return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
  }

  async function generate() {
    if (!kind) return;
    const range = selectedRange();
    if (!range.start || !range.end || range.start > range.end) {
      setError("Selecione um período válido.");
      return;
    }
    setError("");
    setData(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind, startDate: range.start, endDate: range.end });
      if (category) params.set("category", category);
      if (isLedger && account) params.set("account", account);
      if (isLedger && includeTransfers) params.set("includeTransfers", "true");
      const response = await fetch(`/api/finance/reports?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível gerar o relatório.");
      setData(result as ReportData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar o relatório.");
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (!data || !report) return;
    const rows = data.rows.map((row) => Object.fromEntries(data.columns.map((column) => [column.label, row[column.key] ?? ""])));
    exportRowsToXlsx(rows, `relatorio-${report.kind}-${data.period.start}-${data.period.end}.xlsx`, report.title);
  }

  function exportPdf() {
    if (!data || !report) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(report.title, 14, 17);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Período: ${data.period.start} a ${data.period.end}  |  ${data.summary.count} registro(s)`, 14, 24);
    const body = data.rows.map((row) => data.columns.map((column) => column.money ? money(Number(row[column.key] || 0)) : String(row[column.key] ?? "")));
    autoTable(pdf, {
      startY: 30,
      head: [data.columns.map((column) => column.label)],
      body: body.length ? body : [data.columns.map((_, index) => index === 0 ? "Nenhum registro encontrado" : "")],
      styles: { font: "helvetica", fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [20, 48, 96], textColor: 255 },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      margin: { top: 30, right: 12, bottom: 14, left: 12 },
      didDrawPage: (context) => {
        pdf.setFontSize(8);
        pdf.text(`Página ${context.pageNumber}`, 282, 203, { align: "right" });
      },
    });
    pdf.save(`relatorio-${report.kind}-${data.period.start}-${data.period.end}.pdf`);
  }

  const inputClass = "w-full rounded-xl border border-[#E7DED0] bg-white px-4 py-3 text-sm text-[#171717] outline-none focus:border-[#2F5BFF]";
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-3 text-xs text-[#A1988B]">
          {kind ? <button type="button" onClick={() => { setKind(null); setData(null); setError(""); }} className="inline-flex items-center gap-1 rounded-full border border-[#E7DED0] px-3 py-1.5 text-sm text-[#171717]"><ArrowLeft size={14} /> voltar</button> : null}
          <Link href="/dashboard">início</Link><span>—</span><span>finanças</span><span>relatórios</span>{report ? <span className="text-[#171717]">{report.title.toLowerCase()}</span> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">{report?.title || "Relatórios Financeiros"}</h1>
        {!report ? <p className="mt-1 text-sm text-[#7A746A]">Selecione um relatório para configurar período, filtros e formato de exportação.</p> : null}
      </section>

      {!report ? (
        <div className="grid gap-5 rounded-[28px] border border-[#ECE7DB] bg-white p-5 shadow-sm md:grid-cols-[230px_1fr]">
          <nav className="space-y-1 border-b border-[#ECE7DB] pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-4" aria-label="Categorias de relatórios">
            {groups.map((item) => <button key={item} type="button" onClick={() => setGroup(item)} className={`block w-full rounded-xl px-4 py-2.5 text-left text-sm ${group === item ? "bg-[#EEF3FF] font-semibold text-[#2F5BFF]" : "text-[#57534E] hover:bg-[#F8F6F2]"}`}>{item}</button>)}
          </nav>
          <div className="space-y-6">
            {(group === "Geral" ? groups : [group]).map((section) => (
              <div key={section}>
                <h2 className="mb-2 text-lg font-semibold text-[#171717]">{section}</h2>
                {reports.filter((item) => item.group === section).map((item) => <button key={item.kind} type="button" onClick={() => { setKind(item.kind); setData(null); setError(""); }} className="block w-full border-b border-[#ECE7DB] px-2 py-3 text-left hover:bg-[#FAF8F3]"><span className="block font-medium text-[#171717]">{item.title}</span><span className="mt-1 block text-sm text-[#8B8478]">{item.description}</span></button>)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <section className="rounded-[28px] border border-[#ECE7DB] bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3">
                <p className="text-sm text-[#7A746A]">Período</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setPeriodMode("month"); setData(null); }} className={`rounded-full border px-3 py-1.5 text-sm ${periodMode === "month" ? "border-[#2F5BFF] text-[#2F5BFF]" : "border-[#E7DED0]"}`}>do mês</button>
                  <button type="button" onClick={() => { setPeriodMode("interval"); setData(null); }} className={`rounded-full border px-3 py-1.5 text-sm ${periodMode === "interval" ? "border-[#2F5BFF] text-[#2F5BFF]" : "border-[#E7DED0]"}`}>intervalo</button>
                </div>
                {periodMode === "month" ? <div><label className="mb-1 block text-sm font-medium">Mês</label><div className="inline-flex items-center gap-3 rounded-xl border border-[#E7DED0] px-2 py-1"><button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className="rounded-full p-2 hover:bg-[#F5F2EC]"><ChevronLeft size={17} /></button><span className="min-w-20 text-center text-sm">{periodLabel(month)}</span><button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês" className="rounded-full p-2 hover:bg-[#F5F2EC]"><ChevronRight size={17} /></button></div></div> : <div className="grid grid-cols-2 gap-2"><label className="text-sm">De<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setData(null); }} className={inputClass} /></label><label className="text-sm">Até<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setData(null); }} className={inputClass} /></label></div>}
              </div>
              <div className="space-y-4">
                <label className="block text-sm text-[#7A746A]">Conta<select value={account} onChange={(event) => { setAccount(event.target.value); setData(null); }} disabled={!isLedger} className={`${inputClass} mt-1 disabled:opacity-50`}><option value="">Todas</option>{options.accounts.map((item) => <option key={item}>{item}</option>)}</select></label>
                {isLedger ? <label className="flex items-center gap-2 text-sm text-[#171717]"><input type="checkbox" checked={includeTransfers} onChange={(event) => { setIncludeTransfers(event.target.checked); setData(null); }} />Considerar transferências</label> : null}
                <label className="block text-sm text-[#7A746A]">Visualização<select value={visualization} onChange={(event) => setVisualization(event.target.value)} className={`${inputClass} mt-1`}><option value="automatic">Automática</option><option value="table">Somente tabela</option><option value="chart">Somente gráfico</option></select></label>
              </div>
              <div className="space-y-4">
                <label className="block text-sm text-[#7A746A]">Categoria<select value={category} onChange={(event) => { setCategory(event.target.value); setData(null); }} className={`${inputClass} mt-1`}><option value="">Todas</option>{options.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="block text-sm text-[#7A746A]">Tipo do gráfico<select value={chartType} onChange={(event) => setChartType(event.target.value)} className={`${inputClass} mt-1`}><option value="lines">Linhas</option><option value="bars">Barras</option></select></label>
              </div>
            </div>
            <button type="button" onClick={() => void generate()} disabled={loading} className="mt-7 rounded-full bg-[#2F5BFF] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Gerando..." : "gerar"}</button>
            {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
          </section>

          {data ? <section className="rounded-[28px] border border-[#ECE7DB] bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-[#171717]">{report.title}</h2><p className="text-sm text-[#8B8478]">{data.period.start} a {data.period.end} · {data.summary.count} registro(s)</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-full border border-[#E7DED0] px-4 py-2 text-sm"><FileSpreadsheet size={16} /> Exportar Excel</button><button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-full border border-[#E7DED0] px-4 py-2 text-sm"><Download size={16} /> Exportar PDF</button></div>
            </div>
            {data.columns.some((column) => column.key === "entradas") ? <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-emerald-50 p-4"><span className="text-xs text-emerald-700">Entradas</span><p className="font-semibold text-emerald-800">{money(data.summary.income)}</p></div><div className="rounded-xl bg-rose-50 p-4"><span className="text-xs text-rose-700">Saídas</span><p className="font-semibold text-rose-800">{money(data.summary.expense)}</p></div><div className="rounded-xl bg-slate-50 p-4"><span className="text-xs text-slate-600">Resultado</span><p className="font-semibold text-slate-900">{money(data.summary.result)}</p></div></div> : null}
            {visualization !== "table" && chart.length > 0 && hasChart ? <div className="mb-6 h-72 w-full" role="img" aria-label="Gráfico de entradas e saídas"><ResponsiveContainer width="100%" height="100%">{chartType === "bars" ? <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => money(Number(value))} /><Legend /><Bar dataKey="entradas" name="Entradas" fill="#059669" /><Bar dataKey="saidas" name="Saídas" fill="#e11d48" /></BarChart> : <LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => money(Number(value))} /><Legend /><Line type="monotone" dataKey="entradas" name="Entradas" stroke="#059669" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="saidas" name="Saídas" stroke="#e11d48" strokeWidth={2} dot={false} /></LineChart>}</ResponsiveContainer></div> : null}
            {visualization !== "chart" || !hasChart ? <div className="max-h-[640px] overflow-auto rounded-xl border border-[#E7DED0]"><table className="w-full min-w-[780px] text-left text-sm"><thead className="sticky top-0 bg-[#F8F6F2] text-[#6E675C]"><tr>{data.columns.map((column) => <th key={column.key} className={`px-3 py-3 font-semibold ${column.money ? "text-right" : ""}`}>{column.label}</th>)}</tr></thead><tbody>{data.rows.length ? data.rows.map((row, index) => <tr key={index} className="border-t border-[#EEE7D9]"><>{data.columns.map((column) => <td key={column.key} className={`px-3 py-2.5 ${column.money ? "text-right tabular-nums" : ""}`}>{column.money ? money(Number(row[column.key] || 0)) : String(row[column.key] ?? "")}</td>)}</></tr>) : <tr><td colSpan={data.columns.length} className="px-3 py-8 text-center text-[#8B8478]">Nenhum registro encontrado.</td></tr>}</tbody></table></div> : null}
          </section> : null}
        </>
      )}
    </div>
  );
}
