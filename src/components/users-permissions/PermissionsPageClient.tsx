"use client";

import { useEffect, useMemo, useState } from "react";

import SecurityShell from "./SecurityShell";

type Permission = { id: string; codigo: string; nome?: string | null; descricao?: string | null; modulo?: string | null; acao?: string | null };

export default function PermissionsPageClient() {
  const [permissions, setPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    fetch("/api/permissions", { method: "POST" })
      .then((response) => response.json())
      .then(setPermissions);
  }, []);

  const grouped = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
      const modulo = permission.modulo || "geral";
      acc[modulo] = [...(acc[modulo] || []), permission];
      return acc;
    }, {});
  }, [permissions]);

  return (
    <SecurityShell title="Permissões" description="Permissões semeadas automaticamente e agrupadas por módulo.">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Object.entries(grouped).map(([modulo, items]) => (
          <section key={modulo} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">{modulo}</p>
            <div className="mt-4 space-y-3">
              {items.map((permission) => (
                <div key={permission.id} className="rounded-2xl border border-slate-100 p-4">
                  <p className="font-semibold text-slate-900">{permission.codigo}</p>
                  <p className="mt-1 text-sm text-slate-500">{permission.descricao}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SecurityShell>
  );
}
