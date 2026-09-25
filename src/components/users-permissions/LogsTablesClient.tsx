"use client";

import { useEffect, useState } from "react";

import SecurityShell, { formatDate, StatusBadge } from "./SecurityShell";

type AnyRecord = {
  id: string;
  user?: { nome?: string | null } | null;
  actorUser?: { nome?: string | null } | null;
  email?: string | null;
  success?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  createdAt?: string | Date | null;
  expiresAt?: string | Date | null;
  revokedAt?: string | Date | null;
  acao?: string | null;
  descricao?: string | null;
};

const endpoints = {
  logs: "/api/access-logs",
  sessions: "/api/sessions",
  audit: "/api/user-audit-logs",
};

export default function LogsTablesClient({
  mode,
}: {
  mode: "logs" | "sessions" | "audit";
}) {
  const [records, setRecords] = useState<AnyRecord[]>([]);

  async function load() {
    const response = await fetch(endpoints[mode]);
    setRecords(await response.json());
  }

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      const response = await fetch(endpoints[mode]);
      const data = await response.json();

      if (active) {
        setRecords(Array.isArray(data) ? data : []);
      }
    }

    void loadRecords();

    return () => {
      active = false;
    };
  }, [mode]);

  async function revoke(id: string) {
    await fetch(`/api/sessions/${id}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await load();
  }

  const title =
    mode === "logs"
      ? "Logs de Acesso"
      : mode === "sessions"
        ? "Sessões Ativas"
        : "Auditoria de Usuários";

  return (
    <SecurityShell title={title} description="Monitoramento de segurança e rastreabilidade do módulo.">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {mode === "logs" && (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Usuário</th><th className="px-6 py-4">Email usado</th><th className="px-6 py-4">Resultado</th><th className="px-6 py-4">IP</th><th className="px-6 py-4">Navegador</th><th className="px-6 py-4">Motivo</th><th className="px-6 py-4">Data</th></tr>
              </thead>
              <tbody>{records.map((log) => <tr key={log.id} className="border-b border-slate-100"><td className="px-6 py-4">{log.user?.nome || "-"}</td><td className="px-6 py-4">{log.email}</td><td className="px-6 py-4"><StatusBadge status={log.success ? "ACTIVE" : "BLOCKED"} /></td><td className="px-6 py-4">{log.ip || "-"}</td><td className="px-6 py-4 max-w-[280px] truncate">{log.userAgent || "-"}</td><td className="px-6 py-4">{log.reason || "-"}</td><td className="px-6 py-4">{formatDate(log.createdAt)}</td></tr>)}</tbody>
            </table>
          )}
          {mode === "sessions" && (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Usuário</th><th className="px-6 py-4">IP</th><th className="px-6 py-4">Navegador</th><th className="px-6 py-4">Criada em</th><th className="px-6 py-4">Expira em</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Ações</th></tr>
              </thead>
              <tbody>{records.map((session) => <tr key={session.id} className="border-b border-slate-100"><td className="px-6 py-4">{session.user?.nome}</td><td className="px-6 py-4">{session.ip || "-"}</td><td className="px-6 py-4 max-w-[280px] truncate">{session.userAgent || "-"}</td><td className="px-6 py-4">{formatDate(session.createdAt)}</td><td className="px-6 py-4">{formatDate(session.expiresAt)}</td><td className="px-6 py-4"><StatusBadge status={session.revokedAt ? "INACTIVE" : "ACTIVE"} /></td><td className="px-6 py-4"><button type="button" onClick={() => void revoke(session.id)} className="rounded-lg border border-red-200 px-3 py-2 text-red-600">Revogar</button></td></tr>)}</tbody>
            </table>
          )}
          {mode === "audit" && (
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4">Data</th><th className="px-6 py-4">Afetado</th><th className="px-6 py-4">Responsável</th><th className="px-6 py-4">Ação</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">IP</th><th className="px-6 py-4">Navegador</th></tr>
              </thead>
              <tbody>{records.map((log) => <tr key={log.id} className="border-b border-slate-100"><td className="px-6 py-4">{formatDate(log.createdAt)}</td><td className="px-6 py-4">{log.user?.nome || "-"}</td><td className="px-6 py-4">{log.actorUser?.nome || "-"}</td><td className="px-6 py-4">{log.acao}</td><td className="px-6 py-4">{log.descricao || "-"}</td><td className="px-6 py-4">{log.ip || "-"}</td><td className="px-6 py-4 max-w-[260px] truncate">{log.userAgent || "-"}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
    </SecurityShell>
  );
}
