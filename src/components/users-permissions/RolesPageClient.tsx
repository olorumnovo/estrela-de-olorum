"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";

import SecurityShell, { StatusBadge } from "./SecurityShell";

type Permission = { id: string; codigo: string; modulo?: string | null };
type Role = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  users: unknown[];
  permissions: Array<{ permissionId: string; permission: Permission }>;
};

export default function RolesPageClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", ativo: true, permissionIds: [] as string[] });

  async function load() {
    const [rolesResponse, permissionsResponse] = await Promise.all([
      fetch("/api/roles"),
      fetch("/api/permissions"),
    ]);
    setRoles(await rolesResponse.json());
    setPermissions(await permissionsResponse.json());
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/permissions"),
      ]);
      const [rolesData, permissionsData] = await Promise.all([
        rolesResponse.json(),
        permissionsResponse.json(),
      ]);

      if (active) {
        setRoles(Array.isArray(rolesData) ? rolesData : []);
        setPermissions(Array.isArray(permissionsData) ? permissionsData : []);
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  function edit(role: Role) {
    setEditingId(role.id);
    setForm({
      nome: role.nome,
      descricao: role.descricao || "",
      ativo: role.ativo,
      permissionIds: role.permissions.map((item) => item.permissionId),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(editingId ? `/api/roles/${editingId}` : "/api/roles", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || "Não foi possível salvar perfil.");
      return;
    }

    setEditingId(null);
    setForm({ nome: "", descricao: "", ativo: true, permissionIds: [] });
    await load();
  }

  async function duplicate(role: Role) {
    await fetch(`/api/roles/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate" }),
    });
    await load();
  }

  async function remove(role: Role) {
    if (!window.confirm("Deseja excluir/inativar este perfil?")) return;
    await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    await load();
  }

  function togglePermission(permissionId: string) {
    setForm((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  }

  return (
    <SecurityShell title="Perfis de Acesso" description="CRUD completo de perfis e permissões vinculadas.">
      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Nome" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" required />
          <input value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Descrição" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />
            Ativo
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {permissions.map((permission) => (
            <label key={permission.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
              <input type="checkbox" checked={form.permissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} />
              {permission.codigo}
            </label>
          ))}
        </div>
        <button className="rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white">
          {editingId ? "Atualizar perfil" : "Criar perfil"}
        </button>
      </form>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-6 py-4">Nome</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Usuários</th><th className="px-6 py-4">Permissões</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Ações</th></tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b border-slate-100">
                <td className="px-6 py-4 font-semibold text-slate-900"><button type="button" onClick={() => edit(role)}>{role.nome}</button></td>
                <td className="px-6 py-4 text-slate-600">{role.descricao || "-"}</td>
                <td className="px-6 py-4">{role.users.length}</td>
                <td className="px-6 py-4">{role.permissions.length}</td>
                <td className="px-6 py-4"><StatusBadge status={role.ativo ? "ACTIVE" : "INACTIVE"} /></td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void duplicate(role)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><Copy size={16} /></button>
                    <button type="button" onClick={() => void remove(role)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </SecurityShell>
  );
}
