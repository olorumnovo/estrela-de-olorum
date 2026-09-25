"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Lock, LockOpen, Pencil, Printer, RefreshCw, Search, Trash2, X } from "lucide-react";

import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { nameMatchesSearchSuggestion, normalizeSearchText } from "@/lib/search";

type Option = {
  label: string;
  value: string;
};

export type FieldConfig = {
  name: string;
  label?: string;
  type?:
    | "text"
    | "number"
    | "datetime-local"
    | "date"
    | "month"
    | "textarea"
    | "select"
    | "multiselect"
    | "file"
    | "hidden";
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  accept?: string;
};

export type ColumnConfig = {
  header: string;
  render: (record: ResourceRecord) => ReactNode;
};

export type ResourceRecord = {
  id?: string;
  [key: string]: unknown;
};

type ActionConfig = {
  label: string;
  icon: "copy" | "cancel" | "print" | "open" | "close" | "check";
  onClick: (record: ResourceRecord) => void | Promise<void>;
};

type ManagementModuleProps = {
  title: string;
  description: string;
  endpoint: string;
  fields: FieldConfig[];
  columns: ColumnConfig[];
  filters?: FieldConfig[];
  initialValues?: Record<string, string | string[]>;
  actions?: ActionConfig[];
  afterLoad?: (records: ResourceRecord[]) => ReactNode;
  onDataLoaded?: (payload: unknown) => void;
  headerActions?: ReactNode;
  createLabel?: string;
  enablePagination?: boolean;
  defaultPerPage?: number;
  exportRows?: (record: ResourceRecord) => Record<string, string | number | boolean | Date | null | undefined>;
  exportFileName?: string;
};

type PaginatedResponse = {
  data: ResourceRecord[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
};

const iconMap = {
  copy: Copy,
  cancel: X,
  print: Printer,
  open: LockOpen,
  close: Lock,
  check: Check,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTimeLocal(value: Date) {
  return `${value.getFullYear()}-${pad(
    value.getMonth() + 1
  )}-${pad(value.getDate())}T${pad(
    value.getHours()
  )}:${pad(value.getMinutes())}`;
}

function valueToInput(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateTimeLocal(value);
  }

  if (typeof value === "string" && value.includes("T")) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value.slice(0, 16);
    }

    return formatDateTimeLocal(date);
  }

  return String(value);
}

function normalizeForm(fields: FieldConfig[], record?: ResourceRecord) {
  return fields.reduce<Record<string, string | string[]>>((acc, field) => {
    if (field.type === "multiselect") {
      acc[field.name] = [];
      return acc;
    }

    acc[field.name] = valueToInput(record?.[field.name]);
    return acc;
  }, {});
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function buildRequestUrl(endpoint: string, query: string) {
  const [path, existingQuery = ""] = endpoint.split("?");
  const params = new URLSearchParams(existingQuery);
  const dynamicParams = new URLSearchParams(query);

  dynamicParams.forEach((value, key) => {
    params.set(key, value);
  });

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

function buildPaginationItems(current: number, total: number) {
  if (total <= 1) {
    return [1];
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);

  for (let index = current - 2; index <= current + 2; index += 1) {
    if (index >= 1 && index <= total) {
      pages.add(index);
    }
  }

  return [...pages].sort((a, b) => a - b);
}

export default function ManagementModule({
  title,
  description,
  endpoint,
  fields,
  columns,
  filters = [],
  initialValues = {},
  actions = [],
  afterLoad,
  onDataLoaded,
  headerActions,
  createLabel = "Novo registro",
  enablePagination = false,
  defaultPerPage = 10,
  exportRows,
  exportFileName,
}: ManagementModuleProps) {
  const [records, setRecords] = useState<ResourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: defaultPerPage,
    total: 0,
    pages: 1,
  });
  const [editing, setEditing] = useState<ResourceRecord | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | string[]>>({
    ...normalizeForm(fields),
    ...initialValues,
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();

    if (search) {
      params.set("q", search);
    }

    Object.entries(filterValues).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    if (enablePagination) {
      params.set("page", String(page));
      params.set("perPage", String(perPage));
    }

    return params.toString();
  }, [enablePagination, filterValues, page, perPage, search]);

  const paginationItems = useMemo(
    () => buildPaginationItems(pagination.page, pagination.pages),
    [pagination.page, pagination.pages]
  );
  const visibleRecords = useMemo(() => {
    if (!enablePagination || records.length !== pagination.total) {
      return records;
    }

    return records.slice(
      (pagination.page - 1) * pagination.perPage,
      pagination.page * pagination.perPage
    );
  }, [enablePagination, pagination.page, pagination.perPage, pagination.total, records]);

  const searchSuggestions = useMemo(() => {
    const term = normalizeSearchText(search);

    if (term.length < 2) {
      return [];
    }

    return records
      .filter((record) => nameMatchesSearchSuggestion(suggestionLabel(record), term))
      .slice(0, 10);
  }, [records, search]);

  function suggestionLabel(record: ResourceRecord) {
    const preferred =
      record.nome ||
      record.name ||
      record.titulo ||
      record.descricao ||
      record.centroCusto ||
      record.documentNumber ||
      record.id;

    return String(preferred || "");
  }

  function selectSearchSuggestion(record: ResourceRecord) {
    const label = suggestionLabel(record);

    if (!label) {
      return;
    }

    setSearch(label);
    setSearchSuggestionIndex(0);
    setSearchSuggestionsOpen(false);

    if (enablePagination) {
      setPage(1);
    }
  }

  const applyResponse = useCallback((data: unknown) => {
    onDataLoaded?.(data);

    if (Array.isArray(data)) {
      const total = data.length;
      const pages = Math.max(Math.ceil(total / perPage), 1);
      const safePage = Math.min(page, pages);

      setRecords(data);
      setPagination({
        page: safePage,
        total: data.length,
        pages,
        perPage,
      });
      return;
    }

    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      Array.isArray((data as PaginatedResponse).data)
    ) {
      const payload = data as PaginatedResponse;
      setRecords(payload.data);
      setPagination({
        page: payload.pagination?.page || 1,
        perPage:
          payload.pagination?.perPage || defaultPerPage,
        total:
          payload.pagination?.total ||
          payload.data.length,
        pages: payload.pagination?.pages || 1,
      });
      return;
    }

    setRecords([]);
    setPagination((current) => ({
      ...current,
      total: 0,
      pages: 1,
    }));
  }, [enablePagination, onDataLoaded, page, perPage]);

  async function load() {
    setLoading(true);

    const response = await fetch(buildRequestUrl(endpoint, query));
    const data = await response.json();

    applyResponse(data);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      setLoading(true);

      const response = await fetch(buildRequestUrl(endpoint, query));
      const data = await response.json();

      if (active) {
        applyResponse(data);
        setLoading(false);
      }
    }

    void loadRecords();

    return () => {
      active = false;
    };
  }, [applyResponse, endpoint, query]);

  function startCreate() {
    setEditing(null);
    setForm({
      ...normalizeForm(fields),
      ...initialValues,
    });
    setIsFormOpen(true);
  }

  function startEdit(record: ResourceRecord) {
    setEditing(record);
    setForm({
      ...normalizeForm(fields),
      ...initialValues,
      ...normalizeForm(fields, record),
      ...fields.reduce<Record<string, string | string[]>>((acc, field) => {
        const value = record[field.name];

        if (field.type === "multiselect" && Array.isArray(value)) {
          acc[field.name] = value.filter((item): item is string => typeof item === "string");
        }

        return acc;
      }, {}),
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditing(null);
    setForm({
      ...normalizeForm(fields),
      ...initialValues,
    });
    setIsFormOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch(editing?.id ? `${endpoint}/${editing.id}` : endpoint, {
      method: editing?.id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || "Não foi possível salvar.");
      return;
    }

    closeForm();
    await load();
  }

  async function remove(record: ResourceRecord) {
    if (!record.id || !window.confirm("Deseja excluir este registro?")) {
      return;
    }

    await fetch(`${endpoint}/${record.id}`, {
      method: "DELETE",
    });

    await load();
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#EEE7D9] pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
              <span>início</span>
              <span>—</span>
              <span className="font-medium text-[#191919]">{title.toLowerCase()}</span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">{title}</h1>
            <p className="text-sm text-[#7A746A]">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {headerActions}

            {exportRows && (
              <button
                type="button"
                onClick={() => exportRowsToXlsx(records.map(exportRows), exportFileName || `${title.toLowerCase()}.xlsx`, title)}
                disabled={loading || records.length === 0}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm font-medium text-[#1D1B18] disabled:opacity-50"
              >
                <Download size={17} />
                Exportar planilha
              </button>
            )}

            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Check size={18} />
              {createLabel}
            </button>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
            >
              <RefreshCw size={18} />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      {afterLoad?.(records)}

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[#EEE7D9] px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                Registros
              </p>
              <h2 className="mt-2 text-[22px] font-bold text-slate-900">Histórico</h2>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
              <div className="relative">
                <label className="flex items-center gap-2 rounded-2xl border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#7A746A]">
                  <Search size={18} />
                  <input
                    value={search}
                    onFocus={() => setSearchSuggestionsOpen(true)}
                    onBlur={() => setSearchSuggestionsOpen(false)}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setSearchSuggestionIndex(0);
                      setSearchSuggestionsOpen(true);
                      if (enablePagination) {
                        setPage(1);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!searchSuggestions.length) {
                        return;
                      }

                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setSearchSuggestionIndex((current) =>
                          Math.min(current + 1, searchSuggestions.length - 1)
                        );
                      }

                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setSearchSuggestionIndex((current) => Math.max(current - 1, 0));
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        const selected = searchSuggestions[searchSuggestionIndex];

                        if (selected) {
                          selectSearchSuggestion(selected);
                        }
                      }
                    }}
                    placeholder="Pesquisar"
                    className="w-full bg-transparent outline-none"
                  />
                </label>

                {searchSuggestionsOpen && searchSuggestions.length > 0 && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-40 max-h-72 w-full min-w-72 overflow-y-auto rounded-2xl border border-[#E9E1D2] bg-white p-2 shadow-xl">
                    {searchSuggestions.map((record, index) => (
                      <button
                        key={record.id || `${suggestionLabel(record)}-${index}`}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectSearchSuggestion(record);
                        }}
                        className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                          index === searchSuggestionIndex
                            ? "bg-[#EEF4FF] text-[#1D3E92]"
                            : "text-[#1D1B18] hover:bg-[#F7F4EE]"
                        }`}
                      >
                        {suggestionLabel(record)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filters.map((filter) =>
                filter.type === "date" || filter.type === "month" ? (
                  <input
                    key={filter.name}
                    type={filter.type}
                    value={filterValues[filter.name] || ""}
                    onChange={(event) => {
                      setFilterValues((current) => ({
                        ...current,
                        [filter.name]: event.target.value,
                      }));
                      if (enablePagination) {
                        setPage(1);
                      }
                    }}
                    className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#1D1B18] outline-none"
                  />
                ) : (
                  <select
                    key={filter.name}
                    value={filterValues[filter.name] || ""}
                    onChange={(event) =>
                      {
                        setFilterValues((current) => ({
                          ...current,
                          [filter.name]: event.target.value,
                        }));
                        if (enablePagination) {
                          setPage(1);
                        }
                      }
                    }
                    className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#1D1B18] outline-none"
                  >
                    <option value="">Todos</option>
                    {filter.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )
              )}

              {enablePagination && (
                <select
                  value={perPage}
                  onChange={(event) => {
                    setPerPage(
                      Number(event.target.value)
                    );
                    setPage(1);
                  }}
                  className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#1D1B18] outline-none"
                >
                  {[10, 20, 50, 100].map((value) => (
                    <option key={value} value={value}>
                      {value}/pagina
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-[#7A746A]">
                <tr>
                  {columns.map((column) => (
                    <th key={column.header} className="border-b border-[#EEE7D9] px-6 py-4 font-bold">
                      {column.header}
                    </th>
                  ))}
                  <th className="border-b border-[#EEE7D9] px-6 py-4 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-8 text-center text-[#8B8478]">
                      Carregando...
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-6 py-8 text-center text-[#8B8478]">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  visibleRecords.map((record) => (
                    <tr key={record.id || JSON.stringify(record)} className="border-b border-[#F0E9DC] text-[15px] text-[#171717] last:border-none">
                      {columns.map((column) => (
                        <td key={column.header} className="px-6 py-4">
                          {column.render(record)}
                        </td>
                      ))}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(record)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E1D2] text-slate-600"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          {actions.map((action) => {
                            const Icon = iconMap[action.icon];

                            return (
                              <button
                                key={action.label}
                                type="button"
                                onClick={() => void action.onClick(record)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E1D2] text-slate-600"
                                title={action.label}
                              >
                                <Icon size={16} />
                              </button>
                            );
                          })}
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

          {enablePagination && (
            <div className="flex flex-col gap-4 border-t border-[#EEE7D9] px-6 py-4 text-sm text-[#9B9488] md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span>quantidade: {pagination.total}</span>
                <span>página {pagination.page} de {pagination.pages}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((current) => current - 1)
                  }
                  className="rounded-full border border-[#E9E1D2] px-4 py-2 disabled:opacity-50"
                >
                  Anterior
                </button>

                {paginationItems.map((pageNumber, index) => {
                  const previous = paginationItems[index - 1];
                  const showGap = previous && pageNumber - previous > 1;

                  return (
                    <div key={pageNumber} className="flex items-center gap-2">
                      {showGap ? <span className="px-1 text-slate-400">...</span> : null}
                      <button
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={
                          pageNumber === pagination.page
                            ? "rounded-full bg-[#171717] px-3 py-2 font-semibold text-white"
                            : "rounded-full border border-[#E9E1D2] px-3 py-2 text-slate-600"
                        }
                      >
                        {pageNumber}
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() =>
                    setPage((current) => current + 1)
                  }
                  className="rounded-full border border-[#E9E1D2] px-4 py-2 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </section>
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Cadastro
                </p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                  {editing ? "Editar registro" : createLabel}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submit} className="max-h-[calc(90vh-88px)] overflow-y-auto p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {fields.map((field) =>
                  field.type === "hidden" ? (
                    <FieldInput key={field.name} field={field} form={form} setForm={setForm} />
                  ) : (
                    <label key={field.name} className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">{field.label}</span>
                      <FieldInput field={field} form={form} setForm={setForm} />
                    </label>
                  )
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white shadow-sm"
                >
                  <Check size={18} />
                  Salvar
                </button>

                <button
                  type="button"
                  onClick={closeForm}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  <X size={18} />
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function FieldInput({
  field,
  form,
  setForm,
}: {
  field: FieldConfig;
  form: Record<string, string | string[]>;
  setForm: (value: React.SetStateAction<Record<string, string | string[]>>) => void;
}) {
  const baseClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-[#C6921E]";
  const value = form[field.name] || "";

  if (field.type === "hidden") {
    return (
      <input
        type="hidden"
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          setForm((current) => ({ ...current, [field.name]: event.target.value }))
        }
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        required={field.required}
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          setForm((current) => ({ ...current, [field.name]: event.target.value }))
        }
        placeholder={field.placeholder}
        className={`${baseClass} min-h-28`}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        required={field.required}
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          setForm((current) => ({ ...current, [field.name]: event.target.value }))
        }
        className={baseClass}
      >
        <option value="">Selecione</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multiselect") {
    return (
      <select
        multiple
        value={Array.isArray(value) ? value : []}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [field.name]: Array.from(event.target.selectedOptions).map((option) => option.value),
          }))
        }
        className={`${baseClass} min-h-28`}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "file") {
    const preview = typeof value === "string" && value ? value : "";

    return (
      <div className="space-y-3">
        {preview && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt=""
              className="h-14 w-14 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({ ...current, [field.name]: "" }))
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            >
              Remover imagem
            </button>
          </div>
        )}

        <input
          required={field.required && !preview}
          type="file"
          accept={field.accept || "image/png,image/jpeg,image/webp"}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (!file) {
              return;
            }

            void fileToDataUrl(file)
              .then((dataUrl) =>
                setForm((current) => ({ ...current, [field.name]: dataUrl }))
              )
              .catch((error: Error) => window.alert(error.message));
          }}
          className={baseClass}
        />
      </div>
    );
  }

  return (
    <input
      required={field.required}
      type={field.type || "text"}
      value={typeof value === "string" ? value : ""}
      onChange={(event) =>
        setForm((current) => ({ ...current, [field.name]: event.target.value }))
      }
      placeholder={field.placeholder}
      className={baseClass}
    />
  );
}
