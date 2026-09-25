"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ban, KeyRound, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";

import SecurityShell, { CardMetric, formatDate, StatusBadge } from "./SecurityShell";

type UserRecord = {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  foto?: string | null;
  status: string;
  ultimoLogin?: string | null;
  createdAt: string;
  userRoles: Array<{ role: { nome: string } }>;
};

type UsersResponse = {
  data: UserRecord[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
  };
  stats: {
    total: number;
    active: number;
    blocked: number;
    pending: number;
    inactive: number;
    online: number;
  };
};

export default function UsersPageClient() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  async function load() {
    const params = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
    });

    if (q) params.set("q", q);
    if (status) params.set("status", status);

    const response = await fetch(`/api/users?${params.toString()}`);
    const result = await response.json();
    setData(result);
  }

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });

      if (q) params.set("q", q);
      if (status) params.set("status", status);

      const response = await fetch(`/api/users?${params.toString()}`);
      const result = await response.json();

      if (active) {
        setData(result);
      }
    }

    void loadUsers();

    return () => {
      active = false;
    };
  }, [page, perPage, q, status]);

  async function blockUser(id: string) {
    const motivo = window.prompt("Motivo do bloqueio");
    if (!motivo) return;

    await fetch(`/api/users/${id}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    await load();
  }

  async function unblockUser(id: string) {
    await fetch(`/api/users/${id}/unblock`, { method: "POST" });
    await load();
  }

  async function resetPassword(id: string) {
    const senha = window.prompt("Nova senha temporária");
    if (!senha) return;
    const confirmarSenha = window.prompt("Confirmar senha");

    await fetch(`/api/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senha,
        confirmarSenha,
        deveTrocarSenha: true,
      }),
    });
    await load();
  }

  async function removeUser(id: string) {
    if (!window.confirm("Deseja inativar este usuário?")) return;

    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <SecurityShell
      title="Usuários e Permissões"
      description="Cadastro de usuários, perfis, sessões, permissões e auditoria."
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <CardMetric title="Total" value={data?.stats.total || 0} />
        <CardMetric title="Ativos" value={data?.stats.active || 0} />
        <CardMetric title="Bloqueados" value={data?.stats.blocked || 0} />
        <CardMetric title="Pendentes" value={data?.stats.pending || 0} />
        <CardMetric title="Online" value={data?.stats.online || 0} />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#EEE7D9] px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
              Usuários
            </p>
            <h2 className="mt-2 text-[22px] font-bold text-slate-900">
              Listagem
            </h2>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex items-center gap-2 rounded-2xl border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm text-slate-500">
              <Search size={18} />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void load();
                }}
                placeholder="Nome, email, telefone ou CPF"
                className="w-full bg-transparent outline-none"
              />
            </label>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-full border border-[#E9E1D2] px-4 py-2.5 text-sm outline-none"
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="BLOCKED">Bloqueados</option>
              <option value="INACTIVE">Inativos</option>
              <option value="PENDING">Pendentes</option>
            </select>

            <select
              value={perPage}
              onChange={(event) => setPerPage(Number(event.target.value))}
              className="rounded-full border border-[#E9E1D2] px-4 py-2.5 text-sm outline-none"
            >
              {[10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>{value}/página</option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2.5 text-sm font-medium text-[#1D1B18]"
            >
              Filtrar
            </button>

            <Link
              href="/dashboard/usuarios/novo"
              className="rounded-full bg-[#2F5BFF] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Novo
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[#7A746A]">
              <tr>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Usuário</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Email</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Telefone</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Perfil principal</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Status</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Último login</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Criado em</th>
                <th className="border-b border-[#EEE7D9] px-6 py-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data || []).map((user) => (
                <tr key={user.id} className="border-b border-[#F0E9DC] last:border-none">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF6E3] font-bold text-[#B8860B]">
                        {user.nome.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900">{user.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{user.email}</td>
                  <td className="px-6 py-4 text-slate-600">{user.telefone || "-"}</td>
                  <td className="px-6 py-4 text-slate-600">{user.userRoles[0]?.role.nome || "-"}</td>
                  <td className="px-6 py-4"><StatusBadge status={user.status} /></td>
                  <td className="px-6 py-4 text-slate-600">{formatDate(user.ultimoLogin)}</td>
                  <td className="px-6 py-4 text-slate-600">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Link href={`/dashboard/usuarios/${user.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E1D2] text-slate-600" title="Editar">
                        <Pencil size={16} />
                      </Link>
                      <button type="button" onClick={() => user.status === "BLOCKED" ? void unblockUser(user.id) : void blockUser(user.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E1D2] text-slate-600" title={user.status === "BLOCKED" ? "Desbloquear" : "Bloquear"}>
                        {user.status === "BLOCKED" ? <ShieldCheck size={16} /> : <Ban size={16} />}
                      </button>
                      <button type="button" onClick={() => void resetPassword(user.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E1D2] text-slate-600" title="Resetar senha">
                        <KeyRound size={16} />
                      </button>
                      <button type="button" onClick={() => void removeUser(user.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600" title="Inativar">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[#EEE7D9] px-6 py-4 text-sm text-[#9B9488]">
          <span>Total: {data?.pagination.total || 0}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-full border border-[#E9E1D2] px-4 py-2 disabled:opacity-50">Anterior</button>
            <button type="button" disabled={Boolean(data && page >= data.pagination.pages)} onClick={() => setPage((current) => current + 1)} className="rounded-full border border-[#E9E1D2] px-4 py-2 disabled:opacity-50">Próxima</button>
          </div>
        </div>
      </section>
    </SecurityShell>
  );
}
