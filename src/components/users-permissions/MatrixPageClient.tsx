"use client";

import { useEffect, useMemo, useState } from "react";

import SecurityShell from "./SecurityShell";

type Permission = { id: string; codigo: string; modulo?: string | null; acao?: string | null };
type Role = { id: string; nome: string; permissions: Array<{ permissionId: string }> };

const actions = ["visualizar", "criar", "editar", "excluir", "exportar", "administrar"];

export default function MatrixPageClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleId, setRoleId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  async function load() {
    const [rolesResponse, permissionsResponse] = await Promise.all([
      fetch("/api/roles"),
      fetch("/api/permissions"),
    ]);
    const rolesData = await rolesResponse.json();
    const permissionsData = await permissionsResponse.json();
    setRoles(rolesData);
    setPermissions(permissionsData);

    const firstRole = rolesData[0];
    if (firstRole && !roleId) {
      setRoleId(firstRole.id);
      setSelected(firstRole.permissions.map((item: { permissionId: string }) => item.permissionId));
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/permissions"),
      ]);
      const rolesData = await rolesResponse.json();
      const permissionsData = await permissionsResponse.json();

      if (!active) {
        return;
      }

      setRoles(rolesData);
      setPermissions(permissionsData);

      const firstRole = rolesData[0];
      if (firstRole) {
        setRoleId(firstRole.id);
        setSelected(firstRole.permissions.map((item: { permissionId: string }) => item.permissionId));
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  function changeRole(id: string) {
    setRoleId(id);
    const role = roles.find((item) => item.id === id);
    setSelected(role?.permissions.map((item) => item.permissionId) || []);
  }

  const modules = useMemo(
    () => Array.from(new Set(permissions.map((permission) => permission.modulo || "geral"))),
    [permissions]
  );

  function permissionFor(modulo: string, acao: string) {
    return permissions.find((permission) => permission.modulo === modulo && permission.acao === acao);
  }

  async function save() {
    await fetch(`/api/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissionIds: selected }),
    });
    await load();
  }

  return (
    <SecurityShell title="Matriz de Permissões" description="Permissões por módulo e ação para cada perfil.">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <select value={roleId} onChange={(event) => changeRole(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">
            {roles.map((role) => <option key={role.id} value={role.id}>{role.nome}</option>)}
          </select>
          <button type="button" onClick={() => void save()} className="rounded-xl bg-linear-to-r from-[#D9A520] to-[#B8860B] px-5 py-3 text-sm font-semibold text-white">Salvar matriz</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-6 py-4">Módulo</th>{actions.map((action) => <th key={action} className="px-6 py-4">{action}</th>)}</tr>
            </thead>
            <tbody>
              {modules.map((modulo) => (
                <tr key={modulo} className="border-b border-slate-100">
                  <td className="px-6 py-4 font-semibold text-slate-900">{modulo}</td>
                  {actions.map((action) => {
                    const permission = permissionFor(modulo, action);
                    return (
                      <td key={action} className="px-6 py-4">
                        {permission ? (
                          <input
                            type="checkbox"
                            checked={selected.includes(permission.id)}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(permission.id)
                                  ? current.filter((id) => id !== permission.id)
                                  : [...current, permission.id]
                              )
                            }
                          />
                        ) : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </SecurityShell>
  );
}
