import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ProfessionForm from "@/components/professions/ProfessionForm";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { professionService } from "@/modules/professions/profession.service";


type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarProfissaoPage({
  params,
}: Props) {
  const { id } = await params;
  const user = await requireCurrentUserFromCookies();

  const profession = await professionService.buscar(id, user.templeId);

  if (!profession) {
    return (
      <main className="space-y-6 p-4 sm:p-6 lg:p-7">
        <h1 className="text-3xl font-bold">
          Profissão não encontrada
        </h1>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div>

        <Link
          href="/dashboard/configuracoes/profissoes"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold">
          Editar Profissão
        </h1>

      </div>

      <ProfessionForm
        id={profession.id}
        nome={profession.nome}
        ativo={profession.ativo}
      />

    </main>
  );
}
