"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Copy,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eye,
  FileText,
  X,
  Funnel,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";

import ManagementModule, { ResourceRecord } from "@/components/modules/ManagementModule";
import SpreadsheetImportActions from "@/components/spreadsheets/SpreadsheetImportActions";
import FloatingDraggablePopover from "@/components/ui/floating-draggable-popover";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import { nameMatchesSearchSuggestion, normalizeSearchText } from "@/lib/search";
import { printDuplicateTemplate, printReceiptTemplate } from "./print-templates";

type Category = {
  id: string;
  nome: string;
};

const statusOptions = [
  { label: "Todas", value: "TODOS" },
  { label: "Pendente", value: "PENDING" },
  { label: "Pago", value: "PAID" },
  { label: "Atrasado", value: "OVERDUE" },
  { label: "Cancelado", value: "CANCELED" },
];

const payablePageOptions = [
  { label: "Todas", value: "TODAS" },
  { label: "Em aberto", value: "EM_ABERTO" },
  { label: "Emitidas", value: "EMITIDAS" },
  { label: "Pagas", value: "PAGAS" },
  { label: "Atrasadas", value: "ATRASADAS" },
];

type PayablePage = (typeof payablePageOptions)[number]["value"];
const receivablePageOptions = payablePageOptions.filter((option) => option.value !== "TODAS");

const methodOptions = [
  { label: "PIX", value: "PIX" },
  { label: "DINHEIRO", value: "DINHEIRO" },
  { label: "CRÉDITO", value: "CARTAO_CREDITO" },
  { label: "DÉBITO", value: "CARTAO_DEBITO" },
  { label: "BOLETO", value: "BOLETO" },
  { label: "TRANSFERÊNCIA", value: "TRANSFERENCIA" },
];

const financeTabs = [
  {
    id: "receber",
    label: "Contas a Receber",
  },
  {
    id: "pagar",
    label: "Contas a Pagar",
  },
  {
    id: "fornecedores",
    label: "Fornecedores",
  },
  {
    id: "cadastro-fornecedores",
    label: "Cadastro de Fornecedores",
  },
  {
    id: "caixa",
    label: "Caixa e Bancos",
  },
] as const;

type FinanceTab = (typeof financeTabs)[number]["id"];
type TransactionViewType = "INCOME" | "EXPENSE";
type PeriodPreset = "LAST_30_DAYS" | "NO_FILTER" | "TODAY" | "WEEK" | "MONTH" | "INTERVAL" | "NO_COMPETENCE";

function DraggablePopover({
  children,
  className,
  onClose,
}: {
  children: ReactNode;
  className: string;
  onClose?: () => void;
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button,input,select,textarea,a,label")) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleInternalClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();

    const target = event.target as HTMLElement;
    const actionElement = target.closest("button,a,[data-popover-close='true']");

    if (!actionElement || actionElement.closest("[data-popover-keep-open='true']")) {
      return;
    }

    window.setTimeout(() => {
      onClose?.();
    }, 0);
  }

  return (
    <div
      className={`${className} cursor-grab touch-none select-none active:cursor-grabbing`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onClick={handleInternalClick}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      {children}
    </div>
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isReceivablePage(value: string | null): value is PayablePage {
  return receivablePageOptions.some((item) => item.value === value);
}

type CashLedgerEntry = {
  id: string;
  accountName: string;
  entryDate: string;
  category?: string | null;
  description: string;
  movementType: string;
  amount: number;
  externalId?: string | null;
  contact?: string | null;
  document?: string | null;
  documentNumber?: string | null;
  sourceFile: string;
  transferFrom?: string | null;
  transferTo?: string | null;
  isTransfer: boolean;
};

type CashLedgerResponse = {
  data: CashLedgerEntry[];
  summary?: {
    totalEntries: number;
    totalAccounts: number;
    totalFiles: number;
    credits: number;
    debits: number;
    currentBalance: number;
    initialBalance?: number | null;
    closingDate?: string | null;
  };
  accounts?: Array<{
    name: string;
    totalEntries: number;
  }>;
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
};

type BankAccountRecord = {
  id: string;
  nome: string;
  banco: string;
  agencia?: string | null;
  conta?: string | null;
  titular?: string | null;
  documento?: string | null;
  tipo: string;
  observacoes?: string | null;
  ativo: boolean;
};

type BankAccountsResponse = {
  data: BankAccountRecord[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
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
  data: ContactOption[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
};

type TransactionRecord = ResourceRecord & {
  id: string;
  descricao?: string | null;
  centroCusto?: string | null;
  issuedAt?: string | null;
  competencia?: string | null;
  vencimento?: string | null;
  pagamentoEm?: string | null;
  valor?: number | string | null;
  amountPaid?: number | string | null;
  rawStatus?: string | null;
  status?: string | null;
  documentNumber?: string | null;
  metodo?: string | null;
  paymentReference?: string | null;
  comprovante?: string | null;
  observacoes?: string | null;
  externalSource?: string | null;
  externalId?: string | null;
  categoryId?: string | null;
  category?: {
    id?: string;
    nome?: string;
  } | null;
};

type BulkSettlementItemForm = {
  categoryId: string;
  fees: string;
  interest: string;
  discount: string;
  addition: string;
  amount: string;
};

type SingleSettlementDetailsForm = {
  categoryId: string;
  fees: string;
  interest: string;
  discount: string;
  addition: string;
  amount: string;
};

type TransactionsResponse = {
  data: ResourceRecord[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
  totalValue?: number;
  sourcePageBuckets?: Partial<Record<PayablePage, number>> | null;
  sourcePageBucketTotals?: Partial<Record<PayablePage, number>> | null;
  payableBuckets?: Partial<Record<PayablePage, number>> | null;
  payableBucketTotals?: Partial<Record<PayablePage, number>> | null;
};

type CashRegisterRecord = {
  id: string;
  nome: string;
  descricao?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  aberto?: boolean;
  aberturaEm?: string | null;
  saldoAbertura?: number | string | null;
  fechamentoEm?: string | null;
  saldoFechamento?: number | string | null;
  currentSessionId?: string | null;
};

type PaymentAccountOption = {
  id: string;
  nome: string;
  ativo: boolean;
  source: "bank" | "cash";
};

type CashRegistersResponse = {
  data: CashRegisterRecord[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
};

async function fetchAllPaginatedRows<T extends { data?: unknown[]; pagination?: { pages?: number } }>(
  buildUrl: (page: number) => string
) {
  const firstResponse = await fetch(buildUrl(1));
  const firstData = (await firstResponse.json()) as T;
  const firstRows = Array.isArray(firstData?.data) ? (firstData.data as unknown[]) : [];
  const totalPages = Math.max(Number(firstData?.pagination?.pages || 1), 1);

  if (totalPages === 1) {
    return firstRows;
  }

  const remainingResponses = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetch(buildUrl(index + 2)))
  );
  const remainingData = (await Promise.all(remainingResponses.map((response) => response.json()))) as T[];

  return [
    ...firstRows,
    ...remainingData.flatMap((data) =>
      Array.isArray(data?.data) ? (data.data as unknown[]) : []
    ),
  ];
}

function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function amountNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(/[R$]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNegativeAmount(value: unknown) {
  return amountNumber(value) < 0;
}

function moneyInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function moneyFieldInput(value: string) {
  const isNegative = value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return isNegative ? "-0,00" : "0,00";
  }

  const formatted = moneyInput(Number(digits) / 100);

  return isNegative ? `-${formatted}` : formatted;
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : "-";
}

function calculatePaySettlementAmount(
  baseAmount: number,
  values: Pick<SingleSettlementDetailsForm, "interest" | "discount" | "addition">
) {
  return Math.max(
    baseAmount +
      amountNumber(values.interest) +
      amountNumber(values.addition) -
      amountNumber(values.discount),
    0
  );
}

function calculateReceiveSettlementAmount(
  baseAmount: number,
  values: Pick<SingleSettlementDetailsForm, "fees" | "interest" | "discount" | "addition">
) {
  return Math.max(
    baseAmount -
      amountNumber(values.fees) +
      amountNumber(values.interest) +
      amountNumber(values.addition) -
      amountNumber(values.discount),
    0
  );
}

function paymentMethod(value: unknown) {
  const method = methodOptions.find((option) => option.value === value);

  return method?.label || text(value);
}

function dateTime(value: unknown) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(String(value)));
}

function dateOnly(value: unknown) {
  if (!value) {
    return "-";
  }

  const textValue = String(value);
  const match = textValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
  }).format(new Date(textValue));
}

function numberValue(value: unknown) {
  return Number(value || 0);
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(value: string) {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return new Date(year, month - 1, 1);
}

function shiftMonthKey(value: string, delta: number) {
  const date = parseMonthKey(value);
  date.setMonth(date.getMonth() + delta);
  return formatMonthKey(date);
}

function formatMonthLabel(value: string) {
  const date = parseMonthKey(value);
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMonthYearLabel(value: string) {
  const date = parseMonthKey(value);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function statusBadgeColor(status: string | null | undefined) {
  switch (status) {
    case "PAID":
      return "bg-emerald-500";
    case "OVERDUE":
      return "bg-rose-500";
    case "CANCELED":
      return "bg-slate-400";
    default:
      return "bg-indigo-300";
  }
}

function rawStatusLabel(record: TransactionRecord, transactionType: TransactionViewType) {
  if (record.rawStatus) {
    return record.rawStatus;
  }

  switch (record.status) {
    case "PAID":
      return transactionType === "EXPENSE" ? "Paga" : "Recebida";
    case "OVERDUE":
      return "Atrasada";
    case "CANCELED":
      return "Cancelada";
    default:
      return "Em aberto";
  }
}

function categoryName(record: ResourceRecord) {
  const category = record.category;

  return category && typeof category === "object" && "nome" in category
    ? String(category.nome)
    : "-";
}

function resolvePendingStatusByDueDate(value: unknown) {
  if (!value) {
    return "PENDING";
  }

  const dueDate = new Date(String(value));

  if (Number.isNaN(dueDate.getTime())) {
    return "PENDING";
  }

  dueDate.setHours(23, 59, 59, 999);
  return dueDate < new Date() ? "OVERDUE" : "PENDING";
}


export default function FinanceiroPage() {
  return (
    <Suspense fallback={null}>
      <FinanceiroContent />
    </Suspense>
  );
}

function FinanceiroContent() {
  const emptyBucketCounts: Record<PayablePage, number> = {
    TODAS: 0,
    EM_ABERTO: 0,
    EMITIDAS: 0,
    PAGAS: 0,
    ATRASADAS: 0,
  };
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [cashRegistersForPayments, setCashRegistersForPayments] = useState<CashRegisterRecord[]>([]);
  const [receivableBuckets, setReceivableBuckets] = useState<Record<PayablePage, number>>(emptyBucketCounts);
  const [payableBuckets, setPayableBuckets] = useState<Record<PayablePage, number>>(emptyBucketCounts);
  const [receivableBucketTotals, setReceivableBucketTotals] = useState<Record<PayablePage, number>>(emptyBucketCounts);
  const [payableBucketTotals, setPayableBucketTotals] = useState<Record<PayablePage, number>>(emptyBucketCounts);
  const [recordsRefreshToken, setRecordsRefreshToken] = useState(0);
  const [payingRecord, setPayingRecord] = useState<ResourceRecord | null>(null);
  const [payForm, setPayForm] = useState({
    bankAccountId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    metodo: "",
  });
  const [showPayDetails, setShowPayDetails] = useState(true);
  const [payDetailsForm, setPayDetailsForm] = useState<SingleSettlementDetailsForm>({
    categoryId: "",
    fees: "0,00",
    interest: "0,00",
    discount: "0,00",
    addition: "0,00",
    amount: "0,00",
  });
  const [receivingRecord, setReceivingRecord] = useState<ResourceRecord | null>(null);
  const [receiveForm, setReceiveForm] = useState({
    bankAccountId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    metodo: "",
  });
  const [showReceiveDetails, setShowReceiveDetails] = useState(true);
  const [receiveDetailsForm, setReceiveDetailsForm] = useState<SingleSettlementDetailsForm>({
    categoryId: "",
    fees: "0,00",
    interest: "0,00",
    discount: "0,00",
    addition: "0,00",
    amount: "0,00",
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedReceivablePage = searchParams.get("receivablesPage");
  const requestedPayablePage = searchParams.get("payablesPage");
  const [activeReceivablePage, setActiveReceivablePage] = useState<PayablePage>(
    isReceivablePage(requestedReceivablePage)
      ? (requestedReceivablePage as PayablePage)
      : "EM_ABERTO"
  );
  const [activePayablePage, setActivePayablePage] = useState<PayablePage>(
    payablePageOptions.some((item) => item.value === requestedPayablePage)
      ? (requestedPayablePage as PayablePage)
      : "TODAS"
  );
  const normalizedRequestedTab =
    requestedTab === "contas-bancarias" ? "caixa" : requestedTab;
  const tab: FinanceTab = financeTabs.some((item) => item.id === normalizedRequestedTab)
    ? (normalizedRequestedTab as FinanceTab)
    : "receber";

  useEffect(() => {
    if (!payingRecord) {
      return;
    }

    const baseAmount = Math.max(numberValue(payingRecord.valor) - numberValue(payingRecord.amountPaid), 0);
    const nextAmount = calculatePaySettlementAmount(baseAmount, payDetailsForm);
    const nextFormatted = moneyInput(nextAmount);

    setPayDetailsForm((current) =>
      current.amount === nextFormatted ? current : { ...current, amount: nextFormatted }
    );
  }, [payingRecord, payDetailsForm.interest, payDetailsForm.discount, payDetailsForm.addition]);

  useEffect(() => {
    if (!receivingRecord) {
      return;
    }

    const baseAmount = Math.max(numberValue(receivingRecord.valor) - numberValue(receivingRecord.amountPaid), 0);
    const nextAmount = calculateReceiveSettlementAmount(baseAmount, receiveDetailsForm);
    const nextFormatted = moneyInput(nextAmount);

    setReceiveDetailsForm((current) =>
      current.amount === nextFormatted ? current : { ...current, amount: nextFormatted }
    );
  }, [receivingRecord, receiveDetailsForm.fees, receiveDetailsForm.interest, receiveDetailsForm.discount, receiveDetailsForm.addition]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const [response, bankAccountsData, cashRegistersData] = await Promise.all([
        fetch("/api/finance/categories"),
        fetchAllPaginatedRows<BankAccountsResponse>(
          (page) => `/api/finance/bank-accounts?perPage=100&page=${page}`
        ),
        fetchAllPaginatedRows<CashRegistersResponse>(
          (page) => `/api/finance/cash-registers?perPage=100&page=${page}`
        ),
      ]);
      const data = await response.json();

      if (active) {
        setCategories(Array.isArray(data) ? data : []);
        setBankAccounts(Array.isArray(bankAccountsData) ? (bankAccountsData as BankAccountRecord[]) : []);
        setCashRegistersForPayments(
          Array.isArray(cashRegistersData) ? (cashRegistersData as CashRegisterRecord[]) : []
        );
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const paymentAccounts = useMemo<PaymentAccountOption[]>(
    () =>
      [
        ...bankAccounts.map((account) => ({
          id: account.id,
          nome: account.nome,
          ativo: account.ativo,
          source: "bank" as const,
        })),
        ...cashRegistersForPayments.map((register) => ({
          id: register.id,
          nome: register.nome,
          ativo: register.ativo,
          source: "cash" as const,
        })),
      ].sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR")),
    [bankAccounts, cashRegistersForPayments]
  );
  const defaultSettlementAccountId = useMemo(
    () =>
      paymentAccounts.find(
        (account) => account.ativo && account.nome.trim().toLowerCase() === "santander"
      )?.id || "",
    [paymentAccounts]
  );

  useEffect(() => {
    if (!payingRecord || payForm.bankAccountId || !defaultSettlementAccountId) {
      return;
    }

    setPayForm((current) => ({
      ...current,
      bankAccountId: current.bankAccountId || defaultSettlementAccountId,
    }));
  }, [defaultSettlementAccountId, payForm.bankAccountId, payingRecord]);

  useEffect(() => {
    if (!receivingRecord || receiveForm.bankAccountId || !defaultSettlementAccountId) {
      return;
    }

    setReceiveForm((current) => ({
      ...current,
      bankAccountId: current.bankAccountId || defaultSettlementAccountId,
    }));
  }, [defaultSettlementAccountId, receiveForm.bankAccountId, receivingRecord]);

  useEffect(() => {
    if (!requestedTab || requestedTab === tab) {
      return;
    }

    router.replace(`/dashboard/financeiro?tab=${tab}`);
  }, [requestedTab, router, tab]);

  useEffect(() => {
    if (tab !== "receber" || requestedReceivablePage !== "TODAS") {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "receber");
    params.set("receivablesPage", "EM_ABERTO");
    router.replace(`/dashboard/financeiro?${params.toString()}`);
  }, [requestedReceivablePage, router, searchParams, tab]);

  useEffect(() => {
    const nextReceivablePage = isReceivablePage(requestedReceivablePage)
      ? (requestedReceivablePage as PayablePage)
      : "EM_ABERTO";

    setActiveReceivablePage(nextReceivablePage);
  }, [requestedReceivablePage]);

  useEffect(() => {
    const nextPayablePage = payablePageOptions.some(
      (item) => item.value === requestedPayablePage
    )
      ? (requestedPayablePage as PayablePage)
      : "TODAS";

    setActivePayablePage(nextPayablePage);
  }, [requestedPayablePage]);

  const updateFinanceQuery = useCallback(
    (nextTab: FinanceTab, nextSourcePage?: PayablePage) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);

      if (nextTab === "pagar") {
        params.set("payablesPage", nextSourcePage || activePayablePage);
        params.delete("receivablesPage");
      } else if (nextTab === "receber") {
        params.set("receivablesPage", nextSourcePage || activeReceivablePage || "EM_ABERTO");
        params.delete("payablesPage");
      } else {
        params.delete("payablesPage");
        params.delete("receivablesPage");
      }

      router.replace(`/dashboard/financeiro?${params.toString()}`);
    },
    [activePayablePage, activeReceivablePage, router, searchParams]
  );

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ label: category.nome, value: category.id })),
    [categories]
  );

  const handlePayableBucketsLoaded = useCallback((data: TransactionsResponse) => {
    const buckets = data?.sourcePageBuckets || data?.payableBuckets;
    const totals = data?.sourcePageBucketTotals || data?.payableBucketTotals;
    if (buckets) {
      setPayableBuckets({
        TODAS: buckets.TODAS ?? 0,
        EM_ABERTO: buckets.EM_ABERTO ?? 0,
        EMITIDAS: buckets.EMITIDAS ?? 0,
        PAGAS: buckets.PAGAS ?? 0,
        ATRASADAS: buckets.ATRASADAS ?? 0,
      });
    }
    if (totals) {
      setPayableBucketTotals({
        TODAS: totals.TODAS ?? 0,
        EM_ABERTO: totals.EM_ABERTO ?? 0,
        EMITIDAS: totals.EMITIDAS ?? 0,
        PAGAS: totals.PAGAS ?? 0,
        ATRASADAS: totals.ATRASADAS ?? 0,
      });
    }
  }, []);

  const handleReceivableBucketsLoaded = useCallback((data: TransactionsResponse) => {
    const buckets = data?.sourcePageBuckets || data?.payableBuckets;
    const totals = data?.sourcePageBucketTotals || data?.payableBucketTotals;
    if (buckets) {
      setReceivableBuckets({
        TODAS: buckets.TODAS ?? 0,
        EM_ABERTO: buckets.EM_ABERTO ?? 0,
        EMITIDAS: buckets.EMITIDAS ?? 0,
        PAGAS: buckets.PAGAS ?? 0,
        ATRASADAS: buckets.ATRASADAS ?? 0,
      });
    }
    if (totals) {
      setReceivableBucketTotals({
        TODAS: totals.TODAS ?? 0,
        EM_ABERTO: totals.EM_ABERTO ?? 0,
        EMITIDAS: totals.EMITIDAS ?? 0,
        PAGAS: totals.PAGAS ?? 0,
        ATRASADAS: totals.ATRASADAS ?? 0,
      });
    }
  }, []);

  async function submitPayablePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!payingRecord?.id) {
      return;
    }

    const response = await fetch(`/api/finance/transactions/${payingRecord.id}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payForm,
        amount: payDetailsForm.amount,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível realizar o pagamento.");
      return;
    }

    setPayingRecord(null);
    setRecordsRefreshToken((current) => current + 1);
    router.refresh();
  }

  async function submitReceivableReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!receivingRecord?.id) {
      return;
    }

    const response = await fetch(`/api/finance/transactions/${receivingRecord.id}/receive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...receiveForm,
        amount: receiveDetailsForm.amount,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível realizar o recebimento.");
      return;
    }

    setReceivingRecord(null);
    setRecordsRefreshToken((current) => current + 1);
    router.refresh();
  }

  const transactionFields = useMemo(
    () =>
      ({
        INCOME: [
          {
            name: "tipo",
            type: "hidden" as const,
          },
          {
            name: "descricao",
            label: "Descrição",
            required: true,
          },
          {
            name: "categoryId",
            label: "Categoria",
            type: "select" as const,
            options: categoryOptions,
            required: true,
          },
          {
            name: "centroCusto",
            label: "Cliente / Origem",
          },
          {
            name: "valor",
            label: "Valor",
            type: "number" as const,
            required: true,
          },
          {
            name: "quantidadeParcelas",
            label: "Quantidade de parcelas",
            type: "number" as const,
          },
          {
            name: "valorParcela",
            label: "Valor por parcela",
            type: "number" as const,
          },
          {
            name: "metodo",
            label: "Método de recebimento",
            type: "select" as const,
            options: methodOptions,
          },
          {
            name: "status",
            label: "Status",
            type: "select" as const,
            options: statusOptions,
          },
          {
            name: "vencimento",
            label: "Vencimento",
            type: "date" as const,
          },
          {
            name: "pagamentoEm",
            label: "Recebido em",
            type: "date" as const,
          },
          {
            name: "comprovante",
            label: "Comprovante",
          },
          {
            name: "observacoes",
            label: "Observações",
            type: "textarea" as const,
          },
        ],
        EXPENSE: [
          {
            name: "tipo",
            type: "hidden" as const,
          },
          {
            name: "descricao",
            label: "Descrição",
            required: true,
          },
          {
            name: "categoryId",
            label: "Categoria",
            type: "select" as const,
            options: categoryOptions,
            required: true,
          },
          {
            name: "centroCusto",
            label: "Fornecedor / Centro de custo",
          },
          {
            name: "valor",
            label: "Valor",
            type: "number" as const,
            required: true,
          },
          {
            name: "quantidadeParcelas",
            label: "Quantidade de parcelas",
            type: "number" as const,
          },
          {
            name: "valorParcela",
            label: "Valor por parcela",
            type: "number" as const,
          },
          {
            name: "metodo",
            label: "Método",
            type: "select" as const,
            options: methodOptions,
          },
          {
            name: "status",
            label: "Status",
            type: "select" as const,
            options: statusOptions,
          },
          {
            name: "vencimento",
            label: "Vencimento",
            type: "date" as const,
          },
          {
            name: "pagamentoEm",
            label: "Pagamento em",
            type: "date" as const,
          },
          {
            name: "comprovante",
            label: "Comprovante",
          },
          {
            name: "observacoes",
            label: "Observações",
            type: "textarea" as const,
          },
        ],
      }) satisfies Record<TransactionViewType, Array<Record<string, unknown>>>,
    [categoryOptions]
  );

  const transactionColumns = useMemo(
    () =>
      ({
        INCOME: [
          {
            header: "Descrição",
            render: (record: ResourceRecord) => text(record.descricao),
          },
          {
            header: "Categoria",
            render: categoryName,
          },
          {
            header: "Cliente / Origem",
            render: (record: ResourceRecord) => text(record.centroCusto),
          },
          {
            header: "Valor",
            render: (record: ResourceRecord) => money(record.valor),
          },
          {
            header: "Parcelas",
            render: (record: ResourceRecord) =>
              record.quantidadeParcelas
                ? `${record.quantidadeParcelas}x de ${money(record.valorParcela)}`
                : "-",
          },
          {
            header: "Método",
            render: (record: ResourceRecord) => paymentMethod(record.metodo),
          },
          {
            header: "Status",
            render: (record: ResourceRecord) => text(record.status),
          },
          {
            header: "Vencimento",
            render: (record: ResourceRecord) => text(record.vencimento).slice(0, 10),
          },
        ],
        EXPENSE: [
          {
            header: "Descrição",
            render: (record: ResourceRecord) => text(record.descricao),
          },
          {
            header: "Categoria",
            render: categoryName,
          },
          {
            header: "Fornecedor / Centro de custo",
            render: (record: ResourceRecord) => text(record.centroCusto),
          },
          {
            header: "Valor",
            render: (record: ResourceRecord) => money(record.valor),
          },
          {
            header: "Parcelas",
            render: (record: ResourceRecord) =>
              record.quantidadeParcelas
                ? `${record.quantidadeParcelas}x de ${money(record.valorParcela)}`
                : "-",
          },
          {
            header: "Método",
            render: (record: ResourceRecord) => paymentMethod(record.metodo),
          },
          {
            header: "Status",
            render: (record: ResourceRecord) => text(record.status),
          },
          {
            header: "Vencimento",
            render: (record: ResourceRecord) => text(record.vencimento).slice(0, 10),
          },
        ],
      }) satisfies Record<TransactionViewType, Array<{ header: string; render: (record: ResourceRecord) => string }>>,
    []
  );

  return (
    <div className="space-y-6">
      {tab === "receber" && (
        <PayablesListSection
          key="receber"
          categories={categories}
          bankAccounts={bankAccounts}
          paymentAccounts={paymentAccounts}
          payableBuckets={receivableBuckets}
          payableBucketTotals={receivableBucketTotals}
          activePayablePage={activeReceivablePage}
          onChangePayablePage={(value) => {
            setActiveReceivablePage(value);
            updateFinanceQuery("receber", value);
          }}
          onOpenPayment={(record) => {
            if (String(record.status) === "PAID") {
              window.alert("Essa conta já está recebida.");
              return;
            }

            setReceivingRecord(record);
            setShowReceiveDetails(true);
            const receiveAmount = Math.max(numberValue(record.valor) - numberValue(record.amountPaid), 0);
            setReceiveDetailsForm({
              categoryId:
                typeof record.categoryId === "string" && record.categoryId
                  ? record.categoryId
                  : typeof record.category?.id === "string"
                    ? record.category.id
                    : categories[0]?.id || "",
              fees: "0,00",
              interest: "0,00",
              discount: "0,00",
              addition: "0,00",
              amount: receiveAmount.toFixed(2).replace(".", ","),
            });
            setReceiveForm({
              bankAccountId: defaultSettlementAccountId,
              paymentDate: new Date().toISOString().slice(0, 10),
              metodo: typeof record.metodo === "string" ? record.metodo : "",
            });
          }}
          onBucketsLoaded={handleReceivableBucketsLoaded}
          transactionType="INCOME"
          pageTitle="Contas a Receber"
          itemLabel="conta a receber"
          partyLabel="Cliente"
          allowPayment
          refreshToken={recordsRefreshToken}
        />
      )}

      {tab === "pagar" && (
        <PayablesListSection
          key="pagar"
          categories={categories}
          bankAccounts={bankAccounts}
          paymentAccounts={paymentAccounts}
          payableBuckets={payableBuckets}
          payableBucketTotals={payableBucketTotals}
          activePayablePage={activePayablePage}
          onChangePayablePage={(value) => {
            setActivePayablePage(value);
            updateFinanceQuery("pagar", value);
          }}
          onOpenPayment={(record) => {
            if (String(record.status) === "PAID") {
              window.alert("Essa conta já está paga.");
              return;
            }

            setPayingRecord(record);
            setShowPayDetails(true);
            const payAmount = Math.max(numberValue(record.valor) - numberValue(record.amountPaid), 0);
            setPayDetailsForm({
              categoryId:
                typeof record.categoryId === "string" && record.categoryId
                  ? record.categoryId
                  : typeof record.category?.id === "string"
                    ? record.category.id
                    : categories[0]?.id || "",
              fees: "0,00",
              interest: "0,00",
              discount: "0,00",
              addition: "0,00",
              amount: payAmount.toFixed(2).replace(".", ","),
            });
            setPayForm({
              bankAccountId: defaultSettlementAccountId,
              paymentDate: new Date().toISOString().slice(0, 10),
              metodo: typeof record.metodo === "string" ? record.metodo : "",
            });
          }}
          onBucketsLoaded={handlePayableBucketsLoaded}
          refreshToken={recordsRefreshToken}
        />
      )}

      {tab === "fornecedores" && (
        <ManagementModule
          title="Fornecedores"
          description="Acompanhe apenas os lançamentos financeiros vinculados a fornecedores, em modo lista."
          endpoint="/api/finance/transactions?tipo=EXPENSE&hasCentroCusto=true"
          initialValues={{
            tipo: "EXPENSE",
            status: "PENDING",
          }}
          fields={transactionFields.EXPENSE}
          filters={[
            {
              name: "status",
              label: "Status",
              options: statusOptions,
            },
          ]}
          columns={[
            {
              header: "Fornecedor",
              render: (record: ResourceRecord) => text(record.centroCusto),
            },
            {
              header: "Descrição",
              render: (record: ResourceRecord) => text(record.descricao),
            },
            {
              header: "Categoria",
              render: categoryName,
            },
            {
              header: "Valor",
              render: (record: ResourceRecord) => money(record.valor),
            },
            {
              header: "Status",
              render: (record: ResourceRecord) => text(record.status),
            },
            {
              header: "Vencimento",
              render: (record: ResourceRecord) => text(record.vencimento).slice(0, 10),
            },
          ]}
          createLabel="Nova transação"
          enablePagination
          afterLoad={(records) => (
            <SuppliersSummary records={records} />
          )}
        />
      )}

      {tab === "cadastro-fornecedores" && (
        <ManagementModule
          title="Cadastro de Fornecedores"
          description="Cadastre, edite e exclua fornecedores usados no financeiro."
          endpoint="/api/finance/supplier-registry"
          initialValues={{
            ativo: "true",
          }}
          fields={[
            {
              name: "nome",
              label: "Nome",
              required: true,
            },
            {
              name: "documento",
              label: "CPF / CNPJ",
            },
            {
              name: "telefone",
              label: "Telefone",
            },
            {
              name: "email",
              label: "E-mail",
            },
            {
              name: "ativo",
              label: "Status",
              type: "select",
              options: [
                { label: "Ativo", value: "true" },
                { label: "Inativo", value: "false" },
              ],
            },
            {
              name: "observacoes",
              label: "Observações",
              type: "textarea",
            },
          ]}
          columns={[
            {
              header: "Nome",
              render: (record: ResourceRecord) => text(record.nome),
            },
            {
              header: "CPF / CNPJ",
              render: (record: ResourceRecord) => text(record.documento),
            },
            {
              header: "Telefone",
              render: (record: ResourceRecord) => text(record.telefone),
            },
            {
              header: "E-mail",
              render: (record: ResourceRecord) => text(record.email),
            },
            {
              header: "Status",
              render: (record: ResourceRecord) =>
                String(record.ativo) === "false" ? "Inativo" : "Ativo",
            },
          ]}
          createLabel="Novo fornecedor"
          enablePagination
        />
      )}

      {tab === "caixa" && (
        <BankAccountsSection />
      )}

      {payingRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button
            type="button"
            aria-label="Fechar pagamento"
            onClick={() => setPayingRecord(null)}
            className="flex-1 cursor-default"
          />
          <section className="flex h-full w-full max-w-[920px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-10 py-10">
              <h2 className="text-[24px] font-semibold text-[#171717]">Pagar contas selecionadas</h2>
              <button
                type="button"
                onClick={() => setPayingRecord(null)}
                className="inline-flex items-center gap-3 text-[14px] text-[#171717]"
              >
                fechar
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]">
                  <X size={16} />
                </span>
              </button>
            </div>

            <form onSubmit={submitPayablePayment} className="flex flex-1 flex-col px-10 pb-8">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Origem</span>
                  <select
                    required
                    value={payForm.bankAccountId}
                    onChange={(event) =>
                      setPayForm((current) => ({
                        ...current,
                        bankAccountId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    <option value="">Selecione</option>
                    {paymentAccounts.filter((account) => account.ativo).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Data</span>
                  <input
                    required
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(event) =>
                      setPayForm((current) => ({
                        ...current,
                        paymentDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#AFC4FF] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  />
                </label>
              </div>

              <label className="mt-5 space-y-2">
                <span className="text-sm text-[#6E675C]">Histórico</span>
                <textarea
                  value={`Liquidação de conta a pagar - ${text(payingRecord.centroCusto)}`}
                  readOnly
                  className="min-h-[110px] w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                />
              </label>

              <div className="mt-5 grid gap-5 md:grid-cols-[1fr_220px]">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Categoria</span>
                  <select
                    value={payDetailsForm.categoryId}
                    onChange={(event) => setPayDetailsForm((current) => ({ ...current, categoryId: event.target.value }))}
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nome}
                      </option>
                    ))}
                  </select>
                </label>

                {!showPayDetails && (
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Valor total</span>
                  <div className="flex h-[50px] items-center rounded-xl border border-[#E9E1D2] bg-[#F4F0E7] px-4 text-[15px] text-[#171717]">
                    {money(payingRecord.valor)}
                  </div>
                </label>
                )}
              </div>

              {!showPayDetails && (
              <label className="mt-5 space-y-2">
                <span className="text-sm text-[#6E675C]">Método</span>
                <select
                  value={payForm.metodo}
                  onChange={(event) =>
                    setPayForm((current) => ({
                      ...current,
                      metodo: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                >
                  <option value="">Selecione</option>
                  {methodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              )}

              {showPayDetails && payingRecord ? (
                <div className="mt-6">
                  <div className="border-b border-[#EEE7D9] pb-3">
                    <div className="flex items-end gap-10">
                      <div className="border-b-2 border-[#171717] pb-2 text-center text-[#171717]">
                        <div className="text-sm font-medium">referente às contas</div>
                        <div className="text-[28px] leading-none">1</div>
                      </div>
                      <div className="pb-2 text-center text-[#6E675C]">
                        <div className="text-sm font-medium">resumo por dia</div>
                        <div className="text-[28px] leading-none">1</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 border-b border-[#F0E9DC] pb-4">
                    <div className="grid gap-3 border-b border-[#EEE7D9] pb-4 text-sm text-[#7A746A] md:grid-cols-[1fr_160px_140px]">
                      <div>Fornecedor</div>
                      <div>Nº. doc</div>
                      <div className="text-right">Saldo</div>
                    </div>

                    <div className="grid gap-3 py-3 text-[15px] text-[#171717] md:grid-cols-[1fr_160px_140px] md:items-center">
                      <div>{text(payingRecord.centroCusto)}</div>
                      <div>{text(payingRecord.documentNumber)}</div>
                      <div className="flex items-center justify-end gap-3">
                        <span>{money(Math.max(numberValue(payingRecord.valor) - numberValue(payingRecord.amountPaid), 0))}</span>
                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Categoria</span>
                        <select
                          value={payDetailsForm.categoryId}
                          onChange={(event) => setPayDetailsForm((current) => ({ ...current, categoryId: event.target.value }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.nome}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Juros</span>
                        <input
                          value={payDetailsForm.interest}
                          inputMode="decimal"
                          onChange={(event) => setPayDetailsForm((current) => ({ ...current, interest: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Desconto</span>
                        <input
                          value={payDetailsForm.discount}
                          inputMode="decimal"
                          onChange={(event) => setPayDetailsForm((current) => ({ ...current, discount: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Acréscimo</span>
                        <input
                          value={payDetailsForm.addition}
                          inputMode="decimal"
                          onChange={(event) => setPayDetailsForm((current) => ({ ...current, addition: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Valor pago</span>
                        <input
                          value={payDetailsForm.amount}
                          inputMode="decimal"
                          onChange={(event) => setPayDetailsForm((current) => ({ ...current, amount: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-auto flex items-center justify-between pt-8">
                <div />
                <div className="flex items-end gap-6">
                  {showPayDetails ? (
                    <div>
                      <div className="text-sm text-[#6E675C]">Total pago</div>
                      <div className="mt-2 inline-flex min-w-[160px] items-center rounded-xl border border-[#E9E1D2] bg-[#F4F0E7] px-4 py-3 text-[22px] font-semibold text-[#171717]">
                        {payDetailsForm.amount}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPayingRecord(null)}
                    className="text-sm font-medium text-[#171717]"
                  >
                    cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-[#2F5BFF] px-7 py-3 text-sm font-semibold text-white"
                  >
                    pagar contas
                  </button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {receivingRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button
            type="button"
            aria-label="Fechar recebimento"
            onClick={() => setReceivingRecord(null)}
            className="flex-1 cursor-default"
          />
          <section className="flex h-full w-full max-w-[920px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-10 py-10">
              <h2 className="text-[24px] font-semibold text-[#171717]">Receber contas selecionadas</h2>
              <button
                type="button"
                onClick={() => setReceivingRecord(null)}
                className="inline-flex items-center gap-3 text-[14px] text-[#171717]"
              >
                fechar
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]">
                  <X size={16} />
                </span>
              </button>
            </div>

            <form onSubmit={submitReceivableReceipt} className="flex flex-1 flex-col px-10 pb-8">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Origem</span>
                  <select
                    required
                    value={receiveForm.bankAccountId}
                    onChange={(event) =>
                      setReceiveForm((current) => ({
                        ...current,
                        bankAccountId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    <option value="">Selecione</option>
                    {paymentAccounts.filter((account) => account.ativo).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.nome}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Data</span>
                  <input
                    required
                    type="date"
                    value={receiveForm.paymentDate}
                    onChange={(event) =>
                      setReceiveForm((current) => ({
                        ...current,
                        paymentDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#AFC4FF] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  />
                </label>
              </div>

              <label className="mt-5 space-y-2">
                <span className="text-sm text-[#6E675C]">Histórico</span>
                <textarea
                  value={`Liquidação de conta a receber - ${text(receivingRecord.centroCusto)}`}
                  readOnly
                  className="min-h-[110px] w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                />
              </label>

              <div className="mt-5 grid gap-5 md:grid-cols-[1fr_220px]">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Categoria</span>
                  <select
                    value={receiveDetailsForm.categoryId}
                    onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, categoryId: event.target.value }))}
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.nome}
                      </option>
                    ))}
                  </select>
                </label>

                {!showReceiveDetails && (
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Valor total</span>
                  <div className="flex h-[50px] items-center rounded-xl border border-[#E9E1D2] bg-[#F4F0E7] px-4 text-[15px] text-[#171717]">
                    {money(receivingRecord.valor)}
                  </div>
                </label>
                )}
              </div>

              {!showReceiveDetails && (
              <label className="mt-5 space-y-2">
                <span className="text-sm text-[#6E675C]">Método</span>
                <select
                  value={receiveForm.metodo}
                  onChange={(event) =>
                    setReceiveForm((current) => ({
                      ...current,
                      metodo: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                >
                  <option value="">Selecione</option>
                  {methodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              )}

              {showReceiveDetails && receivingRecord ? (
                <div className="mt-6">
                  <label className="inline-flex items-center gap-3 text-[15px] text-[#171717]">
                    <input type="checkbox" className="h-4 w-4 rounded border-[#D9D0C1]" />
                    Imprimir o recibo
                  </label>

                  <div className="mt-6 border-b border-[#EEE7D9] pb-3">
                    <div className="flex items-end gap-10">
                      <div className="border-b-2 border-[#171717] pb-2 text-center text-[#171717]">
                        <div className="text-sm font-medium">referente às contas</div>
                        <div className="text-[28px] leading-none">1</div>
                      </div>
                      <div className="pb-2 text-center text-[#6E675C]">
                        <div className="text-sm font-medium">resumo por dia</div>
                        <div className="text-[28px] leading-none">1</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 border-b border-[#F0E9DC] pb-4">
                    <div className="grid gap-3 border-b border-[#EEE7D9] pb-4 text-sm text-[#7A746A] md:grid-cols-[1fr_160px_140px]">
                      <div>Cliente</div>
                      <div>Nº. doc</div>
                      <div className="text-right">Saldo</div>
                    </div>

                    <div className="grid gap-3 py-3 text-[15px] text-[#171717] md:grid-cols-[1fr_160px_140px] md:items-center">
                      <div>{text(receivingRecord.centroCusto)}</div>
                      <div>{text(receivingRecord.documentNumber)}</div>
                      <div className="flex items-center justify-end gap-3">
                        <span>{money(Math.max(numberValue(receivingRecord.valor) - numberValue(receivingRecord.amountPaid), 0))}</span>
                        <span className="h-3 w-3 rounded-full bg-emerald-400" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Categoria</span>
                        <select
                          value={receiveDetailsForm.categoryId}
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, categoryId: event.target.value }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        >
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.nome}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Taxas</span>
                        <input
                          value={receiveDetailsForm.fees}
                          inputMode="decimal"
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, fees: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Juros</span>
                        <input
                          value={receiveDetailsForm.interest}
                          inputMode="decimal"
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, interest: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Desconto</span>
                        <input
                          value={receiveDetailsForm.discount}
                          inputMode="decimal"
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, discount: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Acréscimo</span>
                        <input
                          value={receiveDetailsForm.addition}
                          inputMode="decimal"
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, addition: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-[#6E675C]">Valor recebido</span>
                        <input
                          value={receiveDetailsForm.amount}
                          inputMode="decimal"
                          onChange={(event) => setReceiveDetailsForm((current) => ({ ...current, amount: moneyFieldInput(event.target.value) }))}
                          className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-auto flex items-center justify-between pt-8">
                <div />
                <div className="flex items-end gap-6">
                  {showReceiveDetails ? (
                    <div>
                      <div className="text-sm text-[#6E675C]">Total recebido</div>
                      <div className="mt-2 inline-flex min-w-[160px] items-center rounded-xl border border-[#E9E1D2] bg-[#F4F0E7] px-4 py-3 text-[22px] font-semibold text-[#171717]">
                        {receiveDetailsForm.amount}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setReceivingRecord(null)}
                    className="text-sm font-medium text-[#171717]"
                  >
                    cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-[#2F5BFF] px-7 py-3 text-sm font-semibold text-white"
                  >
                    receber contas
                  </button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

type PayablesListSectionProps = {
  categories: Category[];
  bankAccounts: BankAccountRecord[];
  paymentAccounts: PaymentAccountOption[];
  payableBuckets: Record<PayablePage, number>;
  payableBucketTotals: Record<PayablePage, number>;
  activePayablePage: PayablePage;
  onChangePayablePage: (value: PayablePage) => void;
  onOpenPayment: (record: TransactionRecord) => void;
  onBucketsLoaded: (data: TransactionsResponse) => void;
  transactionType?: TransactionViewType;
  pageTitle?: string;
  itemLabel?: string;
  partyLabel?: string;
  allowPayment?: boolean;
  refreshToken?: number;
  externalSourceFilter?: string;
};

function PayablesListSection({
  categories,
  bankAccounts,
  paymentAccounts,
  payableBuckets,
  payableBucketTotals,
  activePayablePage,
  onChangePayablePage,
  onOpenPayment,
  onBucketsLoaded,
  transactionType = "EXPENSE",
  pageTitle = "Contas a Pagar",
  itemLabel = "conta a pagar",
  partyLabel = "Fornecedor",
  allowPayment = true,
  refreshToken = 0,
  externalSourceFilter,
}: PayablesListSectionProps) {
  const router = useRouter();
  const visiblePageOptions =
    transactionType === "INCOME" ? receivablePageOptions : payablePageOptions;
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showPeriodFilters, setShowPeriodFilters] = useState(false);
  const [showTopActionsMenu, setShowTopActionsMenu] = useState(false);
  const [showBulkSettlementModal, setShowBulkSettlementModal] = useState(false);
  const [showBulkSettlementDetails, setShowBulkSettlementDetails] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("MONTH");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => formatMonthKey(new Date()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [draftCategoryFilter, setDraftCategoryFilter] = useState("");
  const [draftMethodFilter, setDraftMethodFilter] = useState("");
  const [draftSellerFilter, setDraftSellerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 10,
    total: 0,
    pages: 1,
  });
  const [filteredTotalValue, setFilteredTotalValue] = useState(0);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);
  const [processingMenuAction, setProcessingMenuAction] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkSettlementItems, setBulkSettlementItems] = useState<Record<string, BulkSettlementItemForm>>({});
  const [paymentDetailsRecord, setPaymentDetailsRecord] = useState<TransactionRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TransactionRecord | null>(null);
  const [bulkSettlementForm, setBulkSettlementForm] = useState({
    bankAccountId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    metodo: "",
    printReceipt: false,
  });
  const [form, setForm] = useState({
    descricao: "",
    categoryId: "",
    centroCusto: "",
    valor: "",
    vencimento: "",
    metodo: "",
    observacoes: "",
    recorrenciaAtiva: false,
    mesesRecorrencia: "",
  });

  useEffect(() => {
    let active = true;

    async function loadContactOptions() {
      const [membersResponse, suppliersData] = await Promise.all([
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
      const suppliersRows = Array.isArray(suppliersData) ? (suppliersData as ContactOption[]) : [];

      if (!active) {
        return;
      }

      const nextOptions = [
        ...membersRows
          .filter((item) => item?.nome)
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            type: "member" as const,
            status: item.status,
          })),
        ...suppliersRows
          .filter((item) => item?.nome && item.ativo !== false)
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            type: "supplier" as const,
            ativo: item.ativo,
          })),
      ];

      setContactOptions(
        Array.from(new Map(nextOptions.map((item) => [`${item.type}-${item.nome}`, item])).values()).sort(
          (left, right) => left.nome.localeCompare(right.nome, "pt-BR")
        )
      );
    }

    void loadContactOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const today = new Date();

    if (periodPreset === "NO_FILTER") {
      setMonth("");
      setStartDate("");
      setEndDate("");
      return;
    }

    if (periodPreset === "TODAY") {
      const todayFormatted = formatDateInput(today);
      setMonth("");
      setStartDate(todayFormatted);
      setEndDate(todayFormatted);
      return;
    }

    if (periodPreset === "LAST_30_DAYS") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setMonth("");
      setStartDate(formatDateInput(start));
      setEndDate(formatDateInput(today));
      return;
    }

    if (periodPreset === "WEEK") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setMonth("");
      setStartDate(formatDateInput(start));
      setEndDate(formatDateInput(today));
      return;
    }

    if (periodPreset === "MONTH") {
      setMonth(selectedMonthKey);
      setStartDate("");
      setEndDate("");
      return;
    }

    if (periodPreset === "NO_COMPETENCE") {
      setMonth("");
      setStartDate("");
      setEndDate("");
      return;
    }
  }, [periodPreset, selectedMonthKey]);

  useEffect(() => {
    setPage(1);
  }, [activePayablePage, search, status, month, startDate, endDate, perPage, categoryFilter, methodFilter, sellerFilter]);

  useEffect(() => {
    setSelectedRecordIds([]);
    setShowBulkSettlementModal(false);
  }, [activePayablePage, transactionType, page, perPage, search, status, month, startDate, endDate, categoryFilter, methodFilter, sellerFilter]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const target = event.target as HTMLElement;

      if (target.closest('[data-finance-popover="true"]')) {
        return;
      }

      setShowPeriodFilters(false);
      setShowFilters(false);
      setShowTopActionsMenu(false);
      setMenuOpenId(null);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      setLoading(true);

      const params = new URLSearchParams({
        tipo: transactionType,
        sourcePage: activePayablePage,
        page: String(page),
        perPage: String(perPage),
      });

      if (externalSourceFilter) params.set("externalSource", externalSourceFilter);
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (methodFilter) params.set("metodo", methodFilter);
      if (sellerFilter) params.set("seller", sellerFilter);
      if (month) params.set("month", month);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (periodPreset === "NO_COMPETENCE" && transactionType === "INCOME") {
        params.set("activeMembersOnly", "true");
      }

      const response = await fetch(`/api/finance/transactions?${params.toString()}`);
      const data = (await response.json()) as TransactionsResponse;

      if (!active) {
        return;
      }

      setRecords(Array.isArray(data.data) ? (data.data as TransactionRecord[]) : []);
      setPagination({
        page: data.pagination?.page || 1,
        perPage: data.pagination?.perPage || perPage,
        total: data.pagination?.total || 0,
        pages: data.pagination?.pages || 1,
      });
      setFilteredTotalValue(Number(data.totalValue || 0));
      onBucketsLoaded(data);
      setLoading(false);
    }

    void loadRecords();

    return () => {
      active = false;
    };
  }, [
    activePayablePage,
    endDate,
    month,
    onBucketsLoaded,
    page,
    perPage,
    periodPreset,
    search,
    sellerFilter,
    startDate,
    status,
    transactionType,
    refreshToken,
    externalSourceFilter,
    categoryFilter,
    methodFilter,
  ]);

  const formTitle = editingRecord
    ? `Editar ${itemLabel}`
    : `Incluir ${itemLabel}`;

  function openCreateModal() {
    setEditingRecord(null);
    setForm({
      descricao: "",
      categoryId: categories[0]?.id || "",
      centroCusto: "",
      valor: "",
      vencimento: "",
      metodo: "",
      observacoes: "",
      recorrenciaAtiva: false,
      mesesRecorrencia: "",
    });
    setIsFormOpen(true);
  }

  function openEditModal(record: TransactionRecord) {
    setEditingRecord(record);
    setForm({
      descricao: typeof record.descricao === "string" ? record.descricao : "",
      categoryId:
        typeof record.categoryId === "string"
          ? record.categoryId
          : typeof record.category?.id === "string"
            ? record.category.id
            : categories[0]?.id || "",
      centroCusto: typeof record.centroCusto === "string" ? record.centroCusto : "",
      valor: String(numberValue(record.valor) || ""),
      vencimento:
        typeof record.vencimento === "string" ? record.vencimento.slice(0, 10) : "",
      metodo: typeof record.metodo === "string" ? record.metodo : "",
      observacoes:
        typeof record.observacoes === "string" ? record.observacoes : "",
      recorrenciaAtiva: false,
      mesesRecorrencia: "",
    });
    setIsFormOpen(true);
    setMenuOpenId(null);
  }

  async function loadCurrentPage() {
    setLoading(true);

    const params = new URLSearchParams({
      tipo: transactionType,
      sourcePage: activePayablePage,
      page: String(page),
      perPage: String(perPage),
    });

    if (externalSourceFilter) params.set("externalSource", externalSourceFilter);
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (methodFilter) params.set("metodo", methodFilter);
    if (sellerFilter) params.set("seller", sellerFilter);
    if (month) params.set("month", month);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const response = await fetch(`/api/finance/transactions?${params.toString()}`);
    const data = (await response.json()) as TransactionsResponse;

    setRecords(Array.isArray(data.data) ? (data.data as TransactionRecord[]) : []);
    setPagination({
      page: data.pagination?.page || 1,
      perPage: data.pagination?.perPage || perPage,
      total: data.pagination?.total || 0,
      pages: data.pagination?.pages || 1,
    });
    setFilteredTotalValue(Number(data.totalValue || 0));
    onBucketsLoaded(data);
    setLoading(false);
  }

  const selectedRecords = records.filter((record) => selectedRecordIds.includes(record.id));
  const selectedRecordsMap = new Set(selectedRecordIds);
  const selectableRecords = records.filter((record) => canTriggerSettlement(record));
  const selectableRecordIds = selectableRecords.map((record) => record.id);
  const allSelectableChecked =
    selectableRecordIds.length > 0 &&
    selectableRecordIds.every((id) => selectedRecordsMap.has(id));
  const someSelectableChecked =
    selectableRecordIds.some((id) => selectedRecordsMap.has(id)) && !allSelectableChecked;
  const bulkTotalAmount = selectedRecords.reduce((total, record) => {
    const saldo = Math.max(numberValue(record.valor) - numberValue(record.amountPaid), 0);
    const item = bulkSettlementItems[record.id];
    if (!item) {
      return total + saldo;
    }

    const nextAmount =
      Math.max(
        saldo +
          amountNumber(item.fees) +
          amountNumber(item.interest) +
          amountNumber(item.addition) -
          amountNumber(item.discount),
        0
      );

    return total + nextAmount;
  }, 0);
  const bulkCategoryLabel =
    selectedRecords.length === 1
      ? categoryName(selectedRecords[0])
      : `${selectedRecords.length} contas selecionadas`;
  const bulkHistoryLabel =
    selectedRecords.length === 1
      ? `Liquidação de conta a ${transactionType === "EXPENSE" ? "pagar" : "receber"} - ${text(selectedRecords[0].centroCusto)}`
      : `Liquidação em lote de ${selectedRecords.length} conta(s)`;

  function toggleRecordSelection(recordId: string) {
    setSelectedRecordIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId]
    );
  }

  function toggleAllSelectableRecords() {
    setSelectedRecordIds((current) => {
      if (allSelectableChecked) {
        return current.filter((id) => !selectableRecordIds.includes(id));
      }

      const next = new Set(current);
      selectableRecordIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  async function exportFinancialRows() {
    const params = new URLSearchParams({
      tipo: transactionType,
      sourcePage: activePayablePage,
      perPage: "100",
    });

    if (externalSourceFilter) params.set("externalSource", externalSourceFilter);
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (methodFilter) params.set("metodo", methodFilter);
    if (sellerFilter) params.set("seller", sellerFilter);
    if (month) params.set("month", month);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const rows = (await fetchAllPaginatedRows<TransactionsResponse>((pageNumber) => {
      params.set("page", String(pageNumber));
      return `/api/finance/transactions?${params.toString()}`;
    })) as TransactionRecord[];

    exportRowsToXlsx(
      rows.map((record) => {
        const valor = numberValue(record.valor);
        const pago = numberValue(record.amountPaid);
        const saldo = Math.max(valor - pago, 0);

        return {
          [transactionType === "EXPENSE" ? "Fornecedor" : "Cliente"]: text(record.centroCusto),
          Histórico: text(record.descricao),
          "Nº documento": text(record.documentNumber),
          Categoria: categoryName(record),
          Vencimento: dateOnly(record.vencimento),
          Valor: valor,
          Saldo: saldo,
          [transactionType === "EXPENSE" ? "Pago" : "Recebido"]: pago,
          Status: rawStatusLabel(record, transactionType),
          Método: paymentMethod(record.metodo),
          "Data emissão": dateOnly(record.issuedAt),
          Competência: dateOnly(record.competencia),
          "Data baixa": dateOnly(record.pagamentoEm),
          Origem: text(record.externalSource),
          "ID externo": text(record.externalId),
          Observações: text(record.observacoes),
        };
      }),
      transactionType === "EXPENSE" ? "contas-a-pagar.xlsx" : "contas-a-receber.xlsx",
      transactionType === "EXPENSE" ? "Contas a pagar" : "Contas a receber"
    );
  }

  async function printFinancialRows() {
    const popup = window.open("", "_blank", "width=1100,height=760");

    if (!popup) {
      window.alert("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.");
      return;
    }

    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Preparando impressão</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 28px; }
            .muted { color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <p class="muted">Preparando relatório para impressão...</p>
        </body>
      </html>`);
    popup.document.close();

    const params = new URLSearchParams({
      tipo: transactionType,
      sourcePage: activePayablePage,
      perPage: "100",
    });

    if (externalSourceFilter) params.set("externalSource", externalSourceFilter);
    if (search) params.set("q", search);
    if (status) params.set("status", status);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (methodFilter) params.set("metodo", methodFilter);
    if (sellerFilter) params.set("seller", sellerFilter);
    if (month) params.set("month", month);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    try {
      const rows = (await fetchAllPaginatedRows<TransactionsResponse>((pageNumber) => {
        params.set("page", String(pageNumber));
        return `/api/finance/transactions?${params.toString()}`;
      })) as TransactionRecord[];
      const activePageLabel =
        visiblePageOptions.find((option) => option.value === activePayablePage)?.label ||
        activePayablePage;
      const title = `${pageTitle} - ${
        transactionType === "INCOME" && activePayablePage === "PAGAS"
          ? "Recebidas"
          : activePageLabel
      }`;
      const logoUrl = `${window.location.origin}/logo.png`;
      const tableRows = rows
        .map((record) => {
          const valor = numberValue(record.valor);
          const pago = numberValue(record.amountPaid);
          const saldo = Math.max(valor - pago, 0);

          return `
            <tr>
              <td>${escapeHtml(text(record.centroCusto))}</td>
              <td>${escapeHtml(text(record.descricao))}</td>
              <td>${escapeHtml(text(record.documentNumber))}</td>
              <td>${escapeHtml(dateOnly(record.vencimento))}</td>
              <td>${escapeHtml(categoryName(record))}</td>
              <td class="money">${escapeHtml(money(valor))}</td>
              <td class="money">${escapeHtml(money(saldo))}</td>
              <td class="money">${escapeHtml(money(pago))}</td>
              <td>${escapeHtml(rawStatusLabel(record, transactionType))}</td>
            </tr>
          `;
        })
        .join("");

      popup.document.open();
      popup.document.write(`<!DOCTYPE html>
        <html lang="pt-BR">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>${escapeHtml(title)}</title>
            <style>
              @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
              body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 28px; }
              .print-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
              .print-logo { width: 54px; height: 54px; object-fit: contain; border-radius: 12px; }
              .brand { color: #666; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
              h1 { font-size: 24px; margin: 0 0 6px; }
              .muted { color: #666; font-size: 12px; margin-bottom: 18px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border-bottom: 1px solid #ddd; padding: 7px 6px; text-align: left; vertical-align: top; }
              th { color: #555; font-weight: 700; }
              .money { text-align: right; white-space: nowrap; }
            </style>
          </head>
          <body>
            <div class="print-header">
              <img class="print-logo" src="${escapeHtml(logoUrl)}" alt="Estrela de Olorum" />
              <div>
                <div class="brand">Estrela de Olorum</div>
                <h1>${escapeHtml(title)}</h1>
                <div class="muted">Relatório gerado com os filtros atuais. Totais e cards da tela não foram incluídos.</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>${transactionType === "EXPENSE" ? "Fornecedor" : "Cliente"}</th>
                  <th>Histórico</th>
                  <th>Nº documento</th>
                  <th>Vencimento</th>
                  <th>Categoria</th>
                  <th class="money">Valor</th>
                  <th class="money">Saldo</th>
                  <th class="money">${transactionType === "EXPENSE" ? "Pago" : "Recebido"}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || `<tr><td colspan="9" class="muted">Nenhuma conta encontrada.</td></tr>`}
              </tbody>
            </table>
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
    } catch (error) {
      popup.document.open();
      popup.document.write(`<!DOCTYPE html>
        <html lang="pt-BR">
          <head><meta charset="UTF-8" /><title>Erro na impressão</title>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
          </head>
          <body style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; margin: 28px;">
            <h1>Não foi possível gerar a impressão.</h1>
            <p>Feche esta janela e tente novamente.</p>
          </body>
        </html>`);
      popup.document.close();
      console.error(error);
    }
  }

  function openBulkSettlementModal() {
    if (!paymentAccounts.some((account) => account.ativo)) {
      window.alert(
        transactionType === "EXPENSE"
          ? "Cadastre ou ative uma conta bancária/caixa antes de gerenciar pagamentos."
          : "Cadastre ou ative uma conta bancária/caixa antes de gerenciar recebimentos."
      );
      return;
    }

    if (!selectedRecords.length) {
      window.alert(
        transactionType === "EXPENSE"
          ? "Selecione pelo menos uma conta para gerenciar os pagamentos."
          : "Selecione pelo menos uma conta para gerenciar os recebimentos."
      );
      return;
    }

    const nextItems = Object.fromEntries(
      selectedRecords.map((record) => {
        const saldo = Math.max(numberValue(record.valor) - numberValue(record.amountPaid), 0);
        const categoryId =
          typeof record.categoryId === "string" && record.categoryId
            ? record.categoryId
            : typeof record.category?.id === "string"
              ? record.category.id
              : categories[0]?.id || "";

        return [
          record.id,
          {
            categoryId,
            fees: "0,00",
            interest: "0,00",
            discount: "0,00",
            addition: "0,00",
            amount: saldo.toFixed(2).replace(".", ","),
          } satisfies BulkSettlementItemForm,
        ];
      })
    );

    setBulkSettlementItems(nextItems);
    setShowBulkSettlementDetails(false);
    setBulkSettlementForm((current) => ({
      ...current,
      metodo: current.metodo || "",
    }));
    setShowBulkSettlementModal(true);
  }

  function updateBulkSettlementItem(
    recordId: string,
    field: keyof BulkSettlementItemForm,
    value: string
  ) {
    setBulkSettlementItems((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] || {
          categoryId: categories[0]?.id || "",
          fees: "0,00",
          interest: "0,00",
          discount: "0,00",
          addition: "0,00",
          amount: "0,00",
        }),
        [field]: value,
      },
    }));
  }

  async function submitBulkSettlement() {
    if (!bulkSettlementForm.bankAccountId) {
      window.alert("Selecione a conta de destino/origem.");
      return;
    }

    if (!selectedRecords.length) {
      window.alert("Nenhuma conta selecionada para processar.");
      return;
    }

    setBulkProcessing(true);

    try {
      for (const record of selectedRecords) {
        const settlementItem = bulkSettlementItems[record.id];
        const response = await fetch(
          `/api/finance/transactions/${record.id}/${transactionType === "EXPENSE" ? "pay" : "receive"}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bankAccountId: bulkSettlementForm.bankAccountId,
              paymentDate: bulkSettlementForm.paymentDate,
              metodo: bulkSettlementForm.metodo,
              amount: settlementItem?.amount,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Não foi possível ${transactionType === "EXPENSE" ? "pagar" : "receber"} uma das contas selecionadas.`
          );
        }

        if (bulkSettlementForm.printReceipt) {
          if (transactionType === "EXPENSE") {
            await printReceipt(record);
          } else {
            await printReceipt(record);
          }
        }
      }

      setSelectedRecordIds([]);
      setShowBulkSettlementModal(false);
      await loadCurrentPage();
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : `Não foi possível concluir ${transactionType === "EXPENSE" ? "os pagamentos" : "os recebimentos"}.`
      );
    } finally {
      setBulkProcessing(false);
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const applyFutureRecurrence = editingRecord
      ? window.confirm(
          "Deseja aplicar esta alteração também nas recorrências futuras?\n\nOK = alterar este mês e os meses futuros\nCancelar = alterar somente este mês"
        )
      : false;

    const payload = {
      tipo: transactionType,
      descricao: form.descricao,
      categoryId: form.categoryId,
      centroCusto: form.centroCusto,
      valor: form.valor,
      vencimento: form.vencimento,
      metodo: form.metodo,
      observacoes: form.observacoes,
      recorrenciaAtiva: form.recorrenciaAtiva,
      mesesRecorrencia: form.mesesRecorrencia,
      applyFutureRecurrence,
    };

    const response = await fetch(
      editingRecord ? `/api/finance/transactions/${editingRecord.id}` : "/api/finance/transactions",
      {
        method: editingRecord ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || `Não foi possível salvar ${itemLabel}.`);
      return;
    }

    setIsFormOpen(false);
    setEditingRecord(null);
    await loadCurrentPage();
    router.refresh();
  }

  async function removeRecord(record: TransactionRecord) {
    setMenuOpenId(null);

    if (String(record.status) === "PAID") {
      window.alert(
        transactionType === "EXPENSE"
          ? "Estorne o pagamento antes de excluir esta conta."
          : "Estorne ou cancele o recebimento antes de excluir esta conta."
      );
      return;
    }

    if (!window.confirm(`Deseja excluir ${itemLabel}?`)) {
      return;
    }

    const deleteFutureRecurrence = window.confirm(
      "Deseja excluir também as recorrências futuras desta conta?\n\nOK = excluir este mês e os meses futuros\nCancelar = excluir somente este mês"
    );
    const deleteUrl = deleteFutureRecurrence
      ? `/api/finance/transactions/${record.id}?scope=future`
      : `/api/finance/transactions/${record.id}`;

    const response = await fetch(deleteUrl, {
      method: "DELETE",
    });

    if (!response.ok) {
      window.alert(`Não foi possível excluir ${itemLabel}.`);
      return;
    }

    await loadCurrentPage();
    router.refresh();
  }

  async function cloneRecord(record: TransactionRecord) {
    setProcessingMenuAction(record.id);

    const payload = {
      tipo: transactionType,
      descricao: typeof record.descricao === "string" ? record.descricao : "",
      categoryId:
        typeof record.categoryId === "string"
          ? record.categoryId
          : typeof record.category?.id === "string"
            ? record.category.id
            : "",
      centroCusto: typeof record.centroCusto === "string" ? record.centroCusto : "",
      valor: numberValue(record.valor),
      metodo: typeof record.metodo === "string" ? record.metodo : "",
      vencimento:
        typeof record.vencimento === "string" ? record.vencimento.slice(0, 10) : "",
      issuedAt:
        typeof record.issuedAt === "string" ? record.issuedAt.slice(0, 10) : "",
      competencia:
        typeof record.competencia === "string" ? record.competencia.slice(0, 10) : "",
      documentNumber:
        typeof record.documentNumber === "string" ? record.documentNumber : "",
      observacoes:
        typeof record.observacoes === "string" ? record.observacoes : "",
      status: resolvePendingStatusByDueDate(record.vencimento),
      rawStatus: "Em aberto",
    };

    const response = await fetch("/api/finance/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || `Não foi possível clonar ${itemLabel}.`);
      setProcessingMenuAction(null);
      return;
    }

    setMenuOpenId(null);
    setProcessingMenuAction(null);
    await loadCurrentPage();
    router.refresh();
  }

  async function reversePayment(record: TransactionRecord) {
    const confirmed = window.confirm(
      transactionType === "EXPENSE"
        ? "Deseja estornar este pagamento? O saldo da conta escolhida em Caixa e Bancos será ajustado."
        : "Deseja estornar este recebimento? O saldo da conta escolhida em Caixa e Bancos será ajustado."
    );

    if (!confirmed) {
      return;
    }

    setProcessingMenuAction(record.id);

    const response = await fetch(`/api/finance/transactions/${record.id}/reverse`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível estornar esta movimentação.");
      setProcessingMenuAction(null);
      return;
    }

    setMenuOpenId(null);
    setProcessingMenuAction(null);
    await loadCurrentPage();
    router.refresh();
  }

  async function cancelRecord(record: TransactionRecord) {
    if (String(record.status) === "PAID") {
      window.alert("Esta conta já foi recebida. Estorne o recebimento antes de cancelar.");
      return;
    }

    const confirmed = window.confirm("Deseja cancelar esta conta?");

    if (!confirmed) {
      return;
    }

    setProcessingMenuAction(record.id);

    const response = await fetch(`/api/finance/transactions/${record.id}/cancel`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível cancelar esta conta.");
      setProcessingMenuAction(null);
      return;
    }

    setMenuOpenId(null);
    setProcessingMenuAction(null);
    await loadCurrentPage();
    router.refresh();
  }

  async function emitCharge(record: TransactionRecord) {
    setProcessingMenuAction(record.id);

    const response = await fetch(`/api/finance/transactions/${record.id}/charge`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível emitir a cobrança.");
      setProcessingMenuAction(null);
      return;
    }

    setMenuOpenId(null);
    setProcessingMenuAction(null);

    if (data?.whatsappUrl) {
      window.open(String(data.whatsappUrl), "_blank", "noopener,noreferrer");
      return;
    }

    if (data?.paymentLink) {
      window.open(String(data.paymentLink), "_blank", "noopener,noreferrer");
      return;
    }

    window.alert("Cobrança emitida com sucesso.");
  }

  async function printReceipt(record: TransactionRecord) {
    try {
      await printReceiptTemplate(record.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível imprimir o recibo.");
    }
  }

  async function printDuplicate(record: TransactionRecord) {
    try {
      await printDuplicateTemplate(record.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível imprimir a duplicata.");
    }
  }

  function openPaymentDetails(record: TransactionRecord) {
    setPaymentDetailsRecord(record);
    setMenuOpenId(null);
  }

  function canTriggerSettlement(record: TransactionRecord) {
    return String(record.status) !== "PAID" && String(record.status) !== "CANCELED";
  }

  function openAdvancedFilters() {
    setDraftCategoryFilter(categoryFilter);
    setDraftMethodFilter(methodFilter);
    setDraftSellerFilter(sellerFilter);
    setShowFilters(true);
  }

  function cancelAdvancedFilters() {
    setDraftCategoryFilter(categoryFilter);
    setDraftMethodFilter(methodFilter);
    setDraftSellerFilter(sellerFilter);
    setShowFilters(false);
  }

  function applyAdvancedFilters() {
    setCategoryFilter(draftCategoryFilter);
    setMethodFilter(draftMethodFilter);
    setSellerFilter(draftSellerFilter);
    setShowFilters(false);
  }

  function clearAllFilters() {
    setSearch("");
    setStatus("");
    setCategoryFilter("");
    setMethodFilter("");
    setSellerFilter("");
    setDraftCategoryFilter("");
    setDraftMethodFilter("");
    setDraftSellerFilter("");
    setMonth("");
    setStartDate("");
    setEndDate("");
    setPeriodPreset("NO_FILTER");
    setSelectedMonthKey(formatMonthKey(new Date()));
    setShowFilters(false);
    setShowPeriodFilters(false);
  }

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(status) ||
    Boolean(categoryFilter) ||
    Boolean(methodFilter) ||
    Boolean(sellerFilter) ||
    Boolean(month) ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    periodPreset !== "NO_FILTER";

  const searchSuggestions = useMemo(() => {
    const term = normalizeSearchText(search);

    if (term.length < 2) {
      return [];
    }

    return contactOptions
      .filter((option) => nameMatchesSearchSuggestion(option.nome, term))
      .slice(0, 10);
  }, [contactOptions, search]);

  function selectSearchSuggestion(value: string) {
    setSearch(value);
    setSearchSuggestionIndex(0);
    setSearchSuggestionsOpen(false);
    setPage(1);
  }

  const periodPresetOptions: Array<{ value: PeriodPreset; label: string }> = [
    { value: "LAST_30_DAYS", label: "últimos 30 dias" },
    { value: "NO_FILTER", label: "sem filtro" },
    { value: "TODAY", label: "do dia" },
    { value: "WEEK", label: "da semana" },
    { value: "MONTH", label: "do mês" },
    { value: "INTERVAL", label: "intervalo" },
    { value: "NO_COMPETENCE", label: "sem competência" },
  ];
  const selectedPeriodButtonLabel =
    periodPreset === "MONTH" ? formatMonthLabel(selectedMonthKey) : "por período";

  return (
    <div className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#EEE7D9] pb-4">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
              <span>início</span>
              <span>—</span>
              <span>finanças</span>
              <span className="font-medium text-[#191919]">{pageTitle.toLowerCase()}</span>
            </div>

            <div>
              <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SpreadsheetImportActions resource={transactionType === "EXPENSE" ? "payables" : "receivables"} />
            <button type="button" onClick={() => void exportFinancialRows()} className="inline-flex items-center rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]">Exportar planilha</button>
            <button
              type="button"
              onClick={() => void printFinancialRows()}
              className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
            >
              <Printer size={16} />
              imprimir
            </button>

            {allowPayment && (
            <button
              type="button"
              onClick={openBulkSettlementModal}
              className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
            >
              <Wallet size={16} />
              {transactionType === "EXPENSE" ? "gerenciar pagamentos" : "gerenciar recebimentos"}
            </button>
            )}

            <button
              type="button"
              onClick={() =>
                router.push(
                  transactionType === "EXPENSE"
                    ? "/dashboard/financeiro/contas-pagar/nova"
                    : "/dashboard/financeiro/contas-receber/nova"
                )
              }
              className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} />
              {`incluir ${itemLabel}`}
            </button>

            <div data-finance-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowTopActionsMenu((current) => !current);
                  setShowPeriodFilters(false);
                  setShowFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
              >
                mais ações
                <MoreHorizontal size={16} />
              </button>

              {showTopActionsMenu && (
                <DraggablePopover
                  onClose={() => setShowTopActionsMenu(false)}
                  className="absolute right-0 top-[calc(100%+10px)] z-30 min-w-[270px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                >
                  {allowPayment && selectedRecords.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowTopActionsMenu(false);
                        openBulkSettlementModal();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#1D1B18] hover:bg-[#F7F4EE]"
                    >
                      <CheckCircle2 size={16} className="text-[#2F5BFF]" />
                      {transactionType === "EXPENSE"
                        ? `pagar ${selectedRecords.length} conta(s)`
                        : `receber ${selectedRecords.length} conta(s)`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setShowTopActionsMenu(false);
                      void exportFinancialRows();
                    }}
                    className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#1D1B18] hover:bg-[#F7F4EE]"
                  >
                    exportar Excel
                  </button>
                </DraggablePopover>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[320px] flex-1">
              <label className="flex items-center gap-3 rounded-2xl border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#7A746A]">
                <Search size={18} className="text-[#A1988B]" />
                <input
                  value={search}
                  onFocus={() => setSearchSuggestionsOpen(true)}
                  onBlur={() => setSearchSuggestionsOpen(false)}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSearchSuggestionIndex(0);
                    setSearchSuggestionsOpen(true);
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
                      selectSearchSuggestion(searchSuggestions[searchSuggestionIndex]?.nome || search);
                    }
                  }}
                  placeholder={`Pesquise por ${partyLabel.toLowerCase()} ou nº doc`}
                  className="w-full bg-transparent outline-none placeholder:text-[#A1988B]"
                />
              </label>

              {searchSuggestionsOpen && searchSuggestions.length > 0 && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-40 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#E9E1D2] bg-white p-2 shadow-xl">
                  {searchSuggestions.map((option, index) => (
                    <button
                      key={`${option.type}-${option.id}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSearchSuggestion(option.nome);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                        index === searchSuggestionIndex
                          ? "bg-[#EEF4FF] text-[#1D3E92]"
                          : "text-[#1D1B18] hover:bg-[#F7F4EE]"
                      }`}
                    >
                      <span className="font-semibold">{option.nome}</span>
                      <span className="text-xs text-[#8B8478]">
                        {option.type === "supplier" ? "Fornecedor" : "Membro"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div data-finance-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowPeriodFilters((current) => !current);
                  setShowFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] px-4 py-2.5 text-sm font-medium text-[#1D1B18]"
              >
                <CalendarDays size={16} />
                {selectedPeriodButtonLabel}
              </button>

              {showPeriodFilters && (
                <DraggablePopover
                  onClose={() => setShowPeriodFilters(false)}
                  className="absolute right-0 top-[calc(100%+12px)] z-30 w-[min(520px,calc(100vw-32px))] rounded-[24px] border border-[#E9E1D2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD0FF] px-4 py-2 text-sm font-medium text-[#1D1B18]">
                    <CalendarDays size={16} />
                    por período
                  </div>

                  <div className="mt-5">
                    <p className="mb-3 text-sm text-[#6E675C]">Período</p>
                    <div className="flex flex-wrap gap-2">
                      {periodPresetOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          data-popover-keep-open={
                            option.value === "INTERVAL" || option.value === "MONTH" ? "true" : undefined
                          }
                          onClick={() => {
                            setPeriodPreset(option.value);
                            if (option.value !== "INTERVAL" && option.value !== "MONTH") {
                              setShowPeriodFilters(false);
                            }
                          }}
                          className={`rounded-full border px-4 py-2 text-sm ${
                            periodPreset === option.value
                              ? "border-[#BFD0FF] text-[#2F5BFF]"
                              : "border-[#E9E1D2] text-[#1D1B18]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {periodPreset === "MONTH" && (
                      <div className="mt-5">
                        <p className="mb-3 text-sm text-[#6E675C]">Competência</p>
                        <div className="flex items-center gap-3 rounded-2xl border border-[#E9E1D2] bg-white px-3 py-2">
                          <button
                            type="button"
                            data-popover-keep-open="true"
                            onClick={() => setSelectedMonthKey((current) => shiftMonthKey(current, -1))}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#1D1B18]"
                            aria-label="Mês anterior"
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <div className="flex-1 text-center">
                            <div className="text-base font-medium text-[#1D1B18]">
                              {formatMonthYearLabel(selectedMonthKey)}
                            </div>
                            <div className="text-sm text-[#6E675C]">
                              {formatMonthLabel(selectedMonthKey)}
                            </div>
                          </div>
                          <button
                            type="button"
                            data-popover-keep-open="true"
                            onClick={() => setSelectedMonthKey((current) => shiftMonthKey(current, 1))}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#1D1B18]"
                            aria-label="Próximo mês"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    )}

                    {periodPreset === "INTERVAL" && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(event) => setStartDate(event.target.value)}
                          className="rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                        />
                        <input
                          type="date"
                          value={endDate}
                          onChange={(event) => setEndDate(event.target.value)}
                          className="rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                        />
                      </div>
                    )}
                  </div>
                </DraggablePopover>
              )}
            </div>

            <div className="inline-flex items-center rounded-full border border-[#E9E1D2] px-4 py-2.5 text-sm font-medium text-[#1D1B18]">
              {pageTitle.toLowerCase()}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium text-[#1D1B18] hover:bg-[#F7F4EE]"
              >
                <X size={15} />
                limpar filtros
              </button>
            )}

            <div data-finance-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  openAdvancedFilters();
                  setShowPeriodFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] px-4 py-2.5 text-sm font-medium text-[#1D1B18]"
              >
                <Filter size={16} />
                filtros
              </button>

              {showFilters && (
                <DraggablePopover
                  onClose={() => setShowFilters(false)}
                  className="absolute right-0 top-[calc(100%+12px)] z-30 w-[360px] max-w-[calc(100vw-48px)] rounded-[24px] border border-[#E9E1D2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD0FF] px-4 py-2 text-sm font-medium text-[#1D1B18]">
                    <Funnel size={16} />
                    filtros
                  </div>

                  <div className="mt-6 space-y-4">
                    {transactionType === "INCOME" ? (
                      <>
                        <label className="block space-y-2">
                          <span className="text-sm text-[#6E675C]">Categoria</span>
                          <select
                            value={draftCategoryFilter}
                            onChange={(event) => setDraftCategoryFilter(event.target.value)}
                            className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                          >
                            <option value="">Todas</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.nome}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-[#6E675C]">Forma de recebimento</span>
                          <select
                            value={draftMethodFilter}
                            onChange={(event) => setDraftMethodFilter(event.target.value)}
                            className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                          >
                            <option value="">Todas</option>
                            {methodOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-[#6E675C]">Vendedor</span>
                          <input
                            value={draftSellerFilter}
                            onChange={(event) => setDraftSellerFilter(event.target.value)}
                            placeholder="Nome do vendedor"
                            className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none placeholder:text-[#A1988B]"
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="block space-y-2">
                          <span className="text-sm text-[#6E675C]">Status</span>
                          <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                            className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                          >
                            <option value="">Todos os status</option>
                            {statusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm text-[#6E675C]">Itens por página</span>
                          <select
                            value={perPage}
                            onChange={(event) => setPerPage(Number(event.target.value))}
                            className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                          >
                            {[10, 20, 50, 100].map((value) => (
                              <option key={value} value={value}>
                                {value}/página
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>

                  {transactionType === "INCOME" && (
                    <div className="mt-6 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={applyAdvancedFilters}
                        className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white"
                      >
                        aplicar
                      </button>
                      <button
                        type="button"
                        onClick={cancelAdvancedFilters}
                        className="text-sm font-medium text-[#1D1B18]"
                      >
                        cancelar
                      </button>
                    </div>
                  )}
                </DraggablePopover>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-7 pt-1">
          {visiblePageOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangePayablePage(option.value)}
              className={`border-b-2 pb-1.5 text-left transition ${
                option.value === activePayablePage
                  ? "border-[#43D17C] text-[#171717]"
                  : "border-transparent text-[#6E675C]"
              }`}
            >
              <div className="text-[13px] capitalize leading-none">
                {transactionType === "INCOME" && option.value === "PAGAS"
                  ? "recebidas"
                  : option.label.toLowerCase()}
              </div>
              <div className="mt-1 text-[15px] leading-none font-semibold tracking-[-0.02em]">
                {payableBuckets[option.value] || 0}
              </div>
              <div className="mt-1 text-[12px] leading-none text-[#9B9488]">
                {money(payableBucketTotals[option.value] || 0)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full min-w-[1220px] text-left">
          <thead>
            <tr className="border-b border-[#EEE7D9] text-sm text-[#7A746A]">
              <th className="w-10 px-3 py-4">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someSelectableChecked;
                    }
                  }}
                  onChange={toggleAllSelectableRecords}
                  className="h-4 w-4 rounded border-[#D9D0C1]"
                />
              </th>
              <th className="px-3 py-4">{partyLabel}</th>
              <th className="px-3 py-4">Histórico</th>
              <th className="px-3 py-4">Nº documento</th>
              <th className="px-3 py-4">Vencimento</th>
              <th className="px-3 py-4 text-right">Valor</th>
              <th className="px-3 py-4 text-right">Saldo</th>
              <th className="px-3 py-4 text-right">{transactionType === "EXPENSE" ? "Pago" : "Recebido"}</th>
              <th className="px-3 py-4">Marcadores</th>
              <th className="px-3 py-4">Forma</th>
              {allowPayment && <th className="px-3 py-4 text-center">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={allowPayment ? 11 : 10} className="px-3 py-12 text-center text-[#8B8478]">
                  {`Carregando ${pageTitle.toLowerCase()}...`}
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={allowPayment ? 11 : 10} className="px-3 py-12 text-center text-[#8B8478]">
                  Nenhuma conta encontrada para os filtros atuais.
                </td>
              </tr>
            ) : (
              records.map((record, index) => {
                const valor = numberValue(record.valor);
                const pago = numberValue(record.amountPaid);
                const saldo = Math.max(valor - pago, 0);
                const shouldOpenMenuUpwards = records.length - index <= 3;

                return (
                  <tr
                    key={record.id}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;

                      if (
                        target.closest(
                          "button,input,a,select,textarea,[data-finance-popover='true']"
                        )
                      ) {
                        return;
                      }

                      router.push(`/dashboard/financeiro/transacoes/${record.id}`);
                    }}
                    className="cursor-pointer border-b border-[#F0E9DC] text-[15px] text-[#171717] transition hover:bg-[#FAF8F3]"
                  >
                    <td className="px-3 py-4 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedRecordsMap.has(record.id)}
                        disabled={!canTriggerSettlement(record)}
                        onChange={() => toggleRecordSelection(record.id)}
                        className="h-4 w-4 rounded border-[#D9D0C1]"
                      />
                    </td>
                    <td className="relative px-3 py-4 align-middle font-medium">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            const nextOpen = menuOpenId === record.id ? null : record.id;
                            setMenuOpenId(nextOpen);
                            setMenuAnchorRect(nextOpen ? event.currentTarget.getBoundingClientRect() : null);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#A1988B] hover:bg-[#F6F1E6]"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        <span>{text(record.centroCusto)}</span>
                      </div>
                      {menuOpenId === record.id && (
                        <FloatingDraggablePopover
                          anchorRect={menuAnchorRect}
                          onClose={() => {
                            setMenuOpenId(null);
                            setMenuAnchorRect(null);
                          }}
                          placement={shouldOpenMenuUpwards ? "top-start" : "bottom-start"}
                          width={256}
                          className="w-64 rounded-2xl border border-[#E9E1D2] bg-white p-2 shadow-xl"
                        >
                          {transactionType === "EXPENSE" ? (
                            <>
                              {String(record.status) === "PAID" ? (
                                <button
                                  type="button"
                                  disabled={processingMenuAction === record.id}
                                  onClick={() => void reversePayment(record)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                                >
                                  <RotateCcw size={16} />
                                  {processingMenuAction === record.id ? "Estornando..." : "Estornar pagamento"}
                                </button>
                              ) : allowPayment ? (
                                <button
                                  type="button"
                                  disabled={!canTriggerSettlement(record)}
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    onOpenPayment(record);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7] disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  <CheckCircle2 size={16} />
                                  pagar (baixar conta)
                                </button>
                              ) : null}

                              <button
                                type="button"
                                disabled={processingMenuAction === record.id}
                                onClick={() => void cloneRecord(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Copy size={16} />
                                {processingMenuAction === record.id ? "Clonando..." : "Clonar conta"}
                              </button>

                              <button
                                type="button"
                                onClick={() => openPaymentDetails(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Eye size={16} />
                                Exibir pagamentos
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  void printReceipt(record);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Printer size={16} />
                                Imprimir recibo
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  window.alert("Edição de anexos será ligada nesse mesmo menu.");
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Pencil size={16} />
                                Editar anexos
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  window.alert("Edição de marcadores será ligada nesse mesmo menu.");
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <CircleDot size={16} />
                                Editar marcadores
                              </button>
                            </>
                          ) : (
                            <>
                              {String(record.status) === "PAID" ? (
                                <button
                                  type="button"
                                  disabled={processingMenuAction === record.id}
                                  onClick={() => void reversePayment(record)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7] disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  <RotateCcw size={16} />
                                  {processingMenuAction === record.id ? "Estornando..." : "Estornar recebimento"}
                                </button>
                              ) : allowPayment ? (
                                <button
                                  type="button"
                                  disabled={!canTriggerSettlement(record)}
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    onOpenPayment(record);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7] disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  <CheckCircle2 size={16} />
                                  receber (baixar conta)
                                </button>
                              ) : null}

                              <button
                                type="button"
                                disabled={processingMenuAction === record.id}
                                onClick={() => void cloneRecord(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Copy size={16} />
                                {processingMenuAction === record.id ? "Clonando..." : "Clonar conta"}
                              </button>

                              <button
                                type="button"
                                disabled={processingMenuAction === record.id}
                                onClick={() => void emitCharge(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Send size={16} />
                                {processingMenuAction === record.id ? "Emitindo..." : "Emitir cobrança"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  void printReceipt(record);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <Printer size={16} />
                                Imprimir recibo
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenId(null);
                                  void printDuplicate(record);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#171717] hover:bg-[#F7F2E7]"
                              >
                                <FileText size={16} />
                                Imprimir duplicata
                              </button>

                              <button
                                type="button"
                                disabled={processingMenuAction === record.id}
                                onClick={() => void cancelRecord(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                <X size={16} />
                                {processingMenuAction === record.id ? "Cancelando..." : "Cancelar conta"}
                              </button>

                              <button
                                type="button"
                                disabled={processingMenuAction === record.id}
                                onClick={() => void removeRecord(record)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                              <Trash2 size={16} />
                              Excluir conta
                            </button>
                          </>
                        )}
                        </FloatingDraggablePopover>
                      )}
                    </td>
                    <td className="px-3 py-4 align-middle">{text(record.descricao)}</td>
                    <td className="px-3 py-4 align-middle">{text(record.documentNumber)}</td>
                    <td className="px-3 py-4 align-middle font-medium">{dateOnly(record.vencimento)}</td>
                    <td className="px-3 py-4 text-right align-middle font-medium">{money(valor)}</td>
                    <td className="px-3 py-4 text-right align-middle font-medium">{money(saldo)}</td>
                    <td className="px-3 py-4 text-right align-middle font-medium">{money(pago)}</td>
                    <td className="px-3 py-4 align-middle">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F2EEE5] text-[#8D8678]">
                        <CircleDot size={14} />
                      </span>
                    </td>
                    <td className="px-3 py-4 align-middle">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`inline-block h-3 w-3 rounded-full ${statusBadgeColor(record.status)}`} />
                        <span className="text-sm text-[#6E675C]">
                          {rawStatusLabel(record, transactionType)}
                        </span>
                        <ChevronDown size={16} className="text-[#A1988B]" />
                      </div>
                    </td>
                    {allowPayment && (
                    <td className="px-3 py-4 text-center align-middle">
                      <button
                        type="button"
                        disabled={!canTriggerSettlement(record) || !paymentAccounts.some((account) => account.ativo)}
                        onClick={() => {
                          if (!paymentAccounts.some((account) => account.ativo)) {
                            window.alert(
                              transactionType === "EXPENSE"
                                ? "Cadastre ou ative uma conta bancária/caixa antes de pagar."
                                : "Cadastre ou ative uma conta bancária/caixa antes de receber."
                            );
                            return;
                          }

                          onOpenPayment(record);
                        }}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                          !canTriggerSettlement(record)
                            ? "cursor-not-allowed bg-slate-100 text-slate-400"
                            : "bg-[#2F5BFF] text-white hover:bg-[#254be0]"
                        }`}
                      >
                        <Wallet size={15} />
                        {!canTriggerSettlement(record)
                          ? transactionType === "EXPENSE"
                            ? String(record.status) === "CANCELED"
                              ? "Cancelada"
                              : "Pago"
                            : String(record.status) === "CANCELED"
                              ? "Cancelada"
                              : "Recebido"
                          : transactionType === "EXPENSE"
                            ? "Pagar"
                            : "Receber"}
                      </button>
                    </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showBulkSettlementModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button
            type="button"
            aria-label="Fechar liquidação em lote"
            onClick={() => setShowBulkSettlementModal(false)}
            className="flex-1 cursor-default"
          />
          <section className="flex h-full w-full max-w-[920px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-7 py-8">
              <h2 className="text-[24px] font-semibold text-[#171717]">
                {transactionType === "EXPENSE" ? "Pagar contas selecionadas" : "Receber contas selecionadas"}
              </h2>
              <button
                type="button"
                onClick={() => setShowBulkSettlementModal(false)}
                className="inline-flex items-center gap-2 text-[14px] text-[#171717]"
              >
                fechar
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]">
                  <X size={14} />
                </span>
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto px-7 pb-7">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">
                    {transactionType === "EXPENSE" ? "Origem" : "Destino"}
                  </span>
                  <select
                    value={bulkSettlementForm.bankAccountId}
                    onChange={(event) =>
                      setBulkSettlementForm((current) => ({
                        ...current,
                        bankAccountId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    <option value="">Selecione</option>
                    {paymentAccounts
                      .filter((account) => account.ativo)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.nome}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Data</span>
                  <input
                    type="date"
                    value={bulkSettlementForm.paymentDate}
                    onChange={(event) =>
                      setBulkSettlementForm((current) => ({
                        ...current,
                        paymentDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#AFC4FF] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-[1fr_240px]">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Categoria</span>
                  <input
                    value={bulkCategoryLabel}
                    readOnly
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Método</span>
                  <select
                    value={bulkSettlementForm.metodo}
                    onChange={(event) =>
                      setBulkSettlementForm((current) => ({
                        ...current,
                        metodo: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                  >
                    <option value="">Selecione</option>
                    {methodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-5 space-y-2">
                <span className="text-sm text-[#6E675C]">Histórico</span>
                <textarea
                  value={bulkHistoryLabel}
                  readOnly
                  className="min-h-[92px] w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                />
              </label>

              <div className="mt-5 flex items-center justify-between">
                {transactionType === "INCOME" ? (
                  <label className="inline-flex items-center gap-3 text-[15px] text-[#171717]">
                    <input
                      type="checkbox"
                      checked={bulkSettlementForm.printReceipt}
                      onChange={(event) =>
                        setBulkSettlementForm((current) => ({
                          ...current,
                          printReceipt: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-[#D9D0C1]"
                    />
                    Imprimir o recibo
                  </label>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={() => setShowBulkSettlementDetails((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
                >
                  mais
                  <MoreHorizontal size={16} />
                </button>
              </div>

              {showBulkSettlementDetails ? (
                <>
                  <div className="mt-6 border-b border-[#EEE7D9] pb-3">
                    <div className="flex items-end gap-10">
                      <div className="border-b-2 border-[#171717] pb-2 text-center text-[#171717]">
                        <div className="text-sm font-medium">referente às contas</div>
                        <div className="text-[28px] leading-none">{selectedRecords.length}</div>
                      </div>
                      <div className="pb-2 text-center text-[#6E675C]">
                        <div className="text-sm font-medium">resumo por dia</div>
                        <div className="text-[28px] leading-none">1</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-5">
                    {selectedRecords.map((record) => {
                      const saldo = Math.max(
                        numberValue(record.valor) - numberValue(record.amountPaid),
                        0
                      );
                      const item = bulkSettlementItems[record.id];

                      return (
                        <div key={record.id} className="border-b border-[#F0E9DC] pb-4">
                          <div className="grid gap-3 border-b border-[#EEE7D9] pb-4 text-sm text-[#7A746A] md:grid-cols-[1fr_160px_140px]">
                            <div>{transactionType === "EXPENSE" ? "Fornecedor" : "Cliente"}</div>
                            <div>Nº. doc</div>
                            <div className="text-right">Saldo</div>
                          </div>

                          <div className="grid gap-3 py-3 text-[15px] text-[#171717] md:grid-cols-[1fr_160px_140px] md:items-center">
                            <div>{text(record.centroCusto)}</div>
                            <div>{text(record.documentNumber)}</div>
                            <div className="flex items-center justify-end gap-3">
                              <span>{money(saldo)}</span>
                              <span className="h-3 w-3 rounded-full bg-emerald-400" />
                            </div>
                          </div>

                          <div className={`grid gap-4 ${transactionType === "EXPENSE" ? "md:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]" : "md:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]"}`}>
                            <label className="space-y-2">
                              <span className="text-sm text-[#6E675C]">Categoria</span>
                              <select
                                value={item?.categoryId || ""}
                                onChange={(event) => updateBulkSettlementItem(record.id, "categoryId", event.target.value)}
                                className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                              >
                                {categories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.nome}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {transactionType === "INCOME" ? (
                              <label className="space-y-2">
                                <span className="text-sm text-[#6E675C]">Taxas</span>
                                <input
                                  value={item?.fees || "0,00"}
                                  onChange={(event) => updateBulkSettlementItem(record.id, "fees", event.target.value)}
                                  className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                                />
                              </label>
                            ) : null}

                            <label className="space-y-2">
                              <span className="text-sm text-[#6E675C]">Juros</span>
                              <input
                                value={item?.interest || "0,00"}
                                onChange={(event) => updateBulkSettlementItem(record.id, "interest", event.target.value)}
                                className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                              />
                            </label>

                            <label className="space-y-2">
                              <span className="text-sm text-[#6E675C]">Desconto</span>
                              <input
                                value={item?.discount || "0,00"}
                                onChange={(event) => updateBulkSettlementItem(record.id, "discount", event.target.value)}
                                className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                              />
                            </label>

                            <label className="space-y-2">
                              <span className="text-sm text-[#6E675C]">Acréscimo</span>
                              <input
                                value={item?.addition || "0,00"}
                                onChange={(event) => updateBulkSettlementItem(record.id, "addition", event.target.value)}
                                className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                              />
                            </label>

                            <label className="space-y-2">
                              <span className="text-sm text-[#6E675C]">
                                {transactionType === "EXPENSE" ? "Valor pago" : "Valor recebido"}
                              </span>
                              <input
                                value={item?.amount || saldo.toFixed(2).replace(".", ",")}
                                onChange={(event) => updateBulkSettlementItem(record.id, "amount", event.target.value)}
                                className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}

              <div className="mt-auto flex items-end justify-between gap-6 pt-8">
                <div>
                  <div className="text-sm text-[#6E675C]">
                    Total {transactionType === "EXPENSE" ? "pago" : "recebido"}
                  </div>
                  <div className="mt-2 inline-flex min-w-[180px] items-center rounded-xl border border-[#E9E1D2] bg-[#F4F0E7] px-4 py-3 text-[22px] font-semibold text-[#171717]">
                    {money(bulkTotalAmount)}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setShowBulkSettlementModal(false)}
                    className="text-sm font-medium text-[#171717]"
                  >
                    cancelar
                  </button>
                  <button
                    type="button"
                    disabled={bulkProcessing}
                    onClick={() => void submitBulkSettlement()}
                    className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bulkProcessing
                      ? transactionType === "EXPENSE"
                        ? "pagando contas..."
                        : "recebendo contas..."
                      : transactionType === "EXPENSE"
                        ? "pagar contas"
                        : "receber contas"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-[#EEE7D9] pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-[#B0A89A]">
          {Array.from({ length: Math.max(pagination.pages, 1) }, (_, index) => index + 1)
            .slice(0, 5)
            .map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`h-8 min-w-8 rounded-full px-3 text-sm font-medium ${
                  pageNumber === pagination.page
                    ? "bg-[#171717] text-white"
                    : "text-[#9B9488]"
                }`}
              >
                {String(pageNumber).padStart(2, "0")}
              </button>
            ))}

          {pagination.pages > 5 && <span className="px-2 text-sm">…</span>}

          {pagination.pages > 1 && (
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, pagination.pages))}
              className="px-2 text-sm text-[#9B9488]"
            >
              →
            </button>
          )}
        </div>

        <div className="flex items-center gap-8 text-right">
          <div>
            <p className="text-[18px] font-semibold leading-none text-[#171717]">
              {pagination.total}
            </p>
            <p className="text-xs text-[#9B9488]">quantidade</p>
          </div>
          <div>
            <p className="text-[18px] font-semibold leading-none text-[#171717]">
              {money(filteredTotalValue)}
            </p>
            <p className="text-xs text-[#9B9488]">total</p>
          </div>
        </div>
      </div>

      {paymentDetailsRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[#A1988B]">Financeiro</p>
                <h2 className="text-2xl font-semibold text-[#171717]">Exibir pagamentos</h2>
              </div>
              <button
                type="button"
                onClick={() => setPaymentDetailsRecord(null)}
                className="rounded-full border border-[#E9E1D2] px-3 py-2 text-sm text-[#6E675C]"
              >
                fechar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">{partyLabel}</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {text(paymentDetailsRecord.centroCusto)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">Situação</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {rawStatusLabel(paymentDetailsRecord, transactionType)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4 md:col-span-2">
                <p className="text-xs text-[#9B9488]">Histórico</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {text(paymentDetailsRecord.descricao)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">Documento</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {text(paymentDetailsRecord.documentNumber)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">Categoria</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {categoryName(paymentDetailsRecord)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">Valor</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {money(paymentDetailsRecord.valor)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">
                  {transactionType === "EXPENSE" ? "Pago" : "Recebido"}
                </p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {money(paymentDetailsRecord.amountPaid)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">
                  {transactionType === "EXPENSE" ? "Data do pagamento" : "Data do recebimento"}
                </p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {dateOnly(paymentDetailsRecord.pagamentoEm)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4">
                <p className="text-xs text-[#9B9488]">Forma</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {paymentMethod(paymentDetailsRecord.metodo)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EEE7D9] p-4 md:col-span-2">
                <p className="text-xs text-[#9B9488]">Conta / referência</p>
                <p className="mt-1 text-sm font-medium text-[#171717]">
                  {text(paymentDetailsRecord.paymentReference)}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[#A1988B]">Financeiro</p>
                <h2 className="text-2xl font-semibold text-[#171717]">{formTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-full border border-[#E9E1D2] px-3 py-2 text-sm text-[#6E675C]"
              >
                fechar
              </button>
            </div>

            <form onSubmit={submitForm} className="grid gap-4 md:grid-cols-2">
              <input
                required
                value={form.descricao}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
                placeholder="Descrição"
                className="rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
              />
              <select
                required
                value={form.categoryId}
                onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                className="rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
              >
                <option value="">Selecione a categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nome}
                  </option>
                ))}
              </select>
              <label className="space-y-2">
                <input
                  list={`finance-contact-options-${transactionType}`}
                  value={form.centroCusto}
                  onChange={(event) => setForm((current) => ({ ...current, centroCusto: event.target.value }))}
                  placeholder={transactionType === "EXPENSE" ? "Fornecedor ou membro" : "Cliente, membro ou fornecedor"}
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                />
                <datalist id={`finance-contact-options-${transactionType}`}>
                  {contactOptions.map((option) => (
                    <option
                      key={`${option.type}-${option.id}`}
                      value={option.nome}
                      label={option.type === "supplier" ? "Fornecedor" : "Membro"}
                    />
                  ))}
                </datalist>
                <span className="block text-xs text-[#8B8478]">
                  Pesquise ou selecione membros e fornecedores cadastrados.
                </span>
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(event) => setForm((current) => ({ ...current, valor: event.target.value }))}
                placeholder="Valor"
                className="rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
              />
              <select
                value={form.metodo}
                onChange={(event) => setForm((current) => ({ ...current, metodo: event.target.value }))}
                className="rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
              >
                <option value="">Forma de pagamento</option>
                {methodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={form.vencimento}
                onChange={(event) => setForm((current) => ({ ...current, vencimento: event.target.value }))}
                className="rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
              />
              <textarea
                value={form.observacoes}
                onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                placeholder="Observações"
                className="min-h-28 rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none md:col-span-2"
              />

              {!editingRecord && (
                <div className="rounded-2xl border border-[#E9E1D2] bg-[#FBF8F2] p-4 md:col-span-2">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.recorrenciaAtiva}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recorrenciaAtiva: event.target.checked,
                            mesesRecorrencia: event.target.checked ? current.mesesRecorrencia || "12" : "",
                          }))
                        }
                        className="h-5 w-5 rounded border-[#D9D0C1]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[#171717]">Ativar recorrência</span>
                        <span className="block text-xs text-[#8B8478]">
                          Gera contas mensais a partir do vencimento informado.
                        </span>
                      </span>
                    </label>

                    {form.recorrenciaAtiva && (
                      <label className="w-full max-w-[220px] space-y-2">
                        <span className="text-sm font-medium text-[#6E675C]">Meses de recorrência</span>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={form.mesesRecorrencia}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              mesesRecorrencia: event.target.value,
                            }))
                          }
                          placeholder="Opcional"
                          className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 outline-none"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  className="rounded-full bg-[#2F5BFF] px-5 py-3 text-sm font-semibold text-white"
                >
                  {editingRecord ? "Salvar alterações" : `Criar ${itemLabel}`}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-full border border-[#E9E1D2] px-5 py-3 text-sm font-semibold text-[#6E675C]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function BankAccountsSection() {
  const router = useRouter();
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [summary, setSummary] = useState<CashLedgerResponse["summary"]>();
  const [accounts, setAccounts] = useState<CashLedgerResponse["accounts"]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterRecord[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ledgerPagination, setLedgerPagination] = useState({
    page: 1,
    perPage: 20,
    total: 0,
    pages: 1,
  });
  const [selectedAccount, setSelectedAccount] = useState("");
  const [ledgerMovementType, setLedgerMovementType] = useState("");
  const [draftLedgerMovementType, setDraftLedgerMovementType] = useState("");
  const [showLedgerFilters, setShowLedgerFilters] = useState(false);
  const [showLedgerPeriodFilters, setShowLedgerPeriodFilters] = useState(false);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [accountLabels, setAccountLabels] = useState<Record<string, string>>({});
  const [editingAccountLabel, setEditingAccountLabel] = useState<string | null>(null);
  const [accountLabelDraft, setAccountLabelDraft] = useState("");
  const [savingAccountLabel, setSavingAccountLabel] = useState(false);
  const [ledgerPeriodPreset, setLedgerPeriodPreset] = useState<PeriodPreset>("NO_FILTER");
  const [ledgerStartDate, setLedgerStartDate] = useState("");
  const [ledgerEndDate, setLedgerEndDate] = useState("");
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [showManageAccountsModal, setShowManageAccountsModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccountRecord | null>(null);
  const [editingCashRegister, setEditingCashRegister] = useState<CashRegisterRecord | null>(null);
  const [cashRegisterName, setCashRegisterName] = useState("");
  const [savingCashRegister, setSavingCashRegister] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [transferringBalance, setTransferringBalance] = useState(false);
  const [openingCash, setOpeningCash] = useState(false);
  const [closingCash, setClosingCash] = useState(false);
  const [withdrawingCash, setWithdrawingCash] = useState(false);
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [ledgerMenuOpenId, setLedgerMenuOpenId] = useState<string | null>(null);
  const [cancelingLedgerId, setCancelingLedgerId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    nome: "",
    banco: "",
    agencia: "",
    conta: "",
    titular: "",
    documento: "",
    tipo: "CORRENTE",
    ativo: "true",
    observacoes: "",
  });
  const [transferForm, setTransferForm] = useState({
    fromAccount: "",
    toAccount: "",
    amount: "",
    transferDate: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const [openCashForm, setOpenCashForm] = useState({
    openingBalance: "",
    openingNotes: "",
  });
  const [closeCashForm, setCloseCashForm] = useState({
    closingBalance: "",
    closingNotes: "",
  });
  const [withdrawalForm, setWithdrawalForm] = useState({
    toAccount: "",
    amount: "",
    transferDate: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const [balanceForm, setBalanceForm] = useState({
    targetBalance: "",
    notes: "",
  });

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const target = event.target as HTMLElement;

      if (target.closest('[data-ledger-popover="true"]')) {
        return;
      }

      setShowLedgerFilters(false);
      setShowLedgerPeriodFilters(false);
      setShowAccountSelector(false);
      setLedgerMenuOpenId(null);
      setShowActionsMenu(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const today = new Date();

    if (ledgerPeriodPreset === "NO_FILTER" || ledgerPeriodPreset === "NO_COMPETENCE") {
      setLedgerStartDate("");
      setLedgerEndDate("");
      return;
    }

    if (ledgerPeriodPreset === "TODAY") {
      const todayFormatted = formatDateInput(today);
      setLedgerStartDate(todayFormatted);
      setLedgerEndDate(todayFormatted);
      return;
    }

    if (ledgerPeriodPreset === "LAST_30_DAYS") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setLedgerStartDate(formatDateInput(start));
      setLedgerEndDate(formatDateInput(today));
      return;
    }

    if (ledgerPeriodPreset === "WEEK") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setLedgerStartDate(formatDateInput(start));
      setLedgerEndDate(formatDateInput(today));
      return;
    }

    if (ledgerPeriodPreset === "MONTH") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setLedgerStartDate(formatDateInput(start));
      setLedgerEndDate(formatDateInput(today));
    }
  }, [ledgerPeriodPreset]);

  useEffect(() => {
    setLedgerPage(1);
  }, [ledgerSearch, selectedAccount, ledgerMovementType, ledgerStartDate, ledgerEndDate]);

  const loadEntries = useCallback(async (
    account: string,
    page: number,
    q?: string,
    movementType?: string,
    startDate?: string,
    endDate?: string
  ) => {
    const params = new URLSearchParams({
      page: String(page),
      perPage: "20",
    });

    if (account && account !== "TODAS") {
      params.set("account", account);
    }

    if (q?.trim()) {
      params.set("q", q.trim());
    }

    if (movementType?.trim()) {
      params.set("movementType", movementType.trim());
    }

    if (startDate) {
      params.set("startDate", startDate);
    }

    if (endDate) {
      params.set("endDate", endDate);
    }

    const response = await fetch(`/api/finance/cash-ledger?${params.toString()}`);
    return (await response.json()) as CashLedgerResponse;
  }, []);

  const loadBankAccounts = useCallback(async () => {
    const data = await fetchAllPaginatedRows<BankAccountsResponse>(
      (page) => `/api/finance/bank-accounts?perPage=100&page=${page}`
    );

    return {
      data: data as BankAccountRecord[],
      pagination: {
        page: 1,
        perPage: data.length || 100,
        total: data.length,
        pages: 1,
      },
    } satisfies BankAccountsResponse;
  }, []);

  const loadCashRegisters = useCallback(async () => {
    const data = await fetchAllPaginatedRows<CashRegistersResponse>(
      (page) => `/api/finance/cash-registers?perPage=100&page=${page}`
    );

    return {
      data: data as CashRegisterRecord[],
      pagination: {
        page: 1,
        perPage: data.length || 100,
        total: data.length,
        pages: 1,
      },
    } satisfies CashRegistersResponse;
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/finance/account-labels")
      .then(async (response) => response.ok ? response.json() : null)
      .then((labels) => { if (active && labels && typeof labels === "object") setAccountLabels(labels); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function saveAccountLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccountLabel || savingAccountLabel) return;
    setSavingAccountLabel(true);
    try {
      const response = await fetch("/api/finance/account-labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: editingAccountLabel, label: accountLabelDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Não foi possível salvar o nome.");
      setAccountLabels(data);
      setEditingAccountLabel(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar o nome.");
    } finally {
      setSavingAccountLabel(false);
    }
  }

  async function exportCashLedgerRows() {
    const params = new URLSearchParams({
      perPage: "100",
    });

    if (selectedAccount && selectedAccount !== "TODAS") {
      params.set("account", selectedAccount);
    }

    if (ledgerSearch.trim()) {
      params.set("q", ledgerSearch.trim());
    }

    if (ledgerMovementType.trim()) {
      params.set("movementType", ledgerMovementType.trim());
    }

    if (ledgerStartDate) {
      params.set("startDate", ledgerStartDate);
    }

    if (ledgerEndDate) {
      params.set("endDate", ledgerEndDate);
    }

    const rows = (await fetchAllPaginatedRows<CashLedgerResponse>((pageNumber) => {
      params.set("page", String(pageNumber));
      return `/api/finance/cash-ledger?${params.toString()}`;
    })) as CashLedgerEntry[];

    exportRowsToXlsx(
      rows.map((entry) => {
        const amount = numberValue(entry.amount);
        return {
          Conta: entry.accountName,
          Data: dateOnly(entry.entryDate),
          Histórico: entry.description,
          Cliente: text(entry.contact),
          Categoria: text(entry.category),
          Entradas: entry.movementType === "CREDIT" ? amount : 0,
          Saídas: entry.movementType === "DEBIT" ? Math.abs(amount) : 0,
          Movimento: entry.movementType,
          Origem: entry.sourceFile,
          Documento: text(entry.documentNumber || entry.document),
          "ID externo": text(entry.externalId),
          Transferência: entry.isTransfer ? "Sim" : "Não",
          "Transferência de": text(entry.transferFrom),
          "Transferência para": text(entry.transferTo),
        };
      }),
      "caixa-e-bancos.xlsx",
      "Caixa e Bancos"
    );
  }

  async function importFiles() {
    setImporting(true);
    const response = await fetch("/api/finance/cash-ledger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resetAll: true,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível importar as planilhas.");
      setImporting(false);
      return;
    }

    window.alert(
      `Sincronização concluída. Importados: ${data.imported}, atualizados: ${data.updated}, ignorados: ${data.skipped}.`
    );
    const [refreshed, refreshedAccounts, refreshedRegisters] = await Promise.all([
      loadEntries(
        selectedAccount,
        ledgerPage,
        ledgerSearch,
        ledgerMovementType,
        ledgerStartDate,
        ledgerEndDate
      ),
      loadBankAccounts(),
      loadCashRegisters(),
    ]);
    setEntries(Array.isArray(refreshed.data) ? refreshed.data : []);
    setSummary(refreshed.summary);
    setAccounts(Array.isArray(refreshed.accounts) ? refreshed.accounts : []);
    setLedgerPagination(
      refreshed.pagination || {
        page: 1,
        perPage: 20,
        total: 0,
        pages: 1,
      }
    );
    setBankAccounts(Array.isArray(refreshedAccounts.data) ? refreshedAccounts.data : []);
    setCashRegisters(Array.isArray(refreshedRegisters.data) ? refreshedRegisters.data : []);
    setLoadingEntries(false);
    setImporting(false);
  }

  useEffect(() => {
    let active = true;

    async function reloadForAccount() {
      setLoadingEntries(true);
      const [data, bankData, cashData] = await Promise.all([
        loadEntries(
          selectedAccount,
          ledgerPage,
          ledgerSearch,
          ledgerMovementType,
          ledgerStartDate,
          ledgerEndDate
        ),
        loadBankAccounts(),
        loadCashRegisters(),
      ]);

      if (active) {
        setEntries(Array.isArray(data.data) ? data.data : []);
        setSummary(data.summary);
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        setLedgerPagination(
          data.pagination || {
            page: 1,
            perPage: 20,
            total: 0,
            pages: 1,
          }
        );
        setBankAccounts(Array.isArray(bankData.data) ? bankData.data : []);
        setCashRegisters(Array.isArray(cashData.data) ? cashData.data : []);
        setLoadingEntries(false);
      }
    }

    void reloadForAccount();

    return () => {
      active = false;
    };
  }, [
    ledgerPage,
    ledgerSearch,
    ledgerMovementType,
    ledgerStartDate,
    ledgerEndDate,
    loadBankAccounts,
    loadCashRegisters,
    loadEntries,
    refreshKey,
    selectedAccount,
  ]);

  const accountCounts = useMemo(
    () => new Map((accounts || []).map((account) => [account.name, account.totalEntries])),
    [accounts]
  );

  const selectableAccounts = useMemo(() => {
    const names = new Set<string>();

    for (const account of accounts || []) {
      if (account.name) {
        names.add(account.name);
      }
    }

    for (const account of bankAccounts) {
      if (account.nome) {
        names.add(account.nome);
      }
    }

    for (const register of cashRegisters) {
      if (register.nome) {
        names.add(register.nome);
      }
    }

    return [...names]
      .filter((name) => name !== "Conta PDV")
      .sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [accounts, bankAccounts, cashRegisters]);

  useEffect(() => {
    if (selectableAccounts.length === 0) {
      if (selectedAccount) {
        setSelectedAccount("");
      }
      return;
    }

    if (!selectedAccount || !selectableAccounts.includes(selectedAccount)) {
      setSelectedAccount(selectableAccounts[0]);
    }
  }, [selectedAccount, selectableAccounts]);

  const selectedCashRegister = useMemo(
    () => cashRegisters.find((register) => register.nome === selectedAccount) || null,
    [cashRegisters, selectedAccount]
  );

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingAccount(true);

    const response = await fetch(
      editingBankAccount
        ? `/api/finance/bank-accounts/${editingBankAccount.id}`
        : "/api/finance/bank-accounts",
      {
        method: editingBankAccount ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(accountForm),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível salvar a conta bancária.");
      setCreatingAccount(false);
      return;
    }

    const bankData = await loadBankAccounts();
    setBankAccounts(Array.isArray(bankData.data) ? bankData.data : []);
    setSelectedAccount(accountForm.nome);
    setLedgerPage(1);
    setShowCreateAccountModal(false);
    setEditingBankAccount(null);
    setAccountForm({
      nome: "",
      banco: "",
      agencia: "",
      conta: "",
      titular: "",
      documento: "",
      tipo: "CORRENTE",
      ativo: "true",
      observacoes: "",
    });
    setCreatingAccount(false);
  }

  function openCreateBankAccount() {
    setEditingBankAccount(null);
    setAccountForm({
      nome: "",
      banco: "",
      agencia: "",
      conta: "",
      titular: "",
      documento: "",
      tipo: "CORRENTE",
      ativo: "true",
      observacoes: "",
    });
    setShowCreateAccountModal(true);
  }

  function openEditBankAccount(account: BankAccountRecord) {
    setEditingBankAccount(account);
    setAccountForm({
      nome: account.nome,
      banco: account.banco,
      agencia: account.agencia || "",
      conta: account.conta || "",
      titular: account.titular || "",
      documento: account.documento || "",
      tipo: account.tipo || "CORRENTE",
      ativo: String(account.ativo),
      observacoes: account.observacoes || "",
    });
    setShowManageAccountsModal(false);
    setShowCreateAccountModal(true);
  }

  async function handleDeleteBankAccount(account: BankAccountRecord) {
    if (!window.confirm(`Deseja excluir a conta bancária ${account.nome}?`)) {
      return;
    }

    setDeletingAccountId(account.id);
    const response = await fetch(`/api/finance/bank-accounts/${account.id}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível excluir a conta bancária.");
      setDeletingAccountId(null);
      return;
    }

    const refreshed = await loadBankAccounts();
    setBankAccounts(Array.isArray(refreshed.data) ? refreshed.data : []);
    setDeletingAccountId(null);
    setRefreshKey((current) => current + 1);
  }

  function openEditCashRegister(register: CashRegisterRecord) {
    setEditingCashRegister(register);
    setCashRegisterName(register.nome);
    setShowManageAccountsModal(false);
  }

  async function handleEditCashRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCashRegister) {
      return;
    }

    setSavingCashRegister(true);
    const previousName = editingCashRegister.nome;
    const response = await fetch(`/api/finance/cash-registers/${editingCashRegister.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: cashRegisterName,
        descricao: editingCashRegister.descricao || "",
        observacoes: editingCashRegister.observacoes || "",
        ativo: editingCashRegister.ativo,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível editar o caixa.");
      setSavingCashRegister(false);
      return;
    }

    const refreshed = await loadCashRegisters();
    setCashRegisters(Array.isArray(refreshed.data) ? refreshed.data : []);
    if (selectedAccount === previousName) {
      setSelectedAccount(cashRegisterName.trim());
    }
    setEditingCashRegister(null);
    setSavingCashRegister(false);
    setRefreshKey((current) => current + 1);
  }

  async function handleTransferBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferringBalance(true);

    const response = await fetch("/api/finance/account-transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...transferForm,
        amount: Number(transferForm.amount),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível transferir o saldo.");
      setTransferringBalance(false);
      return;
    }

    setShowTransferModal(false);
    setTransferForm({
      fromAccount: "",
      toAccount: "",
      amount: "",
      transferDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
    setRefreshKey((current) => current + 1);
    setTransferringBalance(false);
  }

  async function handleOpenCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCashRegister) {
      window.alert("Selecione um caixa para abrir.");
      return;
    }

    setOpeningCash(true);

    const response = await fetch(`/api/finance/cash-registers/${selectedCashRegister.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "open",
        openingBalance: Number(openCashForm.openingBalance || 0),
        openingNotes: openCashForm.openingNotes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível abrir o caixa.");
      setOpeningCash(false);
      return;
    }

    setShowOpenCashModal(false);
    setOpenCashForm({
      openingBalance: "",
      openingNotes: "",
    });
    setRefreshKey((current) => current + 1);
    setOpeningCash(false);
  }

  async function handleCloseCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCashRegister) {
      window.alert("Selecione um caixa para fechar.");
      return;
    }

    setClosingCash(true);

    const response = await fetch(`/api/finance/cash-registers/${selectedCashRegister.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "close",
        closingBalance: Number(closeCashForm.closingBalance || selectedAccountBalance || 0),
        closingNotes: closeCashForm.closingNotes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível fechar o caixa.");
      setClosingCash(false);
      return;
    }

    setShowCloseCashModal(false);
    setCloseCashForm({
      closingBalance: "",
      closingNotes: "",
    });
    setRefreshKey((current) => current + 1);
    setClosingCash(false);
  }

  async function handleCashWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCashRegister) {
      window.alert("Selecione um caixa para realizar a sangria.");
      return;
    }

    setWithdrawingCash(true);

    const response = await fetch(`/api/finance/cash-registers/${selectedCashRegister.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "sangria",
        toAccount: withdrawalForm.toAccount,
        amount: Number(withdrawalForm.amount || 0),
        transferDate: withdrawalForm.transferDate,
        description: withdrawalForm.description,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível realizar a sangria.");
      setWithdrawingCash(false);
      return;
    }

    setShowWithdrawalModal(false);
    setWithdrawalForm({
      toAccount: "",
      amount: "",
      transferDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
    setRefreshKey((current) => current + 1);
    setWithdrawingCash(false);
  }

  async function handleSetAccountBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAccount) {
      window.alert("Selecione uma conta para ajustar o saldo.");
      return;
    }

    setUpdatingBalance(true);

    const response = await fetch("/api/finance/cash-ledger", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountName: selectedAccount,
        currentBalance: selectedAccountBalance,
        targetBalance: amountNumber(balanceForm.targetBalance),
        notes: balanceForm.notes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível ajustar o saldo.");
      setUpdatingBalance(false);
      return;
    }

    setShowBalanceModal(false);
    setBalanceForm({
      targetBalance: "",
      notes: "",
    });
    setRefreshKey((current) => current + 1);
    setUpdatingBalance(false);
  }

  async function handleZeroAccountBalance() {
    if (!selectedAccount) {
      window.alert("Selecione uma conta para zerar o saldo.");
      return;
    }

    const confirmed = window.confirm(
      `Deseja zerar o saldo atual de ${selectedAccount}? Será lançado um ajuste manual no Caixa e Bancos.`
    );

    if (!confirmed) {
      return;
    }

    setUpdatingBalance(true);

    const response = await fetch("/api/finance/cash-ledger", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountName: selectedAccount,
        currentBalance: selectedAccountBalance,
        targetBalance: 0,
        notes: "Saldo zerado manualmente pelo Caixa e Bancos.",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível zerar o saldo.");
      setUpdatingBalance(false);
      return;
    }

    setRefreshKey((current) => current + 1);
    setUpdatingBalance(false);
  }

  const selectedAccountLabel = accountLabels[selectedAccount] || selectedAccount || "Selecione uma conta";
  const selectedAccountEntries = selectedAccount
    ? accountCounts.get(selectedAccount) ?? Number(summary?.totalEntries || 0)
    : Number(summary?.totalEntries || 0);
  const selectedAccountBalance = Number(summary?.currentBalance || 0);
  const totalCredits = Number(summary?.credits || 0);
  const totalDebits = Number(summary?.debits || 0);
  const initialBalance =
    summary?.initialBalance !== undefined && summary?.initialBalance !== null
      ? Number(summary.initialBalance)
      : selectedAccountBalance - totalCredits + totalDebits;
  const latestSnapshot = entries.find((entry) => entry.movementType === "S") || null;
  const latestClosingDate = summary?.closingDate || entries[0]?.entryDate || null;
  const visiblePages = useMemo(() => {
    const totalPages = Math.max(ledgerPagination.pages, 1);
    return Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1);
  }, [ledgerPagination.pages]);
  const ledgerPeriodPresetOptions: Array<{ value: PeriodPreset; label: string }> = [
    { value: "LAST_30_DAYS", label: "últimos 30 dias" },
    { value: "NO_FILTER", label: "sem filtro" },
    { value: "TODAY", label: "do dia" },
    { value: "WEEK", label: "da semana" },
    { value: "MONTH", label: "do mês" },
    { value: "INTERVAL", label: "intervalo" },
  ];
  const ledgerMovementOptions = [
    { value: "", label: "Todos" },
    { value: "C", label: "Entradas" },
    { value: "D", label: "Saídas" },
    { value: "S", label: "Saldos" },
  ];
  const selectedLedgerPeriodLabel =
    ledgerPeriodPresetOptions.find((option) => option.value === ledgerPeriodPreset)?.label || "por período";
  const canCancelLedgerEntry = useCallback(
    (entry: CashLedgerEntry) =>
      entry.sourceFile === "sistema-estrela" &&
      Boolean(entry.externalId) &&
      (String(entry.externalId).startsWith("payable:") ||
        String(entry.externalId).startsWith("receivable:")),
    []
  );

  async function cancelLedgerEntry(entry: CashLedgerEntry) {
    if (!canCancelLedgerEntry(entry)) {
      window.alert("Somente movimentações geradas pelo sistema podem ser canceladas.");
      return;
    }

    const confirmed = window.confirm(
      "Deseja cancelar esta movimentação? A conta voltará para o estado anterior."
    );

    if (!confirmed) {
      return;
    }

    setCancelingLedgerId(entry.id);

    const response = await fetch(`/api/finance/cash-ledger/${entry.id}/cancel`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.message || "Não foi possível cancelar a movimentação.");
      setCancelingLedgerId(null);
      return;
    }

    setLedgerMenuOpenId(null);
    setCancelingLedgerId(null);
    setRefreshKey((current) => current + 1);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
                <span>início</span>
                <span>—</span>
                <span>finanças</span>
                <span className="font-medium text-[#191919]">caixa</span>
              </div>
              <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">
                Caixa e Bancos
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
              >
                <Printer size={15} />
                imprimir
              </button>

              <button
                type="button"
                onClick={() => setShowTransferModal(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
              >
                <Wallet size={15} />
                transferir
              </button>

              {selectedCashRegister ? (
                <>
                  {!selectedCashRegister.aberto ? (
                    <button
                      type="button"
                      onClick={() => setShowOpenCashModal(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#D9EFD9] bg-white px-4 py-2 text-sm font-medium text-[#167C3B]"
                    >
                      <CheckCircle2 size={15} />
                      abrir caixa
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowWithdrawalModal(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
                      >
                        <Wallet size={15} />
                        sangria
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCloseCashForm((current) => ({
                            ...current,
                            closingBalance: String(selectedAccountBalance || 0),
                          }));
                          setShowCloseCashModal(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-[#F3D9D9] bg-white px-4 py-2 text-sm font-medium text-[#B42318]"
                      >
                        <X size={15} />
                        fechar caixa
                      </button>
                    </>
                  )}
                </>
              ) : null}

              <button
                type="button"
                onClick={openCreateBankAccount}
                className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,91,255,0.18)]"
              >
                <Plus size={16} />
                incluir banco
              </button>

              <div data-ledger-popover="true" className="relative">
                <button
                  type="button"
                  onClick={() => setShowActionsMenu((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#1D1B18]"
                >
                  mais ações
                  <MoreHorizontal size={16} />
                </button>

                {showActionsMenu ? (
                  <DraggablePopover
                    onClose={() => setShowActionsMenu(false)}
                    className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-2xl border border-[#ECE7DB] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionsMenu(false);
                        void importFiles();
                      }}
                      className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#1D1B18] hover:bg-[#F7F4EE]"
                    >
                      {importing ? "Sincronizando..." : "Sincronizar planilhas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionsMenu(false);
                        void exportCashLedgerRows();
                      }}
                      className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#1D1B18] hover:bg-[#F7F4EE]"
                    >
                      Exportar Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionsMenu(false);
                        setShowManageAccountsModal(true);
                      }}
                      className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#1D1B18] hover:bg-[#F7F4EE]"
                    >
                      Gerenciar bancos e caixas
                    </button>
                  </DraggablePopover>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <label className="flex min-w-[320px] flex-1 items-center gap-3 rounded-2xl border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-[#7A746A]">
                <Search size={18} className="text-[#A1988B]" />
                <input
                  value={ledgerSearch}
                  onChange={(event) => {
                    setLedgerSearch(event.target.value);
                    setLedgerPage(1);
                  }}
                  placeholder="Pesquise por cliente"
                  className="w-full bg-transparent outline-none placeholder:text-[#A1988B]"
                />
              </label>

              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E9E1D2] bg-white text-[#7A746A]"
              >
                <SlidersHorizontal size={17} />
              </button>
            </div>

            <div data-ledger-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowLedgerPeriodFilters((current) => !current);
                  setShowLedgerFilters(false);
                  setShowAccountSelector(false);
                }}
                className={`inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium ${
                  showLedgerPeriodFilters
                    ? "border-[#D7DFF8] text-[#2F5BFF]"
                    : "border-[#E9E1D2] text-[#1D1B18]"
                }`}
              >
                <CalendarDays size={15} />
                {selectedLedgerPeriodLabel}
              </button>

              {showLedgerPeriodFilters ? (
                <DraggablePopover
                  onClose={() => setShowLedgerPeriodFilters(false)}
                  className="absolute right-0 top-[calc(100%+12px)] z-30 w-[min(520px,calc(100vw-32px))] rounded-[24px] border border-[#E9E1D2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD0FF] px-4 py-2 text-sm font-medium text-[#1D1B18]">
                    <CalendarDays size={16} />
                    por período
                  </div>

                  <div className="mt-5">
                    <p className="mb-3 text-sm text-[#6E675C]">Período</p>
                    <div className="flex flex-wrap gap-2">
                      {ledgerPeriodPresetOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          data-popover-keep-open={option.value === "INTERVAL" ? "true" : undefined}
                          onClick={() => {
                            setLedgerPeriodPreset(option.value);
                            if (option.value !== "INTERVAL") {
                              setShowLedgerPeriodFilters(false);
                            }
                          }}
                          className={`rounded-full border px-4 py-2 text-sm ${
                            ledgerPeriodPreset === option.value
                              ? "border-[#BFD0FF] text-[#2F5BFF]"
                              : "border-[#E9E1D2] text-[#1D1B18]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {ledgerPeriodPreset === "INTERVAL" ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <input
                          type="date"
                          value={ledgerStartDate}
                          onChange={(event) => setLedgerStartDate(event.target.value)}
                          className="rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                        />
                        <input
                          type="date"
                          value={ledgerEndDate}
                          onChange={(event) => setLedgerEndDate(event.target.value)}
                          className="rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                        />
                      </div>
                    ) : null}
                  </div>
                </DraggablePopover>
              ) : null}
            </div>

            <div data-ledger-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  setDraftLedgerMovementType(ledgerMovementType);
                  setShowLedgerFilters((current) => !current);
                  setShowLedgerPeriodFilters(false);
                  setShowAccountSelector(false);
                }}
                className={`inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium ${
                  showLedgerFilters
                    ? "border-[#D7DFF8] text-[#2F5BFF]"
                    : "border-[#E9E1D2] text-[#1D1B18]"
                }`}
              >
                <Funnel size={15} />
                filtros
              </button>

              {showLedgerFilters ? (
                <DraggablePopover
                  onClose={() => setShowLedgerFilters(false)}
                  className="absolute right-0 top-[calc(100%+12px)] z-30 w-[360px] max-w-[calc(100vw-48px)] rounded-[24px] border border-[#E9E1D2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD0FF] px-4 py-2 text-sm font-medium text-[#1D1B18]">
                    <Funnel size={16} />
                    filtros
                  </div>

                  <div className="mt-6 space-y-4">
                    <label className="block space-y-2">
                      <span className="text-sm text-[#6E675C]">Tipo de movimento</span>
                      <select
                        value={draftLedgerMovementType}
                        onChange={(event) => setDraftLedgerMovementType(event.target.value)}
                        className="w-full rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3 text-sm text-[#1D1B18] outline-none"
                      >
                        {ledgerMovementOptions.map((option) => (
                          <option key={option.value || "all"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerMovementType(draftLedgerMovementType);
                        setShowLedgerFilters(false);
                      }}
                      className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white"
                    >
                      aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftLedgerMovementType(ledgerMovementType);
                        setShowLedgerFilters(false);
                      }}
                      className="text-sm font-medium text-[#1D1B18]"
                    >
                      cancelar
                    </button>
                  </div>
                </DraggablePopover>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setLedgerSearch("");
                setSelectedAccount(selectableAccounts[0] || "");
                setLedgerMovementType("");
                setDraftLedgerMovementType("");
                setLedgerPeriodPreset("NO_FILTER");
                setLedgerPage(1);
                setShowLedgerFilters(false);
                setShowLedgerPeriodFilters(false);
                setShowAccountSelector(false);
              }}
              className="inline-flex items-center gap-2 px-1 py-2 text-sm font-medium text-[#1D1B18]"
            >
              <CircleDot size={14} />
              limpar filtros
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <div data-ledger-popover="true" className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAccountSelector((current) => !current);
                  setShowLedgerFilters(false);
                  setShowLedgerPeriodFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-medium text-[#2F5BFF]"
              >
                {selectedAccountLabel}
                <ChevronDown size={15} />
              </button>

              {showAccountSelector ? (
                <DraggablePopover
                  onClose={() => setShowAccountSelector(false)}
                  className="absolute left-0 top-[calc(100%+12px)] z-30 max-h-[320px] w-[260px] overflow-y-auto rounded-[24px] border border-[#E9E1D2] bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  {selectableAccounts.map((accountName) => (
                    <div key={accountName} className={`flex items-center rounded-2xl ${selectedAccount === accountName ? "bg-[#EEF3FF]" : "hover:bg-[#F7F4EE]"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAccount(accountName);
                          setShowAccountSelector(false);
                        }}
                        className={`min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm ${selectedAccount === accountName ? "font-semibold text-[#2F5BFF]" : "text-[#1D1B18]"}`}
                        title={accountName}
                      >
                        {accountLabels[accountName] || accountName}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountLabelDraft(accountLabels[accountName] || accountName);
                          setEditingAccountLabel(accountName);
                          setShowAccountSelector(false);
                        }}
                        aria-label={`Editar nome exibido de ${accountName}`}
                        title="Editar nome exibido"
                        className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6E675C] hover:bg-white"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  ))}
                </DraggablePopover>
              ) : null}
            </div>
            <div>
              <p
                className={`text-[31px] font-semibold leading-none ${
                  isNegativeAmount(selectedAccountBalance) ? "text-[#DC2626]" : "text-[#171717]"
                }`}
                style={{
                  color: isNegativeAmount(selectedAccountBalance) ? "#DC2626" : "#171717",
                }}
              >
                {money(selectedAccountBalance)}
              </p>
              <p className="text-sm text-[#9B9488]">saldo atual (R$)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBalanceForm({
                    targetBalance: moneyInput(selectedAccountBalance),
                    notes: "",
                  });
                  setShowBalanceModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-semibold text-[#1D1B18] transition hover:bg-[#FAF8F3]"
              >
                <Pencil size={15} />
                editar saldo
              </button>
              <button
                type="button"
                onClick={() => void handleZeroAccountBalance()}
                disabled={updatingBalance || !selectedAccount}
                className="inline-flex items-center gap-2 rounded-full border border-[#F3B8B8] bg-white px-4 py-2 text-sm font-semibold text-[#DC2626] transition hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw size={15} />
                zerar saldo
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-visible rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
        {latestSnapshot ? (
          <div className="border-b border-[#F0E9DC] bg-[#F9F9FB] px-6 py-5">
            <div className="grid grid-cols-[140px_1fr] gap-4">
              <div className="text-[15px] font-semibold text-[#171717]">
                saldo em
                <br />
                {dateOnly(latestSnapshot.entryDate)}
              </div>
              <div className="text-[15px] font-semibold text-[#171717]">
                <span
                  className={isNegativeAmount(latestSnapshot.amount) ? "text-[#DC2626]" : "text-[#171717]"}
                  style={{
                    color: isNegativeAmount(latestSnapshot.amount) ? "#DC2626" : "#171717",
                  }}
                >
                  {money(latestSnapshot.amount)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full min-w-[1360px] text-left text-sm">
            <thead className="text-sm text-[#6E675C]">
              <tr className="border-b border-[#EEE7D9]">
                <th className="w-10 px-4 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-[#D9D0C1]" />
                </th>
                <th className="w-8 px-2 py-4"></th>
                <th className="px-3 py-4 font-medium">Data</th>
                <th className="px-3 py-4 font-medium">Histórico</th>
                <th className="px-3 py-4 font-medium">Cliente</th>
                <th className="px-3 py-4 font-medium">Categoria</th>
                <th className="px-3 py-4 text-right font-medium">Entradas</th>
                <th className="px-3 py-4 text-right font-medium">Saídas</th>
                <th className="px-3 py-4 font-medium">Marcadores</th>
                <th className="px-3 py-4 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {loadingEntries ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                    Nenhuma planilha importada ainda.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-[#F0E9DC] text-[15px] text-[#171717] last:border-none">
                    <td className="px-4 py-4 align-middle">
                      <input type="checkbox" className="h-4 w-4 rounded border-[#D9D0C1]" />
                    </td>
                    <td className="px-2 py-4 align-middle text-[#A1988B]">
                      <div data-ledger-popover="true" className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setLedgerMenuOpenId((current) => (current === entry.id ? null : entry.id))
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#A1988B] hover:bg-[#F6F1E6]"
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {ledgerMenuOpenId === entry.id ? (
                          <div className="absolute left-0 top-[calc(100%+8px)] z-20 min-w-[180px] rounded-2xl border border-[#E9E1D2] bg-white p-2 shadow-xl">
                            <button
                              type="button"
                              disabled={!canCancelLedgerEntry(entry) || cancelingLedgerId === entry.id}
                              onClick={() => void cancelLedgerEntry(entry)}
                              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                                canCancelLedgerEntry(entry)
                                  ? "text-rose-600 hover:bg-rose-50"
                                  : "cursor-not-allowed text-slate-400"
                              }`}
                            >
                              <X size={15} />
                              {cancelingLedgerId === entry.id ? "Cancelando..." : "Cancelar"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-4 align-middle font-medium">{dateOnly(entry.entryDate)}</td>
                    <td className="px-3 py-4 align-middle">
                      <div className="max-w-[520px] whitespace-normal">
                        {entry.description}
                      </div>
                    </td>
                    <td className="px-3 py-4 align-middle">{text(entry.contact)}</td>
                    <td className="px-3 py-4 align-middle">{text(entry.category)}</td>
                    <td className="px-3 py-4 text-right align-middle font-medium">
                      {entry.movementType === "C" ? (
                        <span
                          className={isNegativeAmount(entry.amount) ? "text-[#DC2626]" : undefined}
                          style={{
                            color: isNegativeAmount(entry.amount) ? "#DC2626" : undefined,
                          }}
                        >
                          {money(entry.amount)}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-3 py-4 text-right align-middle font-medium">
                      {entry.movementType === "D" ? (
                        <span
                          className={isNegativeAmount(entry.amount) ? "text-[#DC2626]" : undefined}
                          style={{
                            color: isNegativeAmount(entry.amount) ? "#DC2626" : undefined,
                          }}
                        >
                          {money(entry.amount)}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-3 py-4 align-middle">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#7DE291] text-xs text-[#52C26B]">
                        B
                      </span>
                    </td>
                    <td className="px-3 py-4 align-middle">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#7DE291] text-xs text-[#52C26B]">
                        {entry.accountName === "Caixa" ? "C" : "B"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-[#EEE7D9] px-6 py-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-[#B0A89A]">
            {Array.from({ length: Math.max(ledgerPagination.pages, 1) }, (_, index) => index + 1)
              .slice(0, 5)
              .map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setLedgerPage(pageNumber)}
                  className={`h-8 min-w-8 rounded-full px-3 text-sm font-medium ${
                    pageNumber === ledgerPagination.page
                      ? "bg-[#171717] text-white"
                      : "text-[#9B9488]"
                  }`}
                >
                  {String(pageNumber).padStart(2, "0")}
                </button>
              ))}

            {ledgerPagination.pages > 5 && <span className="px-2 text-sm">…</span>}

            {ledgerPagination.pages > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLedgerPage((page) => Math.min(page + 1, ledgerPagination.pages))
                }
                className="px-2 text-sm text-[#9B9488]"
              >
                →
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-end gap-6 text-right">
            <FooterMetric
              label="saldo inicial (R$)"
              value={money(initialBalance)}
              negative={isNegativeAmount(initialBalance)}
            />
            <FooterMetric label="entradas (R$)" value={money(totalCredits)} />
            <FooterMetric label="saídas (R$)" value={money(totalDebits)} />
            <FooterMetric
              label="saldo final (R$)"
              value={money(selectedAccountBalance)}
              negative={isNegativeAmount(selectedAccountBalance)}
            />
            <FooterMetric label="lançamentos" value={String(selectedAccountEntries)} />
            <FooterMetric
              label="financeiro fechado"
              value={latestClosingDate ? dateOnly(latestClosingDate) : "-"}
            />
          </div>
        </div>
      </section>

      {editingAccountLabel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Editar nome exibido da conta">
          <form onSubmit={saveAccountLabel} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900">Editar nome exibido</h2>
              <button type="button" onClick={() => setEditingAccountLabel(null)} disabled={savingAccountLabel} aria-label="Fechar" className="rounded-full p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <p className="mt-2 text-sm text-slate-600">Esse nome aparece no seletor de Caixa e Bancos. Lançamentos, saldos e integrações permanecem vinculados à conta original.</p>
            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Nome exibido
              <input autoFocus value={accountLabelDraft} onChange={(event) => setAccountLabelDraft(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAccountLabel(null)} disabled={savingAccountLabel} className="rounded-full border px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={savingAccountLabel || !accountLabelDraft.trim()} className="rounded-full bg-[#2F5BFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingAccountLabel ? "Salvando..." : "Salvar nome"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {showManageAccountsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Caixa e Bancos
                </p>
                <h2 className="mt-2 text-[24px] font-bold text-slate-900">
                  Gerenciar bancos e caixas
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowManageAccountsModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">Contas bancárias</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowManageAccountsModal(false);
                    openCreateBankAccount();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2F5BFF] px-4 py-2 text-sm font-semibold text-white"
                >
                  <Plus size={15} />
                  Incluir banco
                </button>
              </div>

              <div className="space-y-2">
                {bankAccounts.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Nenhuma conta bancária cadastrada.
                  </p>
                ) : (
                  bankAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{account.nome}</p>
                        <p className="truncate text-sm text-slate-500">
                          {account.banco}
                          {account.agencia ? ` • Agência ${account.agencia}` : ""}
                          {account.conta ? ` • Conta ${account.conta}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditBankAccount(account)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                          aria-label={`Editar ${account.nome}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={deletingAccountId === account.id}
                          onClick={() => void handleDeleteBankAccount(account)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          aria-label={`Excluir ${account.nome}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <h3 className="mb-4 mt-8 text-lg font-bold text-slate-900">Caixas</h3>
              <div className="space-y-2">
                {cashRegisters.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Nenhum caixa cadastrado.
                  </p>
                ) : (
                  cashRegisters.map((register) => (
                    <div
                      key={register.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{register.nome}</p>
                        <p className="text-sm text-slate-500">
                          {register.aberto ? "Caixa aberto" : "Caixa fechado"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditCashRegister(register)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                        aria-label={`Editar ${register.nome}`}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingCashRegister ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
                <h2 className="mt-2 text-[22px] font-bold text-slate-900">Editar nome do caixa</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingCashRegister(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]"
              >
                <X size={17} />
              </button>
            </div>
            <form onSubmit={handleEditCashRegister} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Nome do caixa</span>
                <input
                  value={cashRegisterName}
                  onChange={(event) => setCashRegisterName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#2F5BFF]"
                  required
                />
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCashRegister(null)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCashRegister}
                  className="rounded-xl bg-[#2F5BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingCashRegister ? "Salvando..." : "Salvar alteração"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showBalanceModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                  Caixa e Bancos
                </p>
                <h2 className="mt-2 text-[24px] font-bold text-slate-900">
                  Editar saldo atual
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Conta: <strong>{selectedAccountLabel}</strong> • saldo atual:{" "}
                  <strong>{money(selectedAccountBalance)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBalanceModal(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSetAccountBalance} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Novo saldo atual</span>
                <input
                  value={balanceForm.targetBalance}
                  onChange={(event) =>
                    setBalanceForm((current) => ({
                      ...current,
                      targetBalance: moneyFieldInput(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900 outline-none focus:border-[#2F5BFF]"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Observações</span>
                <textarea
                  value={balanceForm.notes}
                  onChange={(event) =>
                    setBalanceForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={4}
                  placeholder="Ex.: ajuste manual para conferência do extrato"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#2F5BFF]"
                />
              </label>

              <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-sm text-slate-600">
                O sistema vai lançar automaticamente uma entrada ou saída pela diferença,
                mantendo o histórico rastreável.
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updatingBalance}
                  className="rounded-xl bg-[#2F5BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {updatingBalance ? "Salvando..." : "Salvar saldo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showOpenCashModal && selectedCashRegister ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                Abertura de caixa
              </p>
              <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                Abrir {selectedCashRegister.nome}
              </h2>
            </div>

            <form onSubmit={handleOpenCash} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Saldo de abertura</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openCashForm.openingBalance}
                  onChange={(event) =>
                    setOpenCashForm((current) => ({ ...current, openingBalance: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Observações</span>
                <textarea
                  value={openCashForm.openingNotes}
                  onChange={(event) =>
                    setOpenCashForm((current) => ({ ...current, openingNotes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowOpenCashModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={openingCash}
                  className="rounded-xl bg-[#2F5BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {openingCash ? "Abrindo..." : "Abrir caixa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCloseCashModal && selectedCashRegister ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                Fechamento de caixa
              </p>
              <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                Fechar {selectedCashRegister.nome}
              </h2>
            </div>

            <form onSubmit={handleCloseCash} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Saldo de fechamento</span>
                <input
                  type="number"
                  step="0.01"
                  value={closeCashForm.closingBalance}
                  onChange={(event) =>
                    setCloseCashForm((current) => ({ ...current, closingBalance: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Observações</span>
                <textarea
                  value={closeCashForm.closingNotes}
                  onChange={(event) =>
                    setCloseCashForm((current) => ({ ...current, closingNotes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCloseCashModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={closingCash}
                  className="rounded-xl bg-[#B42318] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {closingCash ? "Fechando..." : "Fechar caixa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showWithdrawalModal && selectedCashRegister ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                Sangria
              </p>
              <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                Sangria do caixa {selectedCashRegister.nome}
              </h2>
            </div>

            <form onSubmit={handleCashWithdrawal} className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Data</span>
                  <input
                    type="date"
                    value={withdrawalForm.transferDate}
                    onChange={(event) =>
                      setWithdrawalForm((current) => ({ ...current, transferDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Valor</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={withdrawalForm.amount}
                    onChange={(event) =>
                      setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                    required
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Conta de destino</span>
                <select
                  value={withdrawalForm.toAccount}
                  onChange={(event) =>
                    setWithdrawalForm((current) => ({ ...current, toAccount: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                  required
                >
                  <option value="">Selecione</option>
                  {selectableAccounts
                    .filter((accountName) => accountName !== selectedCashRegister.nome)
                    .map((accountName) => (
                      <option key={`withdrawal-${accountName}`} value={accountName}>
                        {accountName}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Histórico</span>
                <textarea
                  value={withdrawalForm.description}
                  onChange={(event) =>
                    setWithdrawalForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawalModal(false)}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={withdrawingCash}
                  className="rounded-xl bg-[#2F5BFF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {withdrawingCash ? "Processando..." : "Confirmar sangria"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCreateAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
                {editingBankAccount ? "Editar conta bancária" : "Nova conta bancária"}
              </p>
              <h2 className="mt-2 text-[22px] font-bold text-slate-900">
                {editingBankAccount ? "Editar conta bancária" : "Adicionar conta bancária"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {editingBankAccount
                  ? "Altere os dados da conta. O histórico será mantido ao mudar o nome."
                  : "Cadastre a conta e ela ficará disponível na seleção acima."}
              </p>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Nome da conta</span>
                  <input
                    value={accountForm.nome}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, nome: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Banco</span>
                  <input
                    value={accountForm.banco}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, banco: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Agência</span>
                  <input
                    value={accountForm.agencia}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, agencia: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Conta</span>
                  <input
                    value={accountForm.conta}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, conta: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Titular</span>
                  <input
                    value={accountForm.titular}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, titular: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">CPF / CNPJ</span>
                  <input
                    value={accountForm.documento}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, documento: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Tipo</span>
                  <select
                    value={accountForm.tipo}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, tipo: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  >
                    <option value="CORRENTE">Corrente</option>
                    <option value="POUPANCA">Poupança</option>
                    <option value="PAGAMENTO">Pagamento</option>
                    <option value="INVESTIMENTO">Investimento</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Status</span>
                  <select
                    value={accountForm.ativo}
                    onChange={(event) =>
                      setAccountForm((current) => ({ ...current, ativo: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                  >
                    <option value="true">Ativa</option>
                    <option value="false">Inativa</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">Observações</span>
                <textarea
                  value={accountForm.observacoes}
                  onChange={(event) =>
                    setAccountForm((current) => ({ ...current, observacoes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#C6921E]"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateAccountModal(false);
                    setEditingBankAccount(null);
                  }}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={creatingAccount}
                  className="rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingAccount
                    ? "Salvando..."
                    : editingBankAccount
                      ? "Salvar alterações"
                      : "Salvar conta bancária"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <button
            type="button"
            aria-label="Fechar transferência"
            onClick={() => setShowTransferModal(false)}
            className="flex-1 cursor-default"
          />
          <div className="flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between px-10 py-10">
              <h2 className="text-[26px] font-semibold text-[#171717]">Transferência entre contas</h2>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="inline-flex items-center gap-3 text-[14px] text-[#171717]"
              >
                fechar
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F3EEE4] text-[#6E675C]">
                  <X size={16} />
                </span>
              </button>
            </div>

            <form onSubmit={handleTransferBalance} className="flex flex-1 flex-col px-10 pb-8">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Data</span>
                  <input
                    type="date"
                    value={transferForm.transferDate}
                    onChange={(event) =>
                      setTransferForm((current) => ({ ...current, transferDate: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#AFC4FF] px-4 py-3 text-[15px] text-[#171717] outline-none"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Valor</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={transferForm.amount}
                    onChange={(event) =>
                      setTransferForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Conta de origem</span>
                  <select
                    value={transferForm.fromAccount}
                    onChange={(event) =>
                      setTransferForm((current) => ({ ...current, fromAccount: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                    required
                  >
                    <option value="">Selecione</option>
                    {selectableAccounts.map((accountName) => (
                      <option key={`from-${accountName}`} value={accountName}>
                        {accountName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-[#6E675C]">Conta de destino</span>
                  <select
                    value={transferForm.toAccount}
                    onChange={(event) =>
                      setTransferForm((current) => ({ ...current, toAccount: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                    required
                  >
                    <option value="">Selecione</option>
                    {selectableAccounts.map((accountName) => (
                      <option key={`to-${accountName}`} value={accountName}>
                        {accountName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-5 block space-y-2">
                <span className="text-sm text-[#6E675C]">Histórico</span>
                <textarea
                  value={transferForm.description}
                  onChange={(event) =>
                    setTransferForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-xl border border-[#E9E1D2] px-4 py-3 text-[15px] text-[#171717] outline-none"
                />
              </label>

              <div className="mt-auto flex items-center justify-between pt-8">
                <div className="text-sm font-medium text-[#2F5BFF]">mais opções</div>
                <div className="flex items-center gap-4">
                  <button
                    type="submit"
                    disabled={transferringBalance}
                    className="rounded-full bg-[#2F5BFF] px-7 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {transferringBalance ? "salvando..." : "salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="text-sm font-medium text-[#171717]"
                  >
                    cancelar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceSummary({
  records,
  type,
}: {
  records: ResourceRecord[];
  type: "INCOME" | "EXPENSE";
}) {
  const received = records
    .filter((record) => record.status === "PAID")
    .reduce((sum, record) => sum + Number(record.valor || 0), 0);
  const pending = records
    .filter(
      (record) =>
        record.status === "PENDING" ||
        record.status === "OVERDUE"
    )
    .reduce((sum, record) => sum + Number(record.valor || 0), 0);
  const total = records.reduce(
    (sum, record) => sum + Number(record.valor || 0),
    0
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      <Summary
        title={
          type === "INCOME"
            ? "Recebido"
            : "Pago"
        }
        value={money(received)}
      />
      <Summary
        title={
          type === "INCOME"
            ? "Em aberto"
            : "A pagar"
        }
        value={money(pending)}
      />
      <Summary
        title="Total"
        value={money(total)}
      />
    </div>
  );
}

function Summary({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">{title}</p>
      <h2 className="mt-3 text-3xl font-bold text-slate-900">{value}</h2>
    </section>
  );
}

function FooterMetric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="min-w-[96px]">
      <p
        className={`text-[15px] font-semibold leading-none ${
          negative ? "text-[#DC2626]" : "text-[#171717]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm leading-tight text-[#A1988B]">{label}</p>
    </div>
  );
}

function SuppliersSummary({
  records,
}: {
  records: ResourceRecord[];
}) {
  const withSupplier = records.filter(
    (record) => text(record.centroCusto) !== "-"
  );
  const uniqueSuppliers = new Set(
    withSupplier.map((record) => text(record.centroCusto))
  );
  const totalVolume = withSupplier.reduce(
    (sum, record) => sum + Number(record.valor || 0),
    0
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Summary title="Fornecedores" value={String(uniqueSuppliers.size)} />
      <Summary title="Lançamentos" value={String(withSupplier.length)} />
      <Summary title="Volume" value={money(totalVolume)} />
    </div>
  );
}
