"use client";

import { useMemo, useState } from "react";

import ManagementModule, { ResourceRecord } from "@/components/modules/ManagementModule";
import SpreadsheetImportActions from "@/components/spreadsheets/SpreadsheetImportActions";

const scheduleTypes = [
  "EVENTO",
  "GIRA",
  "REUNIAO",
  "OBRIGACAO",
  "CURSO",
].map((value) => ({ label: value.replaceAll("_", " "), value }));

const scheduleStatus = ["AGENDADO", "FINALIZADO", "CANCELADO"].map((value) => ({
  label: value.replaceAll("_", " "),
  value,
}));

function formatDate(value: unknown) {
  if (typeof value !== "string") {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function text(value: unknown) {
  return typeof value === "string" ? value : "-";
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseAgendaDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function participants(record: ResourceRecord) {
  const attendances = Array.isArray(record.attendances) ? record.attendances : [];

  return attendances
    .map((item) => {
      if (!item || typeof item !== "object" || !("member" in item)) {
        return "";
      }

      const member = item.member;

      return member && typeof member === "object" && "nome" in member
        ? String(member.nome)
        : "";
    })
    .filter(Boolean)
    .join(", ");
}

export default function AgendaPage() {
  return (
    <ManagementModule
      title="Agenda"
      description="Eventos, giras, reuniões, obrigações e cursos."
      endpoint="/api/schedules"
      headerActions={<SpreadsheetImportActions resource="activities" />}
      initialValues={{ tipo: "EVENTO", status: "AGENDADO" }}
      fields={[
        { name: "titulo", label: "Título", required: true },
        { name: "descricao", label: "Descrição", type: "textarea" },
        { name: "tipo", label: "Categoria", type: "select", options: scheduleTypes, required: true },
        { name: "inicio", label: "Data do evento", type: "date", required: true },
        { name: "responsavel", label: "Responsável" },
        { name: "status", label: "Status", type: "select", options: scheduleStatus },
        { name: "observacoes", label: "Observações", type: "textarea" },
      ]}
      filters={[
        { name: "tipo", label: "Categoria", options: scheduleTypes },
        { name: "status", label: "Status", options: scheduleStatus },
      ]}
      columns={[
        { header: "Título", render: (record) => text(record.titulo) },
        { header: "Categoria", render: (record) => text(record.tipo) },
        { header: "Data do evento", render: (record) => formatDate(record.inicio) },
        { header: "Responsável", render: (record) => text(record.responsavel) },
        { header: "Participantes", render: participants },
        { header: "Status", render: (record) => text(record.status) },
      ]}
      actions={[
        {
          label: "Duplicar",
          icon: "copy",
          onClick: async (record) => {
            await fetch(`/api/schedules/${record.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "duplicate" }),
            });
            window.location.reload();
          },
        },
        {
          label: "Cancelar",
          icon: "cancel",
          onClick: async (record) => {
            await fetch(`/api/schedules/${record.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "cancel" }),
            });
            window.location.reload();
          },
        },
      ]}
      afterLoad={(records) => <AgendaSummary records={records} />}
      exportRows={(record) => ({
        Título: text(record.titulo),
        Descrição: text(record.descricao),
        Categoria: text(record.tipo),
        "Data do evento": formatDate(record.inicio),
        Responsável: text(record.responsavel),
        Status: text(record.status),
        Participantes: participants(record),
        Observações: text(record.observacoes),
      })}
      exportFileName="atividades.xlsx"
      enablePagination
      defaultPerPage={10}
    />
  );
}

function AgendaSummary({ records }: { records: ResourceRecord[] }) {
  const [selectedType, setSelectedType] = useState("TODOS");
  const [selectedStatus, setSelectedStatus] = useState("TODOS");
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const monthStart = useMemo(
    () => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1),
    [selectedMonth]
  );
  const calendarStart = useMemo(
    () => addDays(monthStart, -monthStart.getDay()),
    [monthStart]
  );
  const calendarDays = useMemo(
    () =>
      Array.from({ length: 42 }).map((_, index) =>
        addDays(calendarStart, index)
      ),
    [calendarStart]
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const typeMatches =
          selectedType === "TODOS" || record.tipo === selectedType;
        const statusMatches =
          selectedStatus === "TODOS" || record.status === selectedStatus;

        return typeMatches && statusMatches;
      }),
    [records, selectedStatus, selectedType]
  );

  const currentMonthRecords = useMemo(
    () =>
      filteredRecords.filter((record) => {
        const date = parseAgendaDate(record.inicio);
        return (
          date &&
          date.getMonth() === selectedMonth.getMonth() &&
          date.getFullYear() === selectedMonth.getFullYear()
        );
      }),
    [filteredRecords, selectedMonth]
  );

  const categoryCounts = useMemo(
    () =>
      scheduleTypes.map((type) => ({
        ...type,
        total: currentMonthRecords.filter((record) => record.tipo === type.value)
          .length,
      })),
    [currentMonthRecords]
  );

  const month = currentMonthRecords.length;
  const week = filteredRecords.filter((record) => {
    const date = parseAgendaDate(record.inicio);
    if (!date) return false;
    const diff =
      Math.abs(
        startOfDay(date).getTime() - today.getTime()
      ) / 86400000;
    return diff <= 7;
  }).length;
  const day = filteredRecords.filter((record) => {
    const date = parseAgendaDate(record.inicio);
    return date && isSameDay(date, today);
  }).length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
              Filtros do calendário
            </p>
            <h2 className="mt-2 text-[22px] font-bold text-slate-950">
              Consulte por tipo de compromisso
            </h2>
            <p className="mt-1 text-sm text-[#60708F]">
              Use para conferir quantas giras, cursos, aulas e eventos foram registrados.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-[#475569]">
              Categoria
              <select
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                className="min-w-[220px] rounded-2xl border border-[#DCE4F2] bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none"
              >
                <option value="TODOS">Todas</option>
                {scheduleTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold text-[#475569]">
              Status
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="min-w-[220px] rounded-2xl border border-[#DCE4F2] bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none"
              >
                <option value="TODOS">Todos</option>
                {scheduleStatus.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          ["Calendário mensal", month],
          ["Calendário semanal", week],
          ["Calendário diário", day],
        ].map(([label, value]) => (
          <section key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">{label}</p>
            <h2 className="mt-3 text-4xl font-bold text-slate-900">{value}</h2>
          </section>
        ))}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Resumo por categoria
          </p>
          <h2 className="text-[22px] font-bold text-slate-950">
            Compromissos no mês
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categoryCounts.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setSelectedType(type.value)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                selectedType === type.value
                  ? "border-[#2F5BFF] bg-[#EEF3FF]"
                  : "border-[#E4EAF3] bg-white hover:border-[#9BB4FF]"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#60708F]">
                {type.label}
              </p>
              <strong className="mt-2 block text-3xl font-bold text-slate-950">
                {type.total}
              </strong>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-[24px] font-bold text-slate-950">
            Calendário de Compromissos
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedMonth((current) => addMonths(current, -1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] bg-white text-lg font-bold text-slate-700 transition hover:border-[#2F5BFF] hover:text-[#2F5BFF]"
              aria-label="Mês anterior"
            >
              ‹
            </button>

            <span className="min-w-[150px] rounded-full bg-[#FFF6E3] px-4 py-2 text-center text-sm font-semibold capitalize text-[#B8860B]">
              {new Intl.DateTimeFormat("pt-BR", {
                month: "long",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
              }).format(selectedMonth)}
            </span>

            <input
              type="month"
              value={`${selectedMonth.getFullYear()}-${String(
                selectedMonth.getMonth() + 1
              ).padStart(2, "0")}`}
              onChange={(event) => {
                if (!event.target.value) {
                  return;
                }

                const [year, month] = event.target.value.split("-").map(Number);
                setSelectedMonth(new Date(year, month - 1, 1));
              }}
              className="h-10 rounded-full border border-[#E9E1D2] bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-[#2F5BFF] focus:border-[#2F5BFF]"
              aria-label="Selecionar mês"
            />

            <button
              type="button"
              onClick={() => setSelectedMonth((current) => addMonths(current, 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] bg-white text-lg font-bold text-slate-700 transition hover:border-[#2F5BFF] hover:text-[#2F5BFF]"
              aria-label="Próximo mês"
            >
              ›
            </button>

            <button
              type="button"
              onClick={() => setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#2F5BFF] hover:text-[#2F5BFF]"
            >
              Mês atual
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border border-slate-200 text-sm">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dayName) => (
            <div key={dayName} className="border-b border-r border-slate-200 bg-slate-50 px-3 py-3 font-bold text-slate-600 last:border-r-0">
              {dayName}
            </div>
          ))}
          {calendarDays.map((date, index) => {
            const items = filteredRecords.filter((record) => {
              const start = parseAgendaDate(record.inicio);
              return start ? isSameDay(start, date) : false;
            });
            const isCurrentMonth =
              date.getMonth() === selectedMonth.getMonth();
            const isToday = isSameDay(date, today);

            return (
              <div
                key={index}
                className={`min-h-[120px] border-r border-t border-slate-200 p-3 last:border-r-0 ${
                  !isCurrentMonth ? "bg-slate-50/70" : ""
                }`}
              >
                <p
                  className={`font-semibold ${
                    isToday
                      ? "text-[#B8860B]"
                      : isCurrentMonth
                      ? "text-slate-800"
                      : "text-slate-400"
                  }`}
                >
                  {date.getDate()}
                </p>
                <div className="mt-2 space-y-1">
                  {items.slice(0, 2).map((item) => (
                    <div key={String(item.id)} className="truncate rounded-lg bg-[#FFF6E3] px-2 py-1 text-xs font-semibold text-[#B8860B]">
                      {text(item.titulo)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </section>
    </div>
  );
}
