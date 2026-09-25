import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import LookupForm from "@/components/lookups/LookupForm";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import {
  memberLookupService,
} from "@/modules/member-lookups/member-lookup.service";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarHierarquiaPage({
  params,
}: Props) {
  const { id } = await params;
  const user = await requireCurrentUserFromCookies();
  const item = await memberLookupService.buscar(
    "hierarchies",
    id,
    user.templeId
  );

  if (!item) {
    return (
      <main className="space-y-6 p-4 sm:p-6 lg:p-7">
        <h1 className="text-3xl font-bold">
          Hierarquia não encontrada
        </h1>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div>
        <Link
          href="/dashboard/configuracoes/hierarquias"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold">
          Editar Hierarquia
        </h1>
      </div>

      <LookupForm
        id={item.id}
        nome={item.nome}
        ativo={item.ativo}
        title="Editar Hierarquia"
        api="/api/hierarchies"
        backUrl="/dashboard/configuracoes/hierarquias"
      />
    </main>
  );
}
