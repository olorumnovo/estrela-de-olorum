"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SecurityShell from "./SecurityShell";

type Role = { id: string; nome: string };
type Permission = { id: string; codigo: string; nome?: string | null; modulo?: string | null };
type UserData = {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  cpf?: string | null;
  cargo?: string | null;
  foto?: string | null;
  status: string;
  observacoes?: string | null;
  deveTrocarSenha: boolean;
  userRoles: Array<{ roleId: string }>;
  userPermissions: Array<{ permissionId: string; allowed: boolean }>;
};

const emptyForm = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  cargo: "",
  foto: "",
  status: "ACTIVE",
  observacoes: "",
  senha: "",
  confirmarSenha: "",
  deveTrocarSenha: false,
  roleIds: [] as string[],
  permissionOverrides: [] as Array<{ permissionId: string; allowed: boolean }>,
};

export default function UserFormClient({ userId }: { userId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    async function load() {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/permissions"),
      ]);
      setRoles(await rolesResponse.json());
      setPermissions(await permissionsResponse.json());

      if (userId) {
        const response = await fetch(`/api/users/${userId}`);
        const user = (await response.json()) as UserData;
        setForm({
          ...emptyForm,
          nome: user.nome,
          email: user.email,
          telefone: user.telefone || "",
          cpf: user.cpf || "",
          cargo: user.cargo || "",
          foto: user.foto || "",
          status: user.status,
          observacoes: user.observacoes || "",
          deveTrocarSenha: user.deveTrocarSenha,
          roleIds: user.userRoles.map((item) => item.roleId),
          permissionOverrides: user.userPermissions.map((item) => ({
            permissionId: item.permissionId,
            allowed: item.allowed,
          })),
        });
      }
    }

    void load();
  }, [userId]);

  function toggleRole(roleId: string) {
    setForm((current) => ({
      ...current,
      roleIds: current.roleIds.includes(roleId)
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId],
    }));
  }

  function setPermission(permissionId: string, allowed: boolean | null) {
    setForm((current) => ({
      ...current,
      permissionOverrides:
        allowed === null
          ? current.permissionOverrides.filter((item) => item.permissionId !== permissionId)
          : [
              ...current.permissionOverrides.filter((item) => item.permissionId !== permissionId),
              { permissionId, allowed },
            ],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = userId
      ? {
          ...form,
          senha: undefined,
          confirmarSenha: undefined,
        }
      : form;

    const response = await fetch(userId ? `/api/users/${userId}` : "/api/users", {
      method: userId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || "Não foi possível salvar usuário.");
      return;
    }

    router.push("/dashboard/usuarios");
    router.refresh();
  }

  return (
    <SecurityShell
      title={userId ? "Editar Usuário" : "Novo Usuário"}
      description="Dados principais, acesso, perfis e permissões específicas."
    >
      <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Section title="Dados principais">
          <Input label="Nome completo" value={form.nome} onChange={(value) => setForm({ ...form, nome: value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
          <Input label="Telefone" value={form.telefone} onChange={(value) => setForm({ ...form, telefone: value })} />
          <Input label="CPF" value={form.cpf} onChange={(value) => setForm({ ...form, cpf: value })} />
          <Input label="Cargo" value={form.cargo} onChange={(value) => setForm({ ...form, cargo: value })} />
          <Input label="Foto/URL" value={form.foto} onChange={(value) => setForm({ ...form, foto: value })} />
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Status</span>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">
              <option value="ACTIVE">ATIVO</option>
              <option value="INACTIVE">INATIVO</option>
              <option value="BLOCKED">BLOQUEADO</option>
              <option value="PENDING">PENDENTE</option>
            </select>
          </label>
          <label className="space-y-2 xl:col-span-3">
            <span className="text-sm font-semibold text-slate-700">Observações</span>
            <textarea value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
          </label>
        </Section>

        {!userId && (
          <Section title="Acesso">
            <Input label="Senha" type="password" value={form.senha} onChange={(value) => setForm({ ...form, senha: value })} required />
            <Input label="Confirmar senha" type="password" value={form.confirmarSenha} onChange={(value) => setForm({ ...form, confirmarSenha: value })} required />
            <label className="flex items-center gap-2 pt-9 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.deveTrocarSenha} onChange={(event) => setForm({ ...form, deveTrocarSenha: event.target.checked })} />
              Deve trocar senha no primeiro acesso
            </label>
          </Section>
        )}

        {userId && (
          <label className="flex items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.deveTrocarSenha} onChange={(event) => setForm({ ...form, deveTrocarSenha: event.target.checked })} />
            Deve trocar senha no próximo acesso
          </label>
        )}

        <section className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Perfis</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
                {role.nome}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">Permissões específicas</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {permissions.map((permission) => {
              const override = form.permissionOverrides.find((item) => item.permissionId === permission.id);

              return (
                <div key={permission.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-800">{permission.codigo}</p>
                  <div className="mt-3 flex gap-3 text-sm">
                    <label><input type="radio" name={permission.id} checked={!override} onChange={() => setPermission(permission.id, null)} /> Herdar</label>
                    <label><input type="radio" name={permission.id} checked={override?.allowed === true} onChange={() => setPermission(permission.id, true)} /> Permitir</label>
                    <label><input type="radio" name={permission.id} checked={override?.allowed === false} onChange={() => setPermission(permission.id, false)} /> Negar</label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <button type="submit" className="rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white">
          Salvar usuário
        </button>
      </form>
    </SecurityShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">{title}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none"
      />
    </label>
  );
}
