import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import LookupTable from "@/components/lookups/LookupTable";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import {
  getReligiousLookupConfig,
  religiousLookupService,
} from "@/modules/religious-lookups";

type Props = {
  params: Promise<{
    lookup: string;
  }>;
};

export default async function CadastroReligiosoPage({
  params,
}: Props) {
  const { lookup } = await params;
  const config =
    getReligiousLookupConfig(lookup);

  if (!config) {
    notFound();
  }

  const user = await requireCurrentUserFromCookies();
  const templeId = user.templeId;

  const items =
    await religiousLookupService.listar(
      config.type,
      templeId,
      config.entityType
    );

  const baseUrl =
    `/dashboard/configuracoes/cadastros-religiosos/${config.slug}`;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div>

        <Link
          href="/dashboard/configuracoes/cadastros-religiosos"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-slate-900">
          {config.title}
        </h1>

        <p className="mt-2 text-slate-500">
          Gerencie as opções deste select.
        </p>

      </div>

      <LookupTable
        title={config.title}
        description={config.description}
        baseUrl={baseUrl}
        api={config.api}
        buttonLabel={config.buttonLabel}
        items={items}
      />

    </main>
  );
}
