import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import ReligiousLookupForm from "@/components/religious-lookups/ReligiousLookupForm";
import { getReligiousLookupConfig } from "@/modules/religious-lookups";

type Props = {
  params: Promise<{
    lookup: string;
  }>;
};

export default async function NovoCadastroReligiosoPage({
  params,
}: Props) {
  const { lookup } = await params;
  const config =
    getReligiousLookupConfig(lookup);

  if (!config) {
    notFound();
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

        <h1 className="text-3xl font-bold text-slate-900">
          Novo {config.singularTitle}
        </h1>

      </div>

      <ReligiousLookupForm
        singularTitle={config.singularTitle}
        api={config.api}
        backUrl={backUrl}
        tipo={config.entityType}
      />

    </main>
  );
}
