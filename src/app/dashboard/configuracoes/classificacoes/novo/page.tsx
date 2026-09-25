import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import LookupForm from "@/components/lookups/LookupForm";

export default function NovaClassificacaoPage() {
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div>
        <Link
          href="/dashboard/configuracoes/classificacoes"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-slate-900">
          Nova Classificação
        </h1>
      </div>

      <LookupForm
        title="Nova Classificação"
        api="/api/member-classifications"
        backUrl="/dashboard/configuracoes/classificacoes"
      />
    </main>
  );
}
