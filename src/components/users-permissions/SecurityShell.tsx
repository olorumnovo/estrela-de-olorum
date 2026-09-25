"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard/usuarios", label: "Usuários" },
  { href: "/dashboard/usuarios/perfis", label: "Perfis" },
  { href: "/dashboard/usuarios/permissoes", label: "Permissões" },
  { href: "/dashboard/usuarios/matriz", label: "Matriz" },
  { href: "/dashboard/usuarios/logs", label: "Logs de Acesso" },
  { href: "/dashboard/usuarios/sessoes", label: "Sessões" },
  { href: "/dashboard/usuarios/auditoria", label: "Auditoria" },
];

export default function SecurityShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <section className="rounded-[28px] border border-[#ECE7DB] bg-white px-6 py-5 shadow-sm">
        <div className="space-y-2 border-b border-[#EEE7D9] pb-4">
          <div className="flex items-center gap-2 text-xs text-[#B0A89A]">
            <span>início</span>
            <span>—</span>
            <span>administração</span>
            <span className="font-medium text-[#191919]">{title.toLowerCase()}</span>
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-[#171717]">{title}</h1>
          <p className="text-sm text-[#7A746A]">{description}</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-[28px] border border-[#ECE7DB] bg-white p-3 shadow-sm">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href ||
              (tab.href !== "/dashboard/usuarios" &&
                pathname.startsWith(tab.href));

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[#171717] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
      </nav>

      {children}
    </main>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    INACTIVE: "bg-slate-50 text-slate-600 border-slate-200",
    BLOCKED: "bg-red-50 text-red-700 border-red-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const labels: Record<string, string> = {
    ACTIVE: "ATIVO",
    INACTIVE: "INATIVO",
    BLOCKED: "BLOQUEADO",
    PENDING: "PENDENTE",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
        styles[status] || styles.INACTIVE
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

export function CardMetric({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
        {title}
      </p>
      <h2 className="mt-3 text-4xl font-bold text-slate-900">{value}</h2>
    </section>
  );
}

export function formatDate(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
