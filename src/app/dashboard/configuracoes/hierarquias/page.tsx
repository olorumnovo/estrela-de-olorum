import LookupTable from "@/components/lookups/LookupTable";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import {
  memberLookupService,
} from "@/modules/member-lookups/member-lookup.service";

export default async function HierarquiasPage() {
  const user = await requireCurrentUserFromCookies();
  const items = await memberLookupService.listar(
    "hierarchies",
    user.templeId
  );

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Hierarquias
        </h1>

        <p className="mt-2 text-slate-500">
          Cadastros auxiliares do sistema.
        </p>
      </div>

      <LookupTable
        title="Hierarquias"
        description="Hierarquias utilizadas no cadastro de membros."
        baseUrl="/dashboard/configuracoes/hierarquias"
        api="/api/hierarchies"
        buttonLabel="Nova Hierarquia"
        items={items}
      />
    </main>
  );
}
