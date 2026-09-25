import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import ReligiousLookupForm from "@/components/religious-lookups/ReligiousLookupForm";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import {
  getReligiousLookupConfig,
  religiousLookupService,
} from "@/modules/religious-lookups";

type Props = {
  params: Promise<{
    lookup: string;
    id: string;
  }>;
};

export default async function EditarCadastroReligiosoPage({
  params,
}: Props) {
  const { lookup, id } = await params;
  const config =
    getReligiousLookupConfig(lookup);

  if (!config) {
    notFound();
  }

  const user = await requireCurrentUserFromCookies();
  const item =
    await religiousLookupService.buscar(
      config.type,
      id,
      user.templeId,
      config.entityType
    );

  if (!item) {
    return (
      <main className="space-y-6 p-4 sm:p-6 lg:p-7">
        <h1 className="text-3xl font-bold">
          Registro não encontrado
        </h1>
      </main>
    );
  }

  const backUrl =
    `/dashboard/configuracoes/cadastros-religiosos/${config.slug}`;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div>

        <Link
          href={backUrl}
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold">
          Editar {config.singularTitle}
        </h1>

      </div>

      <ReligiousLookupForm
        id={item.id}
        nome={item.nome}
        ativo={item.ativo}
        singularTitle={config.singularTitle}
        api={config.api}
        backUrl={backUrl}
        tipo={config.entityType}
      />

    </main>
  );
}
