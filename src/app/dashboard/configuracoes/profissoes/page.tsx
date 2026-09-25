import LookupTable from "@/components/lookups/LookupTable";
import SettingsBackButton from "@/components/settings/SettingsBackButton";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { professionService } from "@/modules/professions/profession.service";


export default async function ProfissoesPage() {
  const user = await requireCurrentUserFromCookies();
  const professions = await professionService.listar(user.templeId);

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div className="space-y-4">

        <SettingsBackButton />

        <h1 className="text-3xl font-bold text-slate-900">
          Profissões
        </h1>

        <p className="mt-2 text-slate-500">
          Cadastros auxiliares do sistema.
        </p>

      </div>

      <LookupTable
        title="Profissões"
        description="Profissões utilizadas pelos membros."
        baseUrl="/dashboard/configuracoes/profissoes"
        api="/api/professions"
        buttonLabel="Nova Profissão"
        items={professions}
      />

    </main>
  );
}
