"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Landmark,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import { normalizeSearchText } from "@/lib/search";
import { exportRowsToXlsx } from "@/lib/export-xlsx";
import SpreadsheetImportActions from "@/components/spreadsheets/SpreadsheetImportActions";

type Product = {
  id: string;
  nome: string;
  sku?: string | null;
  foto?: string | null;
  precoVenda: string;
  estoque: string;
};

type CartItem = {
  product: Product;
  quantidade: number;
  unitPrice: string;
};

type Sale = {
  id: string;
  total: string;
  status: string;
  createdAt: string;
  observacoes?: string | null;
  member?: { nome: string } | null;
  items: Array<{ product: { nome: string }; quantidade: string; subtotal: string }>;
  payments: Array<{ metodo: string; valor: string }>;
};

type CashRegisterRecord = {
  id: string;
  nome: string;
  ativo: boolean;
  aberto?: boolean;
  aberturaEm?: string | null;
  saldoAbertura?: number | string | null;
  fechamentoEm?: string | null;
  saldoFechamento?: number | string | null;
  currentSessionId?: string | null;
};

type CashSessionRecord = {
  id: string;
  openedAt: string;
  openingBalance: number | string;
  openingNotes?: string | null;
  closedAt?: string | null;
  closingBalance?: number | string | null;
  closingNotes?: string | null;
};

type BankAccountRecord = {
  id: string;
  nome: string;
};

type LedgerAccountRecord = {
  name: string;
};

type PdvCashState = {
  register: CashRegisterRecord;
  activeSession: CashSessionRecord | null;
};

const methods = [
  { label: "PIX", value: "PIX", icon: PixIcon },
  { label: "DINHEIRO", value: "DINHEIRO", icon: Wallet },
  { label: "CRÉDITO", value: "CARTAO_CREDITO", icon: CreditCard },
  { label: "DÉBITO", value: "CARTAO_DEBITO", icon: CreditCard },
];

const PDV_CASH_REGISTER_NAME = "PDV";
const PRODUCTS_PER_PAGE = 12;
const SALES_HISTORY_PER_PAGE = 10;

function currency(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function priceNumber(value: string | number | null | undefined) {
  const parsed = Number(String(value ?? "0").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentLabel(value: string) {
  return methods.find((method) => method.value === value)?.label || value;
}

function encodeReceiptMeta(meta: { cashReceived: number; change: number }) {
  return `[PDV_META]${JSON.stringify(meta)}[/PDV_META]`;
}

function parseReceiptMeta(observacoes?: string | null) {
  if (!observacoes) {
    return null;
  }

  const match = observacoes.match(/\[PDV_META\](.*?)\[\/PDV_META\]/);
  if (!match?.[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]) as {
      cashReceived?: number;
      change?: number;
    };

    return {
      cashReceived: Number(parsed.cashReceived || 0),
      change: Number(parsed.change || 0),
    };
  } catch {
    return null;
  }
}

async function loadLogoDataUrl() {
  const response = await fetch("/logo.png");
  const blob = await response.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível carregar o logotipo."));
    reader.readAsDataURL(blob);
  });
}

function extractArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }

  return [];
}

function PixIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.55 4.43a2.84 2.84 0 0 1 4.02 0l1.44 1.44c.4.4.94.63 1.51.63h1.06c.62 0 1.23.25 1.67.69l1.05 1.05c.92.92.92 2.42 0 3.34l-1.05 1.05a2.36 2.36 0 0 1-1.67.69h-1.06c-.57 0-1.11.23-1.51.63l-1.44 1.44a2.84 2.84 0 0 1-4.02 0l-1.44-1.44a2.14 2.14 0 0 0-1.51-.63H6.5c-.62 0-1.23-.25-1.67-.69L3.78 11.6a2.36 2.36 0 0 1 0-3.34l1.05-1.05c.44-.44 1.05-.69 1.67-.69h1.06c.57 0 1.11-.23 1.51-.63l1.44-1.44Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.1 9.1 12 12m0 0 2.9 2.9M12 12l2.9-2.9M12 12l-2.9 2.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PdvPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterRecord[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSessionRecord[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountRecord[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [salesHistoryPage, setSalesHistoryPage] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("PIX");
  const [cashReceived, setCashReceived] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [receiptPromptSale, setReceiptPromptSale] = useState<Sale | null>(null);
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [closeCashPrompt, setCloseCashPrompt] = useState<CashSessionRecord | null>(null);
  const [openingCash, setOpeningCash] = useState(false);
  const [closingCash, setClosingCash] = useState(false);
  const [withdrawingCash, setWithdrawingCash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bootstrappingCash, setBootstrappingCash] = useState(true);
  const autoOpeningCashRef = useRef(false);
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
    description: "",
    transferDate: new Date().toISOString().slice(0, 10),
  });

  function findMainCashRegister(registers: CashRegisterRecord[]) {
    const normalizedName = PDV_CASH_REGISTER_NAME.trim().toLowerCase();
    return registers.find((register) => register.nome.trim().toLowerCase() === normalizedName) || null;
  }

  function applyPdvCashState(state: PdvCashState) {
    setCashRegisters((current) => {
      const exists = current.some((register) => register.id === state.register.id);

      if (!exists) {
        return [state.register, ...current];
      }

      return current.map((register) =>
        register.id === state.register.id ? state.register : register
      );
    });
    setCashSessions(state.activeSession ? [state.activeSession] : []);
  }

  async function fetchPdvCashState() {
    const response = await fetch(`/api/finance/pdv-cash?_ts=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PdvCashState;
  }

  async function ensureMainCashRegister() {
    const state = await fetchPdvCashState();

    if (!state) {
      return null;
    }

    applyPdvCashState(state);
    return state.register;
  }

  async function openCashAutomatically() {
    if (autoOpeningCashRef.current) {
      return null;
    }

    autoOpeningCashRef.current = true;
    setOpeningCash(true);

    try {
      const response = await fetch("/api/finance/pdv-cash", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          openingBalance: 0,
          openingNotes: "Abertura manual pelo botão do PDV.",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        window.alert(data.message || "Não foi possível abrir o caixa.");
        return null;
      }

      const state = (await response.json()) as PdvCashState;
      applyPdvCashState(state);
      return state;
    } finally {
      autoOpeningCashRef.current = false;
      setOpeningCash(false);
    }
  }

  async function ensurePdvIsOpen() {
    const currentState = await fetchPdvCashState();

    if (currentState) {
      applyPdvCashState(currentState);
    }

    return currentState;
  }

  async function loadSalesAndProducts() {
    const [productsResponse, salesResponse] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/sales"),
    ]);

    const [productData, saleData] = await Promise.all([
      productsResponse.json(),
      salesResponse.json(),
    ]);

    setProducts(extractArray<Product>(productData));
    setSales(extractArray<Sale>(saleData));
  }

  async function exportSalesHistory() {
    const response = await fetch("/api/sales?all=true", { cache: "no-store" });
    if (!response.ok) {
      window.alert("Não foi possível exportar as vendas.");
      return;
    }
    const records = extractArray<Sale>(await response.json());
    exportRowsToXlsx(records.map((sale) => ({
      ID: sale.id,
      Data: new Date(sale.createdAt).toLocaleString("pt-BR"),
      Cliente: sale.member?.nome || "",
      Total: Number(sale.total),
      Status: sale.status,
      Observações: sale.observacoes || "",
      Produtos: sale.items.map((item) => `${item.product.nome} (${item.quantidade})`).join(" | "),
      Pagamentos: sale.payments.map((payment) => `${payment.metodo}: ${payment.valor}`).join(" | "),
    })), "vendas.xlsx", "Vendas");
  }

  async function refreshCashState() {
    const [registersResponse, bankAccountsResponse, ledgerResponse, pdvCashState] = await Promise.all([
      fetch(`/api/finance/cash-registers?perPage=100&page=1&_ts=${Date.now()}`, {
        cache: "no-store",
      }),
      fetch(`/api/finance/bank-accounts?perPage=100&page=1&_ts=${Date.now()}`, {
        cache: "no-store",
      }),
      fetch(`/api/finance/cash-ledger?perPage=1&page=1&_ts=${Date.now()}`, {
        cache: "no-store",
      }),
      fetchPdvCashState(),
    ]);

    const [registersPayload, bankAccountsPayload, ledgerPayload] = await Promise.all([
      registersResponse.json(),
      bankAccountsResponse.json(),
      ledgerResponse.json(),
    ]);

    const registers = extractArray<CashRegisterRecord>(
      registersPayload && typeof registersPayload === "object" && "data" in registersPayload
        ? (registersPayload as { data?: { data?: unknown } }).data?.data
        : registersPayload
    );
    const bankData = extractArray<BankAccountRecord>(
      bankAccountsPayload && typeof bankAccountsPayload === "object" && "data" in bankAccountsPayload
        ? (bankAccountsPayload as { data?: { data?: unknown } }).data?.data
        : bankAccountsPayload
    );
    const ledgerData =
      ledgerPayload &&
      typeof ledgerPayload === "object" &&
      "accounts" in ledgerPayload &&
      Array.isArray((ledgerPayload as { accounts?: unknown }).accounts)
        ? ((ledgerPayload as { accounts: LedgerAccountRecord[] }).accounts)
        : [];

    setBankAccounts(bankData);
    setLedgerAccounts(ledgerData);

    if (pdvCashState) {
      const registersWithoutPdv = registers.filter(
        (register) => register.id !== pdvCashState.register.id
      );
      setCashRegisters([pdvCashState.register, ...registersWithoutPdv]);
      setCashSessions(pdvCashState.activeSession ? [pdvCashState.activeSession] : []);
      return;
    }

    setCashRegisters(registers);

    if (!findMainCashRegister(registers)?.id) {
      setCashSessions([]);
      return;
    }
  }

  async function resolveMainCashRegister() {
    return ensureMainCashRegister();
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      await loadSalesAndProducts();
      const initialState = await ensurePdvIsOpen();

      if (!active) {
        return;
      }

      if (!initialState?.activeSession) {
        await refreshCashState();
      }

      if (active) {
        setBootstrappingCash(false);
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const mainCashRegister = useMemo(
    () => findMainCashRegister(cashRegisters),
    [cashRegisters]
  );

  const activeCashSession = useMemo(
    () => cashSessions.find((session) => !session.closedAt) || null,
    [cashSessions]
  );

  const pdvIsOpen = Boolean(mainCashRegister?.aberto || activeCashSession);

  useEffect(() => {
    if (bootstrappingCash) {
      return;
    }

    const syncCashState = () => {
      void ensurePdvIsOpen().then((state) => {
        if (!state?.activeSession) {
          void refreshCashState();
        }
      });
    };

    syncCashState();
    const intervalId = window.setInterval(syncCashState, 15000);
    window.addEventListener("focus", syncCashState);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncCashState);
    };
  }, [bootstrappingCash]);

  const destinationAccounts = useMemo(() => {
    const names = [
      ...bankAccounts.map((account) => account.nome),
      ...cashRegisters.map((register) => register.nome),
      ...ledgerAccounts.map((account) => account.name),
    ];
    return names.filter(
      (name, index, array) =>
        name !== PDV_CASH_REGISTER_NAME &&
        name !== "Conta PDV" &&
        array.indexOf(name) === index
    );
  }, [bankAccounts, cashRegisters, ledgerAccounts]);

  useEffect(() => {
    if (!destinationAccounts.length) {
      setWithdrawalForm((current) => ({ ...current, toAccount: "" }));
      return;
    }

    setWithdrawalForm((current) =>
      current.toAccount && destinationAccounts.includes(current.toAccount)
        ? current
        : { ...current, toAccount: destinationAccounts[0] }
    );
  }, [destinationAccounts]);

  const filteredProducts = products.filter((product) => {
    const query = normalizeSearchText(productQuery);

    return (
      normalizeSearchText(product.nome).includes(query) ||
      normalizeSearchText(product.sku).includes(query)
    );
  });
  const productTotalPages = Math.max(Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE), 1);
  const paginatedProducts = filteredProducts.slice(
    (productPage - 1) * PRODUCTS_PER_PAGE,
    productPage * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    setProductPage((current) => Math.min(current, productTotalPages));
  }, [productTotalPages]);

  const subtotal = useMemo(
    () => cart.reduce((total, item) => total + priceNumber(item.unitPrice) * item.quantidade, 0),
    [cart]
  );
  const total = subtotal;
  const cashReceivedAmount = Number(cashReceived || 0);
  const changeAmount =
    selectedMethod === "DINHEIRO" ? Math.max(cashReceivedAmount - total, 0) : 0;
  const hasInsufficientCash =
    selectedMethod === "DINHEIRO" && cart.length > 0 && cashReceived !== "" && cashReceivedAmount < total;

  const todaySales = useMemo(() => {
    const today = new Date().toDateString();

    return sales.filter(
      (sale) =>
        sale.status === "PAID" &&
        new Date(sale.createdAt).toDateString() === today
    );
  }, [sales]);

  const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const paymentTotals = todaySales.reduce<Record<string, number>>((acc, sale) => {
    sale.payments.forEach((payment) => {
      acc[payment.metodo] = (acc[payment.metodo] || 0) + Number(payment.valor || 0);
    });

    return acc;
  }, {});
  const salesHistoryTotalPages = Math.max(
    Math.ceil(sales.length / SALES_HISTORY_PER_PAGE),
    1
  );
  const paginatedSalesHistory = sales.slice(
    (salesHistoryPage - 1) * SALES_HISTORY_PER_PAGE,
    salesHistoryPage * SALES_HISTORY_PER_PAGE
  );

  useEffect(() => {
    setSalesHistoryPage((current) => Math.min(current, salesHistoryTotalPages));
  }, [salesHistoryTotalPages]);

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantidade: item.quantidade + 1 } : item
        );
      }

      return [
        ...current,
        {
          product,
          quantidade: 1,
          unitPrice: priceNumber(product.precoVenda).toFixed(2),
        },
      ];
    });
  }

  function updateCartUnitPrice(productId: string, unitPrice: string) {
    setCart((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, unitPrice }
          : item
      )
    );
  }

  function removeProduct(productId: string) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  function decreaseProduct(productId: string) {
    setCart((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantidade: Math.max(item.quantidade - 1, 1) }
          : item
      )
    );
  }

  async function openConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (cart.length === 0) {
      window.alert("Adicione produtos ao carrinho.");
      return;
    }

    if (!pdvIsOpen) {
      const state = await ensurePdvIsOpen();

      if (!state?.activeSession) {
        window.alert("Abra o caixa antes de finalizar a venda.");
        return;
      }
    }

    if (selectedMethod === "DINHEIRO") {
      if (!cashReceived) {
        window.alert("Informe o valor recebido em dinheiro.");
        return;
      }

      if (cashReceivedAmount < total) {
        window.alert("O valor recebido não pode ser menor que o total da venda.");
        return;
      }
    }

    setConfirmOpen(true);
  }

  async function submitSale() {
    setSubmitting(true);

    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: "",
        desconto: 0,
        acrescimo: 0,
        observacoes:
          selectedMethod === "DINHEIRO"
            ? encodeReceiptMeta({
                cashReceived: cashReceivedAmount,
                change: changeAmount,
              })
            : null,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantidade: item.quantidade,
          valorUnitario: priceNumber(item.unitPrice),
        })),
        payments: [{ metodo: selectedMethod, valor: total }],
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setSubmitting(false);
      window.alert(data.message || "Não foi possível finalizar a venda.");
      return;
    }

    const createdSale = (await response.json()) as Sale;

    setCart([]);
    setSelectedMethod("PIX");
    setCashReceived("");
    setConfirmOpen(false);
    setSubmitting(false);
    await loadSalesAndProducts();
    setReceiptPromptSale(createdSale);
  }

  async function cancelSale(id: string) {
    await fetch(`/api/sales/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    await loadSalesAndProducts();
  }

  async function handleOpenCash() {
    setOpeningCash(true);
    const response = await fetch("/api/finance/pdv-cash", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open",
        openingBalance: Number(openCashForm.openingBalance || 0),
        openingNotes: openCashForm.openingNotes,
      }),
    });
    const data = await response.json();
    setOpeningCash(false);

    if (!response.ok) {
      window.alert(data.message || "Não foi possível abrir o caixa.");
      return;
    }

    applyPdvCashState(data as PdvCashState);
    setShowOpenCashModal(false);
    setOpenCashForm({ openingBalance: "", openingNotes: "" });
    await refreshCashState();
  }

  async function handleCloseCash() {
    const cashRegister = mainCashRegister || (await resolveMainCashRegister());

    if (!cashRegister) {
      window.alert("PDV principal não encontrado.");
      return;
    }

    setClosingCash(true);
    const response = await fetch(`/api/finance/cash-registers/${cashRegister.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        closingNotes: "Fechamento manual pelo botão do PDV.",
      }),
    });
    const data = await response.json();
    setClosingCash(false);

    if (!response.ok) {
      window.alert(data.message || "Não foi possível fechar o caixa.");
      return;
    }

    setShowCloseCashModal(false);
    await refreshCashState();
  }

  async function handleCashWithdrawal() {
    if (!withdrawalForm.toAccount) {
      window.alert("Selecione a conta de destino da sangria.");
      return;
    }

    setWithdrawingCash(true);
    const response = await fetch("/api/finance/pdv-cash", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sangria",
        toAccount: withdrawalForm.toAccount,
        amount: Number(withdrawalForm.amount || 0),
        description: withdrawalForm.description,
        transferDate: withdrawalForm.transferDate,
      }),
    });
    const data = await response.json();
    setWithdrawingCash(false);

    if (!response.ok) {
      window.alert(data.message || "Não foi possível realizar a sangria.");
      return;
    }

    setShowWithdrawalModal(false);
    setWithdrawalForm({
      toAccount: destinationAccounts[0] || "",
      amount: "",
      description: "",
      transferDate: new Date().toISOString().slice(0, 10),
    });
    await refreshCashState();
  }

  async function openCashModal() {
    setShowOpenCashModal(true);
    void refreshCashState();
  }

  async function openWithdrawalModal() {
    const cashRegister = mainCashRegister || (await resolveMainCashRegister());

    if (!cashRegister) {
      window.alert("PDV principal não encontrado.");
      return;
    }

    if (!pdvIsOpen) {
      window.alert("Abra o caixa antes de realizar a sangria.");
      return;
    }

    if (!destinationAccounts.length) {
      window.alert("Cadastre pelo menos uma conta de destino para realizar a sangria.");
      return;
    }

    setWithdrawalForm((current) => ({
      ...current,
      toAccount:
        current.toAccount && destinationAccounts.includes(current.toAccount)
          ? current.toAccount
          : destinationAccounts[0],
    }));
    setShowWithdrawalModal(true);
  }

  function printSale(sale: Sale) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      return;
    }

    const logoUrl = `${window.location.origin}/logo.png`;
    const receiptMeta = parseReceiptMeta(sale.observacoes);
    const itemsHtml = sale.items
      .map(
        (item) => `
          <tr>
            <td>${item.product.nome}</td>
            <td style="text-align:center">${item.quantidade}</td>
            <td style="text-align:right">${currency(item.subtotal)}</td>
          </tr>
        `
      )
      .join("");

    const paymentsHtml = sale.payments
      .map(
        (payment) => `
          <tr>
            <td>${paymentLabel(payment.metodo)}</td>
            <td style="text-align:right">${currency(payment.valor)}</td>
          </tr>
        `
      )
      .join("");

    const receiptTotalsHtml =
      sale.payments.some((payment) => payment.metodo === "DINHEIRO") && receiptMeta
        ? `
          <div style="margin-top: 12px;">
            <p><strong>Valor recebido:</strong> ${currency(receiptMeta.cashReceived)}</p>
            <p><strong>Troco:</strong> ${currency(receiptMeta.change)}</p>
          </div>
        `
        : "";

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo de venda</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; padding: 32px; color: #171717; }
            .header { display:flex; align-items:center; gap:20px; margin-bottom:24px; }
            .header img { width:84px; height:84px; object-fit:contain; }
            .title { font-size:28px; font-weight:700; margin:0; }
            .subtitle { margin:4px 0 0; color:#6E675C; }
            .block { margin-top:24px; }
            .label { font-size:12px; text-transform:uppercase; letter-spacing:.18em; color:#C6921E; margin-bottom:8px; }
            table { width:100%; border-collapse:collapse; }
            th, td { padding:10px 0; border-bottom:1px solid #E9E1D2; font-size:14px; }
            th { text-align:left; color:#6E675C; }
            .total { margin-top:20px; display:flex; justify-content:space-between; font-size:26px; font-weight:700; }
          </style>
        </head>
        <body>
          <div class="header">
            <img id="sale-receipt-logo" src="${logoUrl}" alt="Estrela de Olorum" />
            <div>
              <h1 class="title">Recibo de venda</h1>
              <p class="subtitle">Estrela de Olorum</p>
            </div>
          </div>

          <div class="block">
            <div class="label">Dados da venda</div>
            <p><strong>Venda:</strong> ${sale.id}</p>
            <p><strong>Data:</strong> ${new Date(sale.createdAt).toLocaleString("pt-BR")}</p>
            <p><strong>Cliente:</strong> ${sale.member?.nome || "Cliente não informado"}</p>
          </div>

          <div class="block">
            <div class="label">Produtos</div>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th style="text-align:center">Qtd.</th>
                  <th style="text-align:right">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>

          <div class="block">
            <div class="label">Pagamento</div>
            <table>
              <thead>
                <tr>
                  <th>Forma de pagamento</th>
                  <th style="text-align:right">Valor</th>
                </tr>
              </thead>
              <tbody>${paymentsHtml}</tbody>
            </table>
            ${receiptTotalsHtml}
          </div>

          <div class="total">
            <span>Total</span>
            <span>${currency(sale.total)}</span>
          </div>
          <script>
            (function() {
              const triggerPrint = () => {
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 250);
              };

              const logo = document.getElementById("sale-receipt-logo");
              if (logo && !logo.complete) {
                logo.addEventListener("load", triggerPrint, { once: true });
                logo.addEventListener("error", triggerPrint, { once: true });
                setTimeout(triggerPrint, 1200);
              } else {
                window.addEventListener("load", triggerPrint, { once: true });
                setTimeout(triggerPrint, 700);
              }
            })();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  async function downloadReceipt(sale: Sale) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const receiptMeta = parseReceiptMeta(sale.observacoes);

    try {
      const logoDataUrl = await loadLogoDataUrl();
      doc.addImage(logoDataUrl, "PNG", 14, 10, 24, 24);
    } catch {
      // segue sem bloquear o recibo
    }

    doc.setFontSize(18);
    doc.text("Recibo de venda", 44, 18);
    doc.setFontSize(11);
    doc.text(`Venda: ${sale.id}`, 14, 40);
    doc.text(`Data: ${new Date(sale.createdAt).toLocaleString("pt-BR")}`, 14, 48);
    doc.text(`Cliente: ${sale.member?.nome || "Cliente não informado"}`, 14, 56);

    let y = 70;
    sale.items.forEach((item) => {
      doc.text(
        `${item.product.nome} x ${item.quantidade} - ${currency(item.subtotal)}`,
        14,
        y
      );
      y += 8;
    });

    y += 4;
    doc.setFontSize(13);
    doc.text(`Total: ${currency(sale.total)}`, 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(
      `Pagamento: ${sale.payments.map((payment) => `${paymentLabel(payment.metodo)} ${currency(payment.valor)}`).join(", ")}`,
      14,
      y
    );

    if (sale.payments.some((payment) => payment.metodo === "DINHEIRO") && receiptMeta) {
      y += 8;
      doc.text(`Valor recebido: ${currency(receiptMeta.cashReceived)}`, 14, y);
      y += 8;
      doc.text(`Troco: ${currency(receiptMeta.change)}`, 14, y);
    }

    doc.save(`recibo-${sale.id}.pdf`);
  }

  async function downloadCashClosing(session?: CashSessionRecord | null) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Fechamento de caixa", 14, 18);
    doc.setFontSize(11);
    doc.text(
      `Data: ${session?.closedAt ? new Date(session.closedAt).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR")}`,
      14,
      30
    );
    doc.text(`Vendas finalizadas: ${todaySales.length}`, 14, 38);
    doc.text(`Total vendido: ${currency(todayTotal)}`, 14, 46);

    let y = 60;
    if (session) {
      doc.text(`Abertura: ${new Date(session.openedAt).toLocaleString("pt-BR")}`, 14, y);
      y += 8;
      doc.text(`Saldo de abertura: ${currency(session.openingBalance)}`, 14, y);
      y += 8;
      doc.text(`Saldo de fechamento: ${currency(session.closingBalance || 0)}`, 14, y);
      y += 8;
      if (session.closingNotes) {
        doc.text(`Observações: ${session.closingNotes}`, 14, y);
        y += 10;
      }
    }

    Object.entries(paymentTotals).forEach(([method, value]) => {
      doc.text(`${paymentLabel(method)}: ${currency(value)}`, 14, y);
      y += 8;
    });

    y += 6;
    doc.setFontSize(13);
    doc.text("Vendas", 14, y);
    y += 10;
    doc.setFontSize(10);

    todaySales.forEach((sale) => {
      if (y > 280) {
        doc.addPage();
        y = 18;
      }

      doc.text(
        `${new Date(sale.createdAt).toLocaleTimeString("pt-BR")} - ${sale.member?.nome || "Cliente não informado"} - ${currency(sale.total)}`,
        14,
        y
      );
      y += 7;
    });

    doc.save(`fechamento-caixa-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <main className="space-y-7 p-4 sm:p-6 lg:p-8">
      <section className="rounded-[32px] border border-[#ECE7DB] bg-white px-6 py-6 shadow-sm lg:px-8">
        <div className="flex flex-col gap-5 border-b border-[#EEE7D9] pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
              <span>início</span>
              <span>—</span>
              <span>vendas</span>
              <span className="font-medium text-[#191919]">pdv</span>
            </div>
            <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#171717]">PDV</h1>
            <p className="text-base text-[#7A746A]">Carrinho, múltiplos pagamentos, recibo, PDV e histórico.</p>
            <p className={`text-base font-semibold ${pdvIsOpen ? "text-[#167C3B]" : "text-[#B42318]"}`}>
              {bootstrappingCash
                ? "Verificando PDV..."
                : openingCash
                  ? "Abrindo PDV..."
                : pdvIsOpen
                  ? "PDV aberto"
                  : "PDV fechado"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {!pdvIsOpen ? (
              <button
                type="button"
                onClick={() => void openCashAutomatically()}
                disabled={openingCash}
                className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-full bg-[#2F5BFF] px-7 py-4 text-base font-semibold text-white shadow-sm disabled:opacity-60"
              >
                <Landmark size={22} />
                {openingCash ? "Abrindo..." : "Abrir caixa"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void openWithdrawalModal()}
                  className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-full border border-[#E9E1D2] bg-white px-7 py-4 text-base font-semibold text-[#1D1B18]"
                >
                  <ArrowRightLeft size={22} />
                  Sangria
                </button>
                <button
                  type="button"
                  onClick={() => void handleCloseCash()}
                  disabled={closingCash}
                  className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-full border border-[#E9E1D2] bg-white px-7 py-4 text-base font-semibold text-[#1D1B18]"
                >
                  <RotateCcw size={22} />
                  {closingCash ? "Fechando..." : "Fechar caixa"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,2fr)_minmax(430px,0.95fr)]">
        <section className="rounded-[32px] border border-[#ECE7DB] bg-white p-6 shadow-sm lg:p-7">
          <div className="mb-5 flex min-h-[58px] items-center gap-3 rounded-[22px] border border-[#E9E1D2] px-5 py-3 text-base text-slate-500">
            <Search size={22} />
            <input
              value={productQuery}
              onChange={(event) => {
                setProductQuery(event.target.value);
                setProductPage(1);
              }}
              placeholder="Pesquisar produtos"
              className="w-full bg-transparent text-lg outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="overflow-visible">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {paginatedProducts.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="grid min-h-[140px] grid-cols-[104px_1fr] gap-5 rounded-[28px] border border-[#E9E1D2] p-5 text-left transition hover:border-[#C6921E] active:scale-[0.99]"
                >
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                    {product.foto ? (
                      <Image
                        src={product.foto}
                        alt={product.nome}
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ShoppingCart size={38} className="text-slate-400" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col justify-center">
                    <p className="text-lg font-bold leading-snug text-slate-900">{product.nome}</p>
                    <p className="mt-2 text-base text-slate-500">Estoque: {product.estoque}</p>
                    <p className="mt-3 text-[22px] font-extrabold text-[#B8860B]">{currency(product.precoVenda)}</p>
                  </div>
                </button>
              ))}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E9E1D2] px-5 py-8 text-center text-sm text-[#7A746A]">
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-3 border-t border-[#EEE7D9] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[#7A746A]">
                  Mostrando {paginatedProducts.length} de {filteredProducts.length} produto(s)
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setProductPage((current) => Math.max(current - 1, 1))}
                    disabled={productPage <= 1}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#171717] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Página anterior de produtos"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-20 text-center text-sm font-semibold text-[#171717]">
                    {productPage} / {productTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProductPage((current) => Math.min(current + 1, productTotalPages))}
                    disabled={productPage >= productTotalPages}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#171717] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Próxima página de produtos"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <form onSubmit={openConfirm} className="rounded-[32px] border border-[#ECE7DB] bg-white p-6 shadow-sm lg:p-7">
          <div className="mb-5 flex items-center gap-3">
            <ShoppingCart className="text-[#C6921E]" size={30} />
            <h2 className="text-[30px] font-bold text-slate-900">Carrinho</h2>
          </div>

          <div className="max-h-[330px] space-y-4 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#F0E9DC] px-4 py-4">
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-snug text-slate-800">{item.product.nome}</p>
                    <label className="mt-2 block">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Preço unitário
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) => updateCartUnitPrice(item.product.id, event.target.value)}
                        className="mt-1 h-11 w-36 rounded-xl border border-[#E9E1D2] px-3 text-base font-bold text-[#B8860B] outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decreaseProduct(item.product.id)}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E9E1D2] bg-white text-[#171717] transition hover:bg-[#FAF7F0] active:scale-95"
                      aria-label={`Diminuir uma unidade de ${item.product.nome}`}
                    >
                      <Minus size={24} strokeWidth={2.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => addProduct(item.product)}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2F5BFF]/20 bg-[#EEF3FF] text-[#2F5BFF] transition hover:bg-[#E2EAFF] active:scale-95"
                      aria-label={`Adicionar mais uma unidade de ${item.product.nome}`}
                    >
                      <Plus size={24} strokeWidth={2.8} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    value={item.quantidade}
                    onChange={(event) =>
                      setCart((current) =>
                        current.map((currentItem) =>
                          currentItem.product.id === item.product.id
                            ? { ...currentItem, quantidade: Math.max(Number(event.target.value), 1) }
                            : currentItem
                        )
                      )
                    }
                    className="h-14 w-24 rounded-2xl border border-[#E9E1D2] px-3 text-center text-xl font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => removeProduct(item.product.id)}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-red-200 text-red-600 transition hover:bg-red-50"
                    aria-label={`Remover ${item.product.nome}`}
                  >
                    <Trash2 size={22} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[28px] border border-[#E9E1D2] p-4">
            <div className="grid grid-cols-2 gap-4">
              {methods.map((method) => {
                const Icon = method.icon;

                return (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setSelectedMethod(method.value)}
                    className={`flex min-h-[86px] items-center gap-4 rounded-[22px] border px-5 py-5 text-lg font-bold transition active:scale-[0.99] ${
                      selectedMethod === method.value
                        ? "border-[#2F5BFF] bg-[#EEF3FF] text-[#2F5BFF]"
                        : "border-[#E9E1D2] text-[#171717] hover:bg-[#FAF7F0]"
                    }`}
                  >
                    <Icon size={28} />
                    {method.label}
                  </button>
                );
              })}
            </div>

            {selectedMethod === "DINHEIRO" ? (
              <div className="mt-5 grid gap-4">
                <label className="space-y-2">
                  <span className="text-lg font-semibold text-[#6E675C]">Valor recebido</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    placeholder="Digite o valor recebido"
                    className="h-16 w-full rounded-2xl border border-[#E9E1D2] px-5 text-xl font-semibold text-[#171717] outline-none"
                  />
                </label>

                <div className="rounded-[24px] bg-[#FAF7F0] px-5 py-5">
                  <div className="flex items-center justify-between text-lg text-[#6E675C]">
                    <span>Total</span>
                    <span className="text-xl font-bold">{currency(total)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-lg text-[#6E675C]">
                    <span>Recebido</span>
                    <span className="text-xl font-bold">{currency(cashReceivedAmount)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[28px] font-extrabold">
                    <span className="text-[#171717]">Troco</span>
                    <span className={hasInsufficientCash ? "text-[#B42318]" : "text-[#167C3B]"}>
                      {hasInsufficientCash
                        ? `Faltam ${currency(total - cashReceivedAmount)}`
                        : currency(changeAmount)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-[24px] bg-slate-50 p-5">
            <div className="flex justify-between text-lg text-slate-500">
              <span>Subtotal</span>
              <span className="font-semibold">{currency(subtotal)}</span>
            </div>
            <div className="mt-3 flex justify-between text-[30px] font-extrabold text-slate-900">
              <span>Total</span>
              <span>{currency(total)}</span>
            </div>
          </div>

          <button
            type="submit"
            className="mt-5 min-h-[68px] w-full rounded-full bg-[#2F5BFF] px-6 py-5 text-xl font-bold text-white shadow-sm active:scale-[0.99]"
          >
            Finalizar venda
          </button>
        </form>
      </div>

      <section className="rounded-[32px] border border-[#ECE7DB] bg-white p-6 shadow-sm lg:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
            <h2 className="mt-2 text-[28px] font-bold text-slate-900">Fechamento de caixa</h2>
            <p className="mt-1 text-base text-slate-500">
              {todaySales.length} vendas hoje • {currency(todayTotal)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void downloadCashClosing()}
              className="inline-flex min-h-[54px] items-center justify-center gap-3 rounded-full border border-[#E9E1D2] bg-white px-6 py-4 text-base font-semibold text-[#1D1B18]"
            >
              <Download size={22} />
              Baixar PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {methods.map((method) => (
            <div key={method.value} className="rounded-[26px] border border-[#E9E1D2] bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {method.label}
              </p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">
                {currency(paymentTotals[method.value] || 0)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE7D9] px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Histórico</p>
            <h2 className="mt-2 text-[28px] font-bold text-slate-900">Vendas</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <SpreadsheetImportActions resource="sales" />
          <button type="button" onClick={() => void exportSalesHistory()}
            className="inline-flex items-center gap-2 rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-semibold">
            <Download size={17} /> Exportar planilha
          </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-base">
            <thead className="text-xs uppercase tracking-wider text-[#7A746A]">
              <tr>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Data</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Cliente</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Total</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Status</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSalesHistory.map((sale) => (
                <tr key={sale.id} className="border-b border-[#F0E9DC]">
                  <td className="px-6 py-4">{new Date(sale.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="px-6 py-4">{sale.member?.nome || "Cliente não informado"}</td>
                  <td className="px-6 py-4">{currency(sale.total)}</td>
                  <td className="px-6 py-4">{sale.status}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => printSale(sale)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#E9E1D2] text-slate-600"><Printer size={20} /></button>
                      <button type="button" onClick={() => void downloadReceipt(sale)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#E9E1D2] text-slate-600"><Download size={20} /></button>
                      {!sale.observacoes?.includes("[IMPORT_REF:") && <button type="button" onClick={() => void cancelSale(sale.id)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-red-200 text-red-600"><RotateCcw size={20} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#EEE7D9] px-6 py-4 text-sm text-[#7A746A] sm:flex-row sm:items-center sm:justify-between">
          <span>
            Mostrando {paginatedSalesHistory.length} de {sales.length} venda(s)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={salesHistoryPage <= 1}
              onClick={() => setSalesHistoryPage((current) => Math.max(current - 1, 1))}
              className="rounded-full border border-[#E9E1D2] px-4 py-2 font-semibold text-[#1D1B18] disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="rounded-full bg-[#171717] px-4 py-2 font-semibold text-white">
              {String(salesHistoryPage).padStart(2, "0")} de {salesHistoryTotalPages}
            </span>
            <button
              type="button"
              disabled={salesHistoryPage >= salesHistoryTotalPages}
              onClick={() =>
                setSalesHistoryPage((current) =>
                  Math.min(current + 1, salesHistoryTotalPages)
                )
              }
              className="rounded-full border border-[#E9E1D2] px-4 py-2 font-semibold text-[#1D1B18] disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
        <div className="border-b border-[#EEE7D9] px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
          <h2 className="mt-2 text-[22px] font-bold text-slate-900">Relatórios de fechamento</h2>
        </div>
        <div className="divide-y divide-[#F0E9DC]">
          {cashSessions.filter((session) => Boolean(session.closedAt)).length === 0 ? (
            <div className="px-6 py-8 text-sm text-[#7A746A]">
              Nenhum fechamento de caixa registrado ainda.
            </div>
          ) : (
            cashSessions
              .filter((session) => Boolean(session.closedAt))
              .map((session) => (
                <div key={session.id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-[#171717]">
                      Fechamento em {session.closedAt ? new Date(session.closedAt).toLocaleString("pt-BR") : "—"}
                    </p>
                    <p className="mt-1 text-sm text-[#7A746A]">
                      Abertura: {new Date(session.openedAt).toLocaleString("pt-BR")} • Saldo inicial: {currency(session.openingBalance)} • Saldo final: {currency(session.closingBalance || 0)}
                    </p>
                    {session.closingNotes ? (
                      <p className="mt-1 text-sm text-[#7A746A]">Obs.: {session.closingNotes}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => void downloadCashClosing(session)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E9E1D2] px-4 py-2 text-sm font-medium text-[#171717]"
                  >
                    <Download size={16} />
                    Baixar PDF
                  </button>
                </div>
              ))
          )}
        </div>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[560px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Confirmação</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Deseja finalizar a venda?
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  Confira os produtos e os pagamentos antes de confirmar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 rounded-[24px] bg-[#FAF7F0] p-5">
              <div className="flex justify-between text-sm text-[#7A746A]">
                <span>Itens no carrinho</span>
                <span>{cart.length}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-[#7A746A]">
                <span>Subtotal</span>
                <span>{currency(subtotal)}</span>
              </div>
              <div className="mt-3 flex justify-between text-[28px] font-bold text-[#171717]">
                <span>Total</span>
                <span>{currency(total)}</span>
              </div>
              {selectedMethod === "DINHEIRO" ? (
                <>
                  <div className="mt-3 flex justify-between text-sm text-[#7A746A]">
                    <span>Recebido</span>
                    <span>{currency(cashReceivedAmount)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-sm font-semibold">
                    <span className="text-[#171717]">Troco</span>
                    <span className={hasInsufficientCash ? "text-[#B42318]" : "text-[#167C3B]"}>
                      {hasInsufficientCash
                        ? `Faltam ${currency(total - cashReceivedAmount)}`
                        : currency(changeAmount)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Não
              </button>
              <button
                type="button"
                onClick={() => void submitSale()}
                disabled={submitting}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Finalizando..." : "Sim"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiptPromptSale ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[560px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Recibo</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Deseja imprimir o recibo?
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  O recibo vai sair com logotipo da Estrela de Olorum, produtos da venda e forma de pagamento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptPromptSale(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 rounded-[24px] bg-[#FAF7F0] p-5">
              <div className="flex justify-between text-sm text-[#7A746A]">
                <span>Venda</span>
                <span>{receiptPromptSale.id.slice(0, 8)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-[#7A746A]">
                <span>Produtos</span>
                <span>{receiptPromptSale.items.length}</span>
              </div>
              <div className="mt-3 flex justify-between text-[28px] font-bold text-[#171717]">
                <span>Total</span>
                <span>{currency(receiptPromptSale.total)}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setReceiptPromptSale(null)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Não
              </button>
              <button
                type="button"
                onClick={() => {
                  printSale(receiptPromptSale);
                  setReceiptPromptSale(null);
                }}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showOpenCashModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[620px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Abrir caixa
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  O PDV identificou que a conta está fechada. Informe se existe saldo inicial para começar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOpenCashModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Saldo inicial opcional</span>
                <input
                  type="number"
                  step="0.01"
                  value={openCashForm.openingBalance}
                  onChange={(event) =>
                    setOpenCashForm((current) => ({ ...current, openingBalance: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  placeholder="0,00"
                />
                <p className="text-xs text-[#7A746A]">
                  Se não informar, o caixa será aberto com saldo inicial zero.
                </p>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Observações</span>
                <textarea
                  rows={4}
                  value={openCashForm.openingNotes}
                  onChange={(event) =>
                    setOpenCashForm((current) => ({ ...current, openingNotes: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  placeholder="Observações da abertura"
                />
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowOpenCashModal(false)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleOpenCash()}
                disabled={openingCash}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {openingCash ? "Abrindo..." : "Abrir caixa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCloseCashModal && mainCashRegister ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[720px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Fechar caixa
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  Confira o relatório do dia antes de concluir o fechamento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseCashModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 rounded-[24px] bg-[#FAF7F0] p-5">
              <div className="flex justify-between text-sm text-[#7A746A]">
                <span>Vendas de hoje</span>
                <span>{todaySales.length}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-[#7A746A]">
                <span>Total vendido</span>
                <span>{currency(todayTotal)}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {methods.map((method) => (
                  <div key={method.value} className="rounded-2xl border border-[#E9E1D2] bg-white px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7A746A]">{method.label}</p>
                    <p className="mt-2 text-lg font-bold text-[#171717]">
                      {currency(paymentTotals[method.value] || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Saldo de fechamento</span>
                <input
                  type="number"
                  step="0.01"
                  value={closeCashForm.closingBalance}
                  onChange={(event) =>
                    setCloseCashForm((current) => ({ ...current, closingBalance: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  placeholder="0,00"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Observações do fechamento</span>
                <textarea
                  rows={4}
                  value={closeCashForm.closingNotes}
                  onChange={(event) =>
                    setCloseCashForm((current) => ({ ...current, closingNotes: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  placeholder="Observações do fechamento"
                />
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCloseCashModal(false)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCloseCash()}
                disabled={closingCash}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {closingCash ? "Fechando..." : "Fechar caixa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWithdrawalModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[620px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Caixa</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Sangria
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  Transfira um valor do caixa para outra conta do sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdrawalModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Conta de destino</span>
                <select
                  value={withdrawalForm.toAccount}
                  onChange={(event) =>
                    setWithdrawalForm((current) => ({ ...current, toAccount: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                >
                  {destinationAccounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#171717]">Data</span>
                  <input
                    type="date"
                    value={withdrawalForm.transferDate}
                    onChange={(event) =>
                      setWithdrawalForm((current) => ({ ...current, transferDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[#171717]">Valor</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={withdrawalForm.amount}
                    onChange={(event) =>
                      setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                    placeholder="0,00"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[#171717]">Histórico</span>
                <textarea
                  rows={4}
                  value={withdrawalForm.description}
                  onChange={(event) =>
                    setWithdrawalForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#E9E1D2] px-4 py-3 outline-none"
                  placeholder="Descreva a sangria"
                />
              </label>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawalModal(false)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCashWithdrawal()}
                disabled={withdrawingCash}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {withdrawingCash ? "Processando..." : "Confirmar sangria"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeCashPrompt ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[560px] rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Fechamento concluído</p>
                <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#171717]">
                  Deseja imprimir o fechamento do caixa?
                </h2>
                <p className="mt-3 text-base text-[#7A746A]">
                  Você pode gerar agora o relatório com totais e formas de pagamento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseCashPrompt(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E9E1D2] text-[#7A746A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 rounded-[24px] bg-[#FAF7F0] p-5">
              <div className="flex justify-between text-sm text-[#7A746A]">
                <span>Fechado em</span>
                <span>{closeCashPrompt.closedAt ? new Date(closeCashPrompt.closedAt).toLocaleString("pt-BR") : "—"}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-[#7A746A]">
                <span>Saldo de abertura</span>
                <span>{currency(closeCashPrompt.openingBalance)}</span>
              </div>
              <div className="mt-3 flex justify-between text-[28px] font-bold text-[#171717]">
                <span>Saldo de fechamento</span>
                <span>{currency(closeCashPrompt.closingBalance || 0)}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCloseCashPrompt(null)}
                className="rounded-full border border-[#E9E1D2] px-6 py-3 text-sm font-semibold text-[#171717]"
              >
                Não
              </button>
              <button
                type="button"
                onClick={() => {
                  void downloadCashClosing(closeCashPrompt);
                  setCloseCashPrompt(null);
                }}
                className="rounded-full bg-[#2F5BFF] px-6 py-3 text-sm font-semibold text-white"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
