import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ProfessionForm from "@/components/professions/ProfessionForm";

export default function NovaProfissaoPage() {
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

        <h1 className="text-3xl font-bold text-slate-900">
          Nova Profissão
        </h1>

      </div>

      <ProfessionForm />

    </main>
  );
}