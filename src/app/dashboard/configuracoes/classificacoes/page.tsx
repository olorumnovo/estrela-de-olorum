import LookupTable from "@/components/lookups/LookupTable";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import {
  memberLookupService,
} from "@/modules/member-lookups/member-lookup.service";

export default async function ClassificacoesPage() {
  const user = await requireCurrentUserFromCookies();
  const items = await memberLookupService.listar(
    "classifications",
    user.templeId
  );

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Classificações
        </h1>

        <p className="mt-2 text-slate-500">
          Cadastros auxiliares do sistema.
        </p>
      </div>

      <LookupTable
        title="Classificações"
        description="Classificações utilizadas no cadastro de membros."
        baseUrl="/dashboard/configuracoes/classificacoes"
        api="/api/member-classifications"
        buttonLabel="Nova Classificação"
        items={items}
      />
    </main>
  );
}
