"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  Filter,
  MoreHorizontal,
  Printer,
  Search,
  SlidersHorizontal,
  Trash2,
  UserX,
  UserPlus,
} from "lucide-react";

import FloatingDraggablePopover from "@/components/ui/floating-draggable-popover";
import SpreadsheetImportActions from "@/components/spreadsheets/SpreadsheetImportActions";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { nameMatchesSearchSuggestion, normalizeSearchText } from "@/lib/search";

type CadastroRecord = {
  id: string;
  code: string;
  name: string;
  cpfCnpj: string;
  city: string;
  contact: string;
  email: string;
  status: string;
  birthDate?: string;
  createdAt?: string;
  tags: string[];
};

type SortOption =
  | "nome-asc"
  | "nome-desc"
  | "cidade-asc"
  | "cidade-desc"
  | "data-desc"
  | "data-asc";

type Props = {
  records: CadastroRecord[];
  initialStatus?: string;
  initialBirthdayMonth?: boolean;
};

const PRIMARY_CATEGORY_KEYS = [
  "todos",
  "cliente",
  "fornecedor",
  "transportador",
  "batizado",
  "curso de atabaque a",
  "curso de curimba",
];

function normalize(value: string) {
  return normalizeSearchText(value);
}

function formatCount(value: number) {
  return String(value).padStart(2, "0");
}

function formatLabel(value: string) {
  return value
    .split(" ")
    .map((part) =>
      part.length <= 2 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function birthMonthDay(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const brazilianMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (brazilianMatch) {
    return {
      month: Number(brazilianMatch[2]),
      day: Number(brazilianMatch[1]),
    };
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return {
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function monthDayKey(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/);

  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

function formatBirthDate(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "-";
  }

  const brazilianMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (brazilianMatch) {
    return `${brazilianMatch[1].padStart(2, "0")}/${brazilianMatch[2].padStart(2, "0")}/${brazilianMatch[3]}`;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed);
}

function isInactiveStatus(value: string) {
  return normalize(value) === "inativo";
}

export default function CadastrosUnifiedView({
  records,
  initialStatus = "ativo",
  initialBirthdayMonth = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showTopMore, setShowTopMore] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showTableSortMenu, setShowTableSortMenu] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showFiltersMenu, setShowFiltersMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [openActionsAnchorRect, setOpenActionsAnchorRect] = useState<DOMRect | null>(null);
  const [popoverAnchorRects, setPopoverAnchorRects] = useState<Record<string, DOMRect | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [sortBy, setSortBy] = useState<SortOption>("nome-asc");
  const [cityFilter, setCityFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("todos");
  const [birthdayMonthOnly, setBirthdayMonthOnly] = useState(initialBirthdayMonth);
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState(() => String(new Date().getMonth() + 1));
  const [birthdayStartDate, setBirthdayStartDate] = useState("");
  const [birthdayEndDate, setBirthdayEndDate] = useState("");
  const perPage = 10;
  const selectedCategory = normalize(searchParams.get("categoria") || "todos");

  const birthdayScopedRecords = useMemo(() => {
    if (!birthdayMonthOnly) {
      return records;
    }

    const startKey = monthDayKey(birthdayStartDate);
    const endKey = monthDayKey(birthdayEndDate);

    return records.filter((record) => {
      const birthday = birthMonthDay(record.birthDate);

      if (!birthday) {
        return false;
      }

      const birthdayKey = birthday.month * 100 + birthday.day;

      if (startKey !== null || endKey !== null) {
        if (startKey !== null && endKey !== null) {
          return startKey <= endKey
            ? birthdayKey >= startKey && birthdayKey <= endKey
            : birthdayKey >= startKey || birthdayKey <= endKey;
        }

        return birthdayKey === (startKey ?? endKey);
      }

      return birthdayMonthFilter === "todos" || birthday.month === Number(birthdayMonthFilter);
    });
  }, [birthdayEndDate, birthdayMonthFilter, birthdayMonthOnly, birthdayStartDate, records]);

  const statusScopedRecords = useMemo(() => {
    if (statusFilter === "todos") {
      return birthdayScopedRecords;
    }

    return birthdayScopedRecords.filter(
      (record) => normalize(record.status) === statusFilter
    );
  }, [birthdayScopedRecords, statusFilter]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const record of statusScopedRecords) {
      for (const tag of record.tags) {
        const normalized = normalize(tag);
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    const options = PRIMARY_CATEGORY_KEYS.map((key) => ({
      key,
      label: key,
      count: key === "todos" ? statusScopedRecords.length : counts.get(key) || 0,
    }));

    const moreOptions = [...counts.entries()]
      .filter(([key]) => !PRIMARY_CATEGORY_KEYS.includes(key))
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }

        return left[0].localeCompare(right[0], "pt-BR");
      })
      .map(([key, count]) => ({
        key,
        label: key,
        count,
      }));

    return {
      primary: options,
      more: moreOptions,
    };
  }, [statusScopedRecords]);

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(statusScopedRecords.map((record) => record.city).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [statusScopedRecords]);

  const filteredRecords = useMemo(() => {
    const term = normalize(search);
    const filtered = statusScopedRecords.filter((record) => {
      const matchesSearch =
        !term ||
        [
          record.name,
          record.code,
          record.email,
          record.cpfCnpj,
          record.city,
          record.contact,
        ].some((value) => normalize(value).includes(term));

      const matchesCategory =
        selectedCategory === "todos"
          ? true
          : record.tags.some((tag) => normalize(tag) === selectedCategory);

      const matchesCity =
        !cityFilter || normalize(record.city) === normalize(cityFilter);

      const matchesContact =
        contactFilter === "todos"
          ? true
          : contactFilter === "com-email"
            ? Boolean(record.email)
            : contactFilter === "com-telefone"
              ? Boolean(record.contact)
              : contactFilter === "completo"
                ? Boolean(record.email) && Boolean(record.contact)
                : true;

      return matchesSearch && matchesCategory && matchesCity && matchesContact;
    });

    const sorted = [...filtered];

    sorted.sort((left, right) => {
      if (sortBy === "nome-desc") {
        return right.name.localeCompare(left.name, "pt-BR");
      }

      if (sortBy === "cidade-asc") {
        return left.city.localeCompare(right.city, "pt-BR");
      }

      if (sortBy === "cidade-desc") {
        return right.city.localeCompare(left.city, "pt-BR");
      }

      if (sortBy === "data-desc" || sortBy === "data-asc") {
        const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        const difference =
          sortBy === "data-desc" ? rightDate - leftDate : leftDate - rightDate;

        return difference || left.name.localeCompare(right.name, "pt-BR");
      }

      return left.name.localeCompare(right.name, "pt-BR");
    });

    return sorted;
  }, [statusScopedRecords, search, selectedCategory, cityFilter, contactFilter, sortBy]);

  const totalPages = Math.max(Math.ceil(filteredRecords.length / perPage), 1);
  const searchSuggestions = useMemo(() => {
    const term = normalize(search);

    if (term.length < 2) {
      return [];
    }

    return statusScopedRecords
      .filter((record) => nameMatchesSearchSuggestion(record.name, term))
      .slice(0, 10);
  }, [search, statusScopedRecords]);
  const paginatedRecords = filteredRecords.slice(
    (page - 1) * perPage,
    page * perPage
  );
  const selectedRecords = useMemo(
    () => filteredRecords.filter((record) => selectedIds.has(record.id)),
    [filteredRecords, selectedIds]
  );
  const selectedRecordsAreInactive =
    selectedRecords.length > 0 && selectedRecords.every((record) => isInactiveStatus(record.status));

  function toggleRecordSelection(recordId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(recordId);
      } else {
        next.delete(recordId);
      }

      return next;
    });
  }

  function changeCategory(nextCategory: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextCategory === "todos") {
      params.delete("categoria");
    } else {
      params.set("categoria", nextCategory);
    }

    router.replace(
      params.size ? `${pathname}?${params.toString()}` : pathname,
      { scroll: false }
    );
    setShowMore(false);
    setPage(1);
  }

  function applyStatusFilter(nextStatus: string) {
    if (nextStatus === "inativo") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("categoria");
      router.replace(
        params.size ? `${pathname}?${params.toString()}` : pathname,
        { scroll: false }
      );
    }

    setStatusFilter(nextStatus);
    setShowStatusMenu(false);
    setPage(1);
  }

  function rememberPopoverAnchor(key: string, element: HTMLElement) {
    setPopoverAnchorRects((current) => ({
      ...current,
      [key]: element.getBoundingClientRect(),
    }));
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-cadastros-popover="true"]')) {
        return;
      }

      setOpenActionsId(null);
      setOpenActionsAnchorRect(null);
      setPopoverAnchorRects({});
      setShowMore(false);
      setShowTopMore(false);
      setShowStatusMenu(false);
      setShowSortMenu(false);
      setShowTableSortMenu(false);
      setShowDateMenu(false);
      setShowFiltersMenu(false);
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function clearTopFilters() {
    setStatusFilter("ativo");
    setCityFilter("");
    setContactFilter("todos");
    setSortBy("nome-asc");
    setBirthdayMonthOnly(false);
    setBirthdayMonthFilter(String(new Date().getMonth() + 1));
    setBirthdayStartDate("");
    setBirthdayEndDate("");
    setPage(1);
  }

  function exportCurrentList() {
    const identityColumn = birthdayMonthOnly ? "Data de nascimento" : "CPF/CNPJ";

    exportRowsToXlsx(
      filteredRecords.map((record) => ({
        Código: record.code,
        Nome: record.name,
        [identityColumn]: birthdayMonthOnly ? formatBirthDate(record.birthDate) : record.cpfCnpj,
        Cidade: record.city,
        "E-mail": record.email,
        Contato: record.contact,
        Situação: record.status,
        Classificações: record.tags.join(" | "),
      })),
      birthdayMonthOnly ? "aniversariantes-do-mes.xlsx" : "membros.xlsx",
      birthdayMonthOnly ? "Aniversariantes" : "Membros"
    );
  }

  function printCurrentList() {
    const selectedCategoryOriginalLabel = statusScopedRecords
      .flatMap((record) => record.tags)
      .find((tag) => normalize(tag) === selectedCategory);
    const categoryLabel =
      selectedCategory === "todos"
        ? "Todas as categorias"
        : formatLabel(selectedCategoryOriginalLabel || selectedCategory);
    const title = birthdayMonthOnly
      ? "Aniversariantes do Mês"
      : selectedCategory === "todos"
        ? "Membros"
        : categoryLabel;
    const statusLabel =
      statusFilter === "todos"
        ? "Todos"
        : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1);
    const identityColumn = birthdayMonthOnly ? "Data de nascimento" : "CPF/CNPJ";
    const rows = filteredRecords
      .map(
        (record) => `
          <tr>
            <td>${escapeHtml(record.name)}</td>
            <td>${escapeHtml(birthdayMonthOnly ? formatBirthDate(record.birthDate) : record.cpfCnpj || "-")}</td>
            <td>${escapeHtml(record.city || "-")}</td>
            <td>${escapeHtml(record.contact || "-")}</td>
            <td>${escapeHtml(record.email || "-")}</td>
            <td>${escapeHtml(record.status || "-")}</td>
            <td>${escapeHtml(record.tags.join(" | ") || "-")}</td>
          </tr>
        `
      )
      .join("");

    openPrintableWindow(
      title,
      `
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">Categoria: ${escapeHtml(categoryLabel)}</p>
        <p class="muted">Filtro de situação: ${escapeHtml(statusLabel)}</p>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>${escapeHtml(identityColumn)}</th>
              <th>Cidade</th>
              <th>Contato</th>
              <th>E-mail</th>
              <th>Situação</th>
              <th>Classificações</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="7" class="muted">Nenhum cadastro encontrado.</td></tr>`}
          </tbody>
        </table>
      `
    );
  }

  function copyEmails() {
    const emails = filteredRecords
      .map((record) => record.email)
      .filter(Boolean)
      .join("; ");

    if (!emails) {
      window.alert("Nenhum e-mail disponível nos registros filtrados.");
      return;
    }

    navigator.clipboard
      .writeText(emails)
      .then(() => window.alert("Lista de e-mails copiada."))
      .catch(() => window.alert(emails));
  }

  function openPrintableWindow(title: string, content: string) {
    const popup = window.open("", "_blank", "width=980,height=720");
    const logoUrl = `${window.location.origin}/logo.png`;

    if (!popup) {
      window.alert("Não foi possível abrir a nova janela. Verifique o bloqueador de pop-up.");
      return;
    }

    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 32px; }
            .print-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
            .print-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 12px; }
            .brand { color: #666; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
            h1 { font-size: 28px; margin-bottom: 8px; }
            h2 { font-size: 18px; margin: 24px 0 8px; }
            p { line-height: 1.6; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 12px; }
            th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; vertical-align: top; }
            th { color: #555; font-weight: 700; }
            .muted { color: #666; }
            .box { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-top: 16px; }
            .tag { display: inline-block; border: 1px solid #ddd; border-radius: 999px; padding: 4px 10px; margin: 4px 6px 0 0; font-size: 12px; }
            .footer { margin-top: 32px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img class="print-logo" src="${escapeHtml(logoUrl)}" alt="Estrela de Olorum" />
            <div>
              <div class="brand">Estrela de Olorum</div>
              <div class="muted">Relatório de impressão</div>
            </div>
          </div>
          ${content}
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    popup.setTimeout(() => {
      const images = Array.from(popup.document.images);
      if (!images.length || images.every((image) => image.complete)) {
        popup.print();
        return;
      }

      let pending = images.length;
      const finish = () => {
        pending -= 1;
        if (pending <= 0) popup.print();
      };

      images.forEach((image) => {
        if (image.complete) {
          finish();
          return;
        }
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });
      popup.setTimeout(() => popup.print(), 1200);
    }, 300);
  }

  function buildRecordSummary(record: CadastroRecord) {
    return `
      <div class="box">
        <p><strong>Nome:</strong> ${record.name}</p>
        <p><strong>Código:</strong> ${record.code || "-"}</p>
        <p><strong>CPF/CNPJ:</strong> ${record.cpfCnpj || "-"}</p>
        <p><strong>Cidade:</strong> ${record.city || "-"}</p>
        <p><strong>E-mail:</strong> ${record.email || "-"}</p>
        <p><strong>Contato:</strong> ${record.contact || "-"}</p>
        <p><strong>Situação:</strong> ${record.status || "-"}</p>
        <p><strong>Classificações:</strong></p>
        <div>${record.tags.length ? record.tags.map((tag) => `<span class="tag">${tag}</span>`).join("") : "<span class=\"muted\">Sem classificação</span>"}</div>
      </div>
    `;
  }

  async function handleDeactivateRecord(record: CadastroRecord) {
    if (!window.confirm(`Deseja realmente inativar o cadastro de ${record.name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/members/${record.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "INACTIVE",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível inativar o cadastro.");
      }

      window.alert("Cadastro inativado com sucesso.");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível inativar o cadastro.");
    }
  }

  async function handleActivateRecord(record: CadastroRecord) {
    if (!window.confirm(`Deseja realmente ativar o cadastro de ${record.name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/members/${record.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "ACTIVE",
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível ativar o cadastro.");
      }

      window.alert("Cadastro ativado com sucesso.");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível ativar o cadastro.");
    }
  }

  async function handleDeactivateSelectedRecords(recordsToDeactivate: CadastroRecord[]) {
    if (!recordsToDeactivate.length) {
      return;
    }

    const label =
      recordsToDeactivate.length === 1
        ? recordsToDeactivate[0].name
        : `${recordsToDeactivate.length} cadastros selecionados`;

    if (!window.confirm(`Deseja realmente inativar ${label}?`)) {
      return;
    }

    try {
      const results = await Promise.all(
        recordsToDeactivate.map(async (record) => {
          const response = await fetch(`/api/members/${record.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "INACTIVE",
            }),
          });
          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              data?.message || data?.error || `Não foi possível inativar ${record.name}.`
            );
          }

          return record.id;
        })
      );

      setSelectedIds((current) => {
        const next = new Set(current);
        results.forEach((id) => next.delete(id));
        return next;
      });
      window.alert(
        recordsToDeactivate.length === 1
          ? "Cadastro inativado com sucesso."
          : "Cadastros inativados com sucesso."
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível inativar os cadastros.");
    }
  }

  async function handleActivateSelectedRecords(recordsToActivate: CadastroRecord[]) {
    if (!recordsToActivate.length) {
      return;
    }

    const label =
      recordsToActivate.length === 1
        ? recordsToActivate[0].name
        : `${recordsToActivate.length} cadastros selecionados`;

    if (!window.confirm(`Deseja realmente ativar ${label}?`)) {
      return;
    }

    try {
      const results = await Promise.all(
        recordsToActivate.map(async (record) => {
          const response = await fetch(`/api/members/${record.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: "ACTIVE",
            }),
          });
          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              data?.message || data?.error || `Não foi possível ativar ${record.name}.`
            );
          }

          return record.id;
        })
      );

      setSelectedIds((current) => {
        const next = new Set(current);
        results.forEach((id) => next.delete(id));
        return next;
      });
      window.alert(
        recordsToActivate.length === 1
          ? "Cadastro ativado com sucesso."
          : "Cadastros ativados com sucesso."
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível ativar os cadastros.");
    }
  }

  async function handleDeleteRecord(record: CadastroRecord) {
    if (
      !window.confirm(
        `Deseja realmente excluir o cadastro de ${record.name}? Essa ação remove o cadastro da listagem.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/members/${record.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Não foi possível excluir o cadastro.");
      }

      window.alert("Cadastro excluído com sucesso.");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir o cadastro.");
    }
  }

  async function handleDeleteSelectedRecords(recordsToDelete: CadastroRecord[]) {
    if (!recordsToDelete.length) {
      return;
    }

    const label =
      recordsToDelete.length === 1
        ? recordsToDelete[0].name
        : `${recordsToDelete.length} cadastros selecionados`;

    if (
      !window.confirm(
        `Deseja realmente excluir ${label}? Essa ação remove da listagem.`
      )
    ) {
      return;
    }

    try {
      const results = await Promise.all(
        recordsToDelete.map(async (record) => {
          const response = await fetch(`/api/members/${record.id}`, {
            method: "DELETE",
          });
          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(data?.message || data?.error || `Não foi possível excluir ${record.name}.`);
          }

          return record.id;
        })
      );

      setSelectedIds((current) => {
        const next = new Set(current);
        results.forEach((id) => next.delete(id));
        return next;
      });
      window.alert(
        recordsToDelete.length === 1
          ? "Cadastro excluído com sucesso."
          : "Cadastros excluídos com sucesso."
      );
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível excluir os cadastros.");
    }
  }

  function handlePrintRecord(record: CadastroRecord) {
    const popup = window.open("", "_blank", "width=980,height=720");
    const logoUrl = `${window.location.origin}/logo.png`;

    if (!popup) {
      window.alert("Não foi possível abrir a nova janela. Verifique o bloqueador de pop-up.");
      return;
    }

    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Ficha Cadastral - ${record.name}</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 32px; }
            .print-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
            .print-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 12px; }
            .brand { color: #666; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
            h1 { font-size: 28px; margin-bottom: 16px; }
            .item { margin: 10px 0; }
            .label { color: #6b7280; font-size: 13px; margin-bottom: 4px; }
            .value { font-size: 16px; }
            .tag { display: inline-block; border: 1px solid #ddd; border-radius: 999px; padding: 4px 10px; margin: 4px 6px 0 0; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img class="print-logo" src="${escapeHtml(logoUrl)}" alt="Estrela de Olorum" />
            <div>
              <div class="brand">Estrela de Olorum</div>
              <div>Ficha cadastral</div>
            </div>
          </div>
          <h1>Ficha Cadastral</h1>
          <div class="item"><div class="label">Nome</div><div class="value">${record.name}</div></div>
          <div class="item"><div class="label">Código</div><div class="value">${record.code || "-"}</div></div>
          <div class="item"><div class="label">CPF/CNPJ</div><div class="value">${record.cpfCnpj || "-"}</div></div>
          <div class="item"><div class="label">Cidade</div><div class="value">${record.city || "-"}</div></div>
          <div class="item"><div class="label">E-mail</div><div class="value">${record.email || "-"}</div></div>
          <div class="item"><div class="label">Contato</div><div class="value">${record.contact || "-"}</div></div>
          <div class="item"><div class="label">Situação</div><div class="value">${record.status || "-"}</div></div>
          <div class="item"><div class="label">Classificações</div><div class="value">${record.tags.length ? record.tags.map((tag) => `<span class="tag">${tag}</span>`).join("") : "-"}</div></div>
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    popup.setTimeout(() => {
      const images = Array.from(popup.document.images);
      if (!images.length || images.every((image) => image.complete)) {
        popup.print();
        return;
      }

      let pending = images.length;
      const finish = () => {
        pending -= 1;
        if (pending <= 0) popup.print();
      };

      images.forEach((image) => {
        if (image.complete) {
          finish();
          return;
        }
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });
      popup.setTimeout(() => popup.print(), 1200);
    }, 300);
  }

  function handlePrintSelectedRecords(recordsToPrint: CadastroRecord[]) {
    if (!recordsToPrint.length) {
      return;
    }

    const popup = window.open("", "_blank", "width=980,height=720");
    const logoUrl = `${window.location.origin}/logo.png`;

    if (!popup) {
      window.alert("Não foi possível abrir a nova janela. Verifique o bloqueador de pop-up.");
      return;
    }

    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Fichas Cadastrais</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 32px; }
            .print-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
            .print-logo { width: 58px; height: 58px; object-fit: contain; border-radius: 12px; }
            .brand { color: #666; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
            h1 { font-size: 28px; margin-bottom: 16px; }
            h2 { border-top: 1px solid #ddd; margin-top: 28px; padding-top: 20px; }
            .item { margin: 10px 0; }
            .label { color: #6b7280; font-size: 13px; margin-bottom: 4px; }
            .value { font-size: 16px; }
            .tag { display: inline-block; border: 1px solid #ddd; border-radius: 999px; padding: 4px 10px; margin: 4px 6px 0 0; font-size: 12px; }
            @media print { h2 { break-before: page; } h2:first-of-type { break-before: auto; } }
          </style>
        </head>
        <body>
          <div class="print-header">
            <img class="print-logo" src="${escapeHtml(logoUrl)}" alt="Estrela de Olorum" />
            <div>
              <div class="brand">Estrela de Olorum</div>
              <div>Ficha cadastral</div>
            </div>
          </div>
          <h1>Fichas Cadastrais</h1>
          ${recordsToPrint
            .map((record) => `<h2>${escapeHtml(record.name)}</h2>${buildRecordSummary(record)}`)
            .join("")}
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
    popup.setTimeout(() => popup.print(), 500);
  }

  return (
    <main className="min-h-[calc(100vh-116px)] bg-[#F8F8F7] px-5 py-6 text-[#171717] sm:px-6 lg:px-8">
      <section className="rounded-[10px] border border-[#ECE7DB] bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-6 py-5 lg:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
                <span>início</span>
                <span>=</span>
                <span>cadastros</span>
                <span className="font-medium text-[#191919]">membros</span>
              </div>
              <h1 className="mt-3 text-[22px] font-semibold text-[#171717]">
                {birthdayMonthOnly ? "Aniversariantes do Mês" : "Membros"}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!birthdayMonthOnly && <SpreadsheetImportActions resource="members" />}
              <button type="button" onClick={exportCurrentList} className="inline-flex h-10 items-center rounded-full border border-[#E4D8C2] px-4 text-sm font-medium text-[#171717]">Exportar planilha</button>
              <button
                type="button"
                onClick={printCurrentList}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E4D8C2] px-4 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
              >
                <Printer size={16} />
                imprimir
              </button>
              <Link
                href="/dashboard/membros/novo"
                className="inline-flex h-10 items-center rounded-full bg-[#2F5BFF] px-5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(47,91,255,0.24)]"
              >
                incluir cadastro
              </Link>
              <div data-cadastros-popover="true" className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    rememberPopoverAnchor("topMore", event.currentTarget);
                    setShowTopMore((current) => !current);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E4D8C2] px-4 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
                >
                  mais ações
                  <MoreHorizontal size={16} />
                </button>

                {showTopMore && (
                  <FloatingDraggablePopover
                    anchorRect={popoverAnchorRects.topMore || null}
                    onClose={() => setShowTopMore(false)}
                    placement="bottom-end"
                    width={280}
                    className="w-[280px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-xl"
                  >
                    {selectedRecords.length ? (
                      <>
                        <div className="px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[#B98812]">
                          {selectedRecords.length} selecionado(s)
                        </div>
                        {[
                          {
                            label: selectedRecordsAreInactive ? "ativar cadastro" : "inativar cadastro",
                            icon: selectedRecordsAreInactive ? UserPlus : UserX,
                            action: () =>
                              selectedRecordsAreInactive
                                ? void handleActivateSelectedRecords(selectedRecords)
                                : void handleDeactivateSelectedRecords(selectedRecords),
                          },
                          {
                            label: "excluir cadastro",
                            icon: Trash2,
                            action: () => void handleDeleteSelectedRecords(selectedRecords),
                            danger: true,
                          },
                          {
                            label:
                              selectedRecords.length === 1
                                ? "imprimir ficha cadastral"
                                : "imprimir fichas cadastrais",
                            icon: Printer,
                            action: () => handlePrintSelectedRecords(selectedRecords),
                          },
                        ].map((item) => {
                          const Icon = item.icon;

                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                item.action();
                                setShowTopMore(false);
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                            >
                              <Icon
                                size={16}
                                className={item.danger ? "text-red-500" : "text-[#6F6A62]"}
                              />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </>
                    ) : (
                      [
                        { label: "exportar lista atual", action: exportCurrentList },
                        { label: "copiar e-mails filtrados", action: copyEmails },
                        { label: "limpar filtros da lista", action: clearTopFilters },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            item.action();
                            setShowTopMore(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                        >
                          <MoreHorizontal size={16} className="text-[#6F6A62]" />
                          <span>{item.label}</span>
                        </button>
                      ))
                    )}
                  </FloatingDraggablePopover>
                )}
              </div>
            </div>
          </div>

          {birthdayMonthOnly && (
            <div className="space-y-4 rounded-2xl border border-[#DDE7FF] bg-[#F5F8FF] px-4 py-4 text-sm text-[#29456F]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">Filtrar aniversariantes por mês ou intervalo de datas</span>
                <button
                  type="button"
                  onClick={() => {
                    setBirthdayMonthOnly(false);
                    setPage(1);
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete("birthdays");
                    router.replace(
                      params.size ? `${pathname}?${params.toString()}` : pathname,
                      { scroll: false }
                    );
                  }}
                  className="rounded-full bg-white px-3 py-1.5 font-semibold text-[#2F5BFF] shadow-sm"
                >
                  ver todos cadastros
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[#62769A]">
                    Mês
                  </span>
                  <select
                    value={birthdayMonthFilter}
                    onChange={(event) => {
                      setBirthdayMonthFilter(event.target.value);
                      setBirthdayStartDate("");
                      setBirthdayEndDate("");
                      setPage(1);
                    }}
                    className="h-11 w-full rounded-xl border border-[#CAD8F5] bg-white px-3 text-sm text-[#171717] outline-none"
                  >
                    <option value="todos">Todos os meses</option>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((monthNumber) => (
                      <option key={monthNumber} value={String(monthNumber)}>
                        {new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
                          new Date(2026, monthNumber - 1, 1)
                        )}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[#62769A]">
                    Data inicial
                  </span>
                  <input
                    type="date"
                    value={birthdayStartDate}
                    onChange={(event) => {
                      setBirthdayStartDate(event.target.value);
                      setPage(1);
                    }}
                    className="h-11 w-full rounded-xl border border-[#CAD8F5] bg-white px-3 text-sm text-[#171717] outline-none"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-[#62769A]">
                    Data final
                  </span>
                  <input
                    type="date"
                    value={birthdayEndDate}
                    onChange={(event) => {
                      setBirthdayEndDate(event.target.value);
                      setPage(1);
                    }}
                    className="h-11 w-full rounded-xl border border-[#CAD8F5] bg-white px-3 text-sm text-[#171717] outline-none"
                  />
                </label>
              </div>

              {(birthdayStartDate || birthdayEndDate) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setBirthdayStartDate("");
                      setBirthdayEndDate("");
                      setPage(1);
                    }}
                    className="font-semibold text-[#2F5BFF]"
                  >
                    limpar intervalo de datas
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex min-w-[320px] flex-1 items-center rounded-[14px] border border-[#E4D8C2] bg-white px-4 py-3">
              <input
                value={search}
                onFocus={() => setSearchSuggestionsOpen(true)}
                onBlur={() => setSearchSuggestionsOpen(false)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchSuggestionIndex(0);
                  setSearchSuggestionsOpen(true);
                  setPage(1);
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
                      setSearch(selected.name);
                      setSearchSuggestionIndex(0);
                      setSearchSuggestionsOpen(false);
                      setPage(1);
                    }
                  }
                }}
                placeholder="Pesquise por nome, cód., fantasia, email ou CPF/"
                className="w-full bg-transparent text-[15px] text-[#171717] outline-none placeholder:text-[#9B9488]"
              />
              <Search size={18} className="text-[#6F6A62]" />
              {searchSuggestionsOpen && searchSuggestions.length > 0 && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-40 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#E4D8C2] bg-white p-2 shadow-xl">
                  {searchSuggestions.map((record, index) => (
                    <button
                      key={record.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setSearch(record.name);
                        setSearchSuggestionIndex(0);
                        setSearchSuggestionsOpen(false);
                        setPage(1);
                      }}
                      className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm ${
                        index === searchSuggestionIndex
                          ? "bg-[#EEF4FF] text-[#1D3E92]"
                          : "text-[#1D1B18] hover:bg-[#F7F4EE]"
                      }`}
                    >
                      <span className="font-semibold">{record.name}</span>
                      <span className="text-xs text-[#8B8478]">
                        {[record.cpfCnpj, record.contact].filter(Boolean).join(" • ") || "Cadastro"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rememberPopoverAnchor("filters", event.currentTarget);
                  setShowFiltersMenu((current) => !current);
                }}
                className="ml-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6F6A62]"
              >
                <SlidersHorizontal size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-[#E4D8C2] text-[#6F6A62]"
              >
                <ChevronDown size={15} />
              </button>
            </div>

            {!birthdayMonthOnly && <div data-cadastros-popover="true" className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rememberPopoverAnchor("date", event.currentTarget);
                  setShowDateMenu((current) => !current);
                }}
                className="rounded-full border border-[#E4D8C2] px-4 py-2 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
              >
                por data do cadastro
              </button>

              {showDateMenu && (
                <FloatingDraggablePopover
                  anchorRect={popoverAnchorRects.date || null}
                  onClose={() => setShowDateMenu(false)}
                  placement="bottom-start"
                  width={220}
                  className="w-[220px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-xl"
                >
                  {[
                    { label: "mais recentes primeiro", action: () => setSortBy("data-desc") },
                    { label: "mais antigos primeiro", action: () => setSortBy("data-asc") },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        item.action();
                        setShowDateMenu(false);
                        setPage(1);
                      }}
                      className="flex w-full rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                    >
                      {item.label}
                    </button>
                  ))}
                </FloatingDraggablePopover>
              )}
            </div>}

            <div data-cadastros-popover="true" className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rememberPopoverAnchor("sort", event.currentTarget);
                  setShowSortMenu((current) => !current);
                }}
                className="rounded-full border border-[#E4D8C2] px-4 py-2 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
              >
                nome
              </button>

              {showSortMenu && (
                <FloatingDraggablePopover
                  anchorRect={popoverAnchorRects.sort || null}
                  onClose={() => setShowSortMenu(false)}
                  placement="bottom-start"
                  width={220}
                  className="w-[220px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-xl"
                >
                  {[
                    { label: "nome de A a Z", value: "nome-asc" },
                    { label: "nome de Z a A", value: "nome-desc" },
                    { label: "cidade de A a Z", value: "cidade-asc" },
                    { label: "cidade de Z a A", value: "cidade-desc" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setSortBy(item.value as SortOption);
                        setShowSortMenu(false);
                        setPage(1);
                      }}
                      className={`flex w-full rounded-xl px-3 py-2.5 text-left text-[14px] transition hover:bg-[#FAF8F3] ${
                        sortBy === item.value ? "bg-[#F3F6FF] text-[#171717]" : "text-[#4E4A43]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </FloatingDraggablePopover>
              )}
            </div>

            <div data-cadastros-popover="true" className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rememberPopoverAnchor("status", event.currentTarget);
                  setShowStatusMenu((current) => !current);
                }}
                className="rounded-full border border-[#E4D8C2] px-4 py-2 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
              >
                {statusFilter === "todos"
                  ? "por situação"
                  : statusFilter === "ativo"
                    ? "ativos"
                    : statusFilter === "inativo"
                      ? "inativos"
                      : "pendentes"}
              </button>

              {showStatusMenu && (
                <FloatingDraggablePopover
                  anchorRect={popoverAnchorRects.status || null}
                  onClose={() => setShowStatusMenu(false)}
                  placement="bottom-start"
                  width={220}
                  className="w-[220px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-xl"
                >
                  {[
                    { label: "todas", value: "todos" },
                    { label: "ativo", value: "ativo" },
                    { label: "inativo", value: "inativo" },
                    { label: "pendente", value: "pendente" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => applyStatusFilter(item.value)}
                      className={`flex w-full rounded-xl px-3 py-2.5 text-left text-[14px] transition hover:bg-[#FAF8F3] ${
                        statusFilter === item.value ? "bg-[#F3F6FF] text-[#171717]" : "text-[#4E4A43]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </FloatingDraggablePopover>
              )}
            </div>

            <div data-cadastros-popover="true" className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  rememberPopoverAnchor("filters", event.currentTarget);
                  setShowFiltersMenu((current) => !current);
                }}
                className="rounded-full border border-[#E4D8C2] px-4 py-2 text-sm font-medium text-[#171717] transition hover:bg-[#FAF8F3]"
              >
                filtros
              </button>

              {showFiltersMenu && (
                <FloatingDraggablePopover
                  anchorRect={popoverAnchorRects.filters || null}
                  onClose={() => setShowFiltersMenu(false)}
                  placement="bottom-end"
                  width={320}
                  className="w-[320px] rounded-2xl border border-[#ECE7DB] bg-white p-4 shadow-xl"
                >
                  <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#171717]">
                    <Filter size={16} />
                    filtros
                  </div>

                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1 block text-sm text-[#6F6A62]">Cidade</span>
                      <select
                        value={cityFilter}
                        onChange={(event) => {
                          setCityFilter(event.target.value);
                          setPage(1);
                        }}
                        className="w-full rounded-xl border border-[#E4D8C2] px-3 py-2.5 text-sm outline-none"
                      >
                        <option value="">Todas</option>
                        {cityOptions.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm text-[#6F6A62]">Contato</span>
                      <select
                        value={contactFilter}
                        onChange={(event) => {
                          setContactFilter(event.target.value);
                          setPage(1);
                        }}
                        className="w-full rounded-xl border border-[#E4D8C2] px-3 py-2.5 text-sm outline-none"
                      >
                        <option value="todos">Todos</option>
                        <option value="com-email">Com e-mail</option>
                        <option value="com-telefone">Com telefone</option>
                        <option value="completo">Com e-mail e telefone</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={clearTopFilters}
                      className="text-sm font-medium text-[#6F6A62]"
                    >
                      limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFiltersMenu(false)}
                      className="rounded-full bg-[#2F5BFF] px-4 py-2 text-sm font-semibold text-white"
                    >
                      aplicar
                    </button>
                  </div>
                </FloatingDraggablePopover>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-9 gap-y-3 border-b border-[#EEE7D9] pb-5">
            {categoryOptions.primary.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => changeCategory(option.key)}
                className={`text-left transition ${
                  selectedCategory === option.key
                    ? "text-[#171717]"
                    : "text-[#6F6A62] hover:text-[#171717]"
                }`}
              >
                <span
                  className={`block whitespace-nowrap text-[15px] capitalize ${
                    selectedCategory === option.key ? "font-semibold" : "font-medium"
                  }`}
                >
                  {formatLabel(option.label)}
                </span>
                <span
                  className={`mt-1 block text-[13px] ${
                    selectedCategory === option.key ? "font-semibold" : ""
                  }`}
                >
                  {formatCount(option.count)}
                </span>
                {selectedCategory === option.key && (
                  <span className="mt-2 block h-[2px] w-full bg-[#171717]" />
                )}
              </button>
            ))}

            {categoryOptions.more.length > 0 && (
              <div data-cadastros-popover="true" className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    rememberPopoverAnchor("categoryMore", event.currentTarget);
                    setShowMore((current) => !current);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-[#D5DCEA] px-4 text-sm font-medium text-[#5F5A52] transition hover:bg-[#FAF8F3]"
                >
                  mais
                  <MoreHorizontal size={16} />
                </button>

                {showMore && (
                  <FloatingDraggablePopover
                    anchorRect={popoverAnchorRects.categoryMore || null}
                    onClose={() => setShowMore(false)}
                    placement="bottom-end"
                    width={320}
                    className="w-[320px] rounded-2xl border border-[#ECE7DB] bg-white p-3 shadow-xl"
                  >
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowMore(false)}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#D5DCEA] px-4 text-sm font-medium text-[#5F5A52]"
                      >
                        mais
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {categoryOptions.more.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => changeCategory(option.key)}
                            className={`flex w-full items-center justify-between rounded-xl px-4 py-2 text-left transition ${
                              selectedCategory === option.key
                                ? "bg-[#F3F6FF] text-[#171717]"
                                : "text-[#5F5A52] hover:bg-[#FAF8F3]"
                            }`}
                          >
                            <span>{formatLabel(option.label)}</span>
                            <span className="text-sm">{formatCount(option.count)}</span>
                          </button>
                        ))}
                    </div>
                  </FloatingDraggablePopover>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto px-2 pb-1">
          <table className="w-full min-w-[1200px] border-collapse">
            <thead>
              <tr className="border-b border-[#EEE7D9] text-left text-[15px] text-[#6E86AF]">
                <th className="px-4 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#D8D2C4] bg-transparent" />
                </th>
                <th className="px-4 py-4">
                  <div data-cadastros-popover="true" className="relative inline-block">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        rememberPopoverAnchor("tableSort", event.currentTarget);
                        setShowTableSortMenu((current) => !current);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 transition hover:bg-[#F3F6FF] hover:text-[#294D91]"
                    >
                      Nome
                      <ChevronsUpDown size={14} />
                    </button>

                    {showTableSortMenu && (
                      <FloatingDraggablePopover
                        anchorRect={popoverAnchorRects.tableSort || null}
                        onClose={() => setShowTableSortMenu(false)}
                        placement="bottom-start"
                        width={240}
                        className="w-[240px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-xl"
                      >
                        {[
                          {
                            label: "Ordenar por nome",
                            detail: sortBy === "nome-desc" ? "Z a A" : "A a Z",
                            action: () =>
                              setSortBy(sortBy === "nome-asc" ? "nome-desc" : "nome-asc"),
                          },
                          {
                            label: "Ordenar por data",
                            detail: sortBy === "data-asc" ? "Mais antigos" : "Mais recentes",
                            action: () =>
                              setSortBy(sortBy === "data-desc" ? "data-asc" : "data-desc"),
                          },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              item.action();
                              setShowTableSortMenu(false);
                              setPage(1);
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                          >
                            <span>{item.label}</span>
                            <span className="text-xs text-[#8B8478]">{item.detail}</span>
                          </button>
                        ))}
                      </FloatingDraggablePopover>
                    )}
                  </div>
                </th>
                <th className="px-4 py-4">{birthdayMonthOnly ? "Data de nascimento" : "CPF/CNPJ"}</th>
                <th className="px-4 py-4">
                  <div className="inline-flex items-center gap-1.5">
                    Cidade
                    <ChevronsUpDown size={14} />
                  </div>
                </th>
                <th className="px-4 py-4">Contato</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-[#8B8478]">
                    Nenhum cadastro encontrado.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.id} className="border-b border-[#F0E9DC] text-[15px] text-[#171717] transition hover:bg-[#FCFBF8]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(record.id)}
                          onChange={(event) => toggleRecordSelection(record.id, event.target.checked)}
                          className="h-4 w-4 rounded border-[#D8D2C4] bg-transparent"
                        />
                        <div data-cadastros-popover="true" className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const nextOpen = openActionsId === record.id ? null : record.id;
                              setOpenActionsId(nextOpen);
                              setOpenActionsAnchorRect(
                                nextOpen ? event.currentTarget.getBoundingClientRect() : null
                              );
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFEAE0] text-[#7D776E]"
                          >
                            <MoreHorizontal size={15} />
                          </button>

                          {openActionsId === record.id && (
                            <FloatingDraggablePopover
                              anchorRect={openActionsAnchorRect}
                              onClose={() => {
                                setOpenActionsId(null);
                                setOpenActionsAnchorRect(null);
                              }}
                              placement="bottom-start"
                              width={340}
                              className="w-[340px] overflow-hidden rounded-2xl border border-[#E8E1D4] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
                            >
                              <div className="flex items-center gap-3 border-b border-[#EEE7D9] px-5 py-4">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F5BFF] text-white">
                                  <MoreHorizontal size={16} />
                                </div>
                                <div className="truncate text-[15px] font-medium text-[#171717]">
                                  {record.name}
                                </div>
                              </div>

                              <div className="px-3 py-2">
                                {[
                                  {
                                    label: isInactiveStatus(record.status)
                                      ? "ativar cadastro"
                                      : "inativar cadastro",
                                    icon: isInactiveStatus(record.status) ? UserPlus : UserX,
                                    action: () =>
                                      isInactiveStatus(record.status)
                                        ? void handleActivateRecord(record)
                                        : void handleDeactivateRecord(record),
                                  },
                                  {
                                    label: "excluir cadastro",
                                    icon: Trash2,
                                    action: () => void handleDeleteRecord(record),
                                    danger: true,
                                  },
                                  {
                                    label: "imprimir ficha cadastral",
                                    icon: Printer,
                                    action: () => handlePrintRecord(record),
                                  },
                                ].map((item) => {
                                  const Icon = item.icon;
                                  return (
                                    <button
                                      key={item.label}
                                      type="button"
                                      onClick={() => {
                                        item.action();
                                        setOpenActionsId(null);
                                      }}
                                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                                    >
                                      <Icon
                                        size={16}
                                        className={item.danger ? "text-red-500" : "text-[#6F6A62]"}
                                      />
                                      <span>{item.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </FloatingDraggablePopover>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-[#171717]">
                      <Link
                        href={`/dashboard/membros/cadastros/${record.id}`}
                        className="transition hover:text-[#2F5BFF]"
                      >
                        {record.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 align-top text-[#171717]">
                      <div>{birthdayMonthOnly ? formatBirthDate(record.birthDate) : record.cpfCnpj || "-"}</div>
                      {!birthdayMonthOnly && record.code ? (
                        <div className="mt-1 text-[#9B9488]">#{record.code}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-[#171717]">{record.city || "-"}</td>
                    <td className="px-4 py-4 text-[#171717]">
                      <div>{record.email || "-"}</div>
                      {record.contact ? (
                        <div className="mt-1">{record.contact}</div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-6 text-[#8F877A]">
          <div className="flex items-center gap-5 text-[15px]">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map(
              (pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={page === pageNumber ? "font-medium text-[#171717]" : "hover:text-[#171717]"}
                >
                  {String(pageNumber).padStart(2, "0")}
                </button>
              )
            )}
            {totalPages > 5 && <span>…</span>}
            {totalPages > 1 && (
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                className="hover:text-[#171717]"
              >
                →
              </button>
            )}
          </div>

          <div className="text-sm">
            {filteredRecords.length} cadastro(s)
          </div>
        </div>
      </section>
    </main>
  );
}
