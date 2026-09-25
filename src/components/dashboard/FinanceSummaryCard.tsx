"use client";

import { useEffect, useMemo, useState } from "react";

type FinanceSummaryCardProps = {
  periodMode: "month" | "period" | "custom";
  selectedMonth: string;
  startDate: string;
  endDate: string;
  customStartDate: string;
  customEndDate: string;
  selectedAccount: string;
  financeAccounts: string[];
  periodLabel: string;
  fallbackReceived: number;
  fallbackPaid: number;
  fallbackBalance: number;
};

type CashLedgerSummaryResponse = {
  summary?: {
    received?: number;
    paid?: number;
    balance?: number;
    receivedCount?: number;
    paidCount?: number;
    account?: string | null;
  };
};

type AccountListResponse = {
  data?: Array<{
    nome?: string | null;
  }>;
};

const ALL_FINANCE_ACCOUNTS = "TODAS";
const DEFAULT_FINANCE_SUMMARY_ACCOUNT = "Santander";

const DEFAULT_FINANCE_ACCOUNT_NAMES = [
  "Santander",
  "Caixa",
  "GetNet",
  "Investimentos Itaú",
  "Investimentos Santander",
  "Itaú",
  "Umbandei",
  "Rede",
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildFinanceAccounts(accounts: string[]) {
  const uniqueByNormalized = new Map<string, string>();

  [ALL_FINANCE_ACCOUNTS, ...DEFAULT_FINANCE_ACCOUNT_NAMES, ...accounts].forEach(
    (account) => {
      const trimmed = account.trim();

      if (!trimmed) {
        return;
      }

      const key = trimmed.toLocaleLowerCase("pt-BR");

      if (!uniqueByNormalized.has(key)) {
        uniqueByNormalized.set(key, trimmed);
      }
    }
  );

  const allAccountsLabel =
    uniqueByNormalized.get(ALL_FINANCE_ACCOUNTS.toLocaleLowerCase("pt-BR")) ||
    ALL_FINANCE_ACCOUNTS;
  const otherAccounts = [...uniqueByNormalized.values()]
    .filter((account) => account !== allAccountsLabel)
    .sort((left, right) => left.localeCompare(right, "pt-BR"));

  return [allAccountsLabel, ...otherAccounts];
}

function FinanceNumber({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="px-3">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-3 text-[22px] font-semibold tracking-[-0.03em] ${color}`}>
        {value}
      </p>
    </div>
  );
}

export default function FinanceSummaryCard({
  periodMode,
  selectedMonth,
  startDate,
  endDate,
  customStartDate,
  customEndDate,
  selectedAccount,
  financeAccounts,
  periodLabel,
  fallbackReceived,
  fallbackPaid,
  fallbackBalance,
}: FinanceSummaryCardProps) {
  const [received, setReceived] = useState(fallbackReceived);
  const [paid, setPaid] = useState(fallbackPaid);
  const [balance, setBalance] = useState(fallbackBalance);
  const [loading, setLoading] = useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [localPeriodMode, setLocalPeriodMode] = useState(periodMode);
  const [availableAccounts, setAvailableAccounts] = useState(
    buildFinanceAccounts(financeAccounts)
  );

  const resolvedSelectedAccount = useMemo(() => {
    const accountExists = availableAccounts.includes(selectedAccount);
    if (accountExists) {
      return selectedAccount;
    }

    return availableAccounts.includes(DEFAULT_FINANCE_SUMMARY_ACCOUNT)
      ? DEFAULT_FINANCE_SUMMARY_ACCOUNT
      : ALL_FINANCE_ACCOUNTS;
  }, [availableAccounts, selectedAccount]);

  useEffect(() => {
    setLocalPeriodMode(periodMode);
  }, [periodMode]);

  useEffect(() => {
    setAvailableAccounts(buildFinanceAccounts(financeAccounts));
  }, [financeAccounts]);

  useEffect(() => {
    let active = true;

    async function loadAccounts() {
      try {
        const [bankResponse, cashResponse] = await Promise.all([
          fetch("/api/finance/bank-accounts?page=1&perPage=100"),
          fetch("/api/finance/cash-registers?page=1&perPage=100"),
        ]);

        if (!active || !bankResponse.ok || !cashResponse.ok) {
          return;
        }

        const [bankData, cashData] = await Promise.all([
          bankResponse.json() as Promise<AccountListResponse>,
          cashResponse.json() as Promise<AccountListResponse>,
        ]);

        const mergedAccounts = buildFinanceAccounts([
          ...financeAccounts,
          ...(bankData.data || []).map((entry) => entry.nome || ""),
          ...(cashData.data || []).map((entry) => entry.nome || ""),
        ]);

        if (active) {
          setAvailableAccounts(mergedAccounts);
        }
      } catch {
        // mantém lista já disponível no servidor
      }
    }

    void loadAccounts();

    return () => {
      active = false;
    };
  }, [financeAccounts]);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setLoading(true);

      try {
        const params = new URLSearchParams({ startDate, endDate });

        const response = await fetch(`/api/dashboard/financial-summary?${params.toString()}`);
        const data = (await response.json()) as CashLedgerSummaryResponse;

        if (!active || !response.ok) {
          return;
        }

        setReceived(Number(data.summary?.received || 0));
        setPaid(Number(data.summary?.paid || 0));
        setBalance(Number(data.summary?.balance || 0));
        setReceivedCount(Number(data.summary?.receivedCount || 0));
        setPaidCount(Number(data.summary?.paidCount || 0));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [endDate, startDate]);

  const helperText =
    `${receivedCount} recebida(s) • ${paidCount} paga(s) no período`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-8">
        <h2 className="font-serif text-[25px] font-bold text-slate-950">
          Resumo Financeiro
        </h2>
        <form className="flex flex-wrap items-center justify-end gap-3">
          <select
            name="period"
            value={localPeriodMode}
            onChange={(event) =>
              setLocalPeriodMode(
                event.target.value as "month" | "period" | "custom"
              )
            }
            className="h-11 rounded-lg border border-slate-200 px-4 text-sm outline-none"
          >
            <option value="month">Por mês</option>
            <option value="period">Por período</option>
            <option value="custom">Personalizado</option>
          </select>

          {localPeriodMode === "month" ? (
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="h-11 rounded-lg border border-slate-200 px-4 text-sm outline-none"
            />
          ) : (
            <>
              <input
                type="date"
                name="startDate"
                defaultValue={customStartDate || startDate}
                className="h-11 rounded-lg border border-slate-200 px-4 text-sm outline-none"
              />
              <input
                type="date"
                name="endDate"
                defaultValue={customEndDate || endDate}
                className="h-11 rounded-lg border border-slate-200 px-4 text-sm outline-none"
              />
            </>
          )}

          <select
            name="account"
            defaultValue={resolvedSelectedAccount}
            className="h-11 rounded-lg border border-slate-200 px-4 text-sm outline-none"
          >
            {availableAccounts.map((accountName) => (
              <option key={accountName} value={accountName}>
                {accountName === ALL_FINANCE_ACCOUNTS
                  ? "Todas as contas"
                  : accountName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-lg bg-[#07111F] px-4 text-sm font-semibold text-white"
          >
            Aplicar
          </button>
        </form>
      </div>
      <div className="px-5 py-6 sm:px-8 sm:py-7">
        <p className="mb-5 text-sm text-slate-500">
          Período: {periodLabel}
        </p>
        <div className="grid grid-cols-3 divide-x divide-slate-200 text-center">
          <FinanceNumber
            label="Entradas"
            value={loading ? "Carregando..." : money(received)}
            color="text-emerald-700"
          />
          <FinanceNumber
            label="Saídas"
            value={loading ? "Carregando..." : money(paid)}
            color="text-red-700"
          />
          <FinanceNumber
            label="Saldo"
            value={loading ? "Carregando..." : money(balance)}
            color="text-[#B8860B]"
          />
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          {helperText}
        </p>
        <div className="mt-7 h-[230px] rounded-lg border border-slate-100 bg-linear-to-b from-white to-[#FBFAF7] p-5">
          <div className="relative h-full">
            {[0, 1, 2, 3, 4].map((line) => (
              <div
                key={line}
                className="absolute left-0 right-0 border-t border-slate-200"
                style={{ top: `${line * 25}%` }}
              />
            ))}
            <div className="absolute bottom-[15%] left-[3%] h-[2px] w-[92%] rotate-[-7deg] bg-emerald-700" />
            <div className="absolute bottom-[30%] left-[6%] h-[2px] w-[86%] rotate-[-2deg] bg-emerald-700" />
            <div className="absolute bottom-[10%] left-[4%] h-[2px] w-[90%] rotate-[-5deg] bg-red-600" />
          </div>
        </div>
      </div>
    </>
  );
}
