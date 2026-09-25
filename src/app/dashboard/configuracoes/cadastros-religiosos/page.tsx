import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { religiousLookupConfigs } from "@/modules/religious-lookups";

export default function CadastrosReligiososPage() {
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div>

        <Link
          href="/dashboard/configuracoes"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>

        <h1 className="text-3xl font-bold text-slate-900">
          Cadastros Religiosos
        </h1>

        <p className="mt-2 text-slate-500">
          Configure apenas os 4 selects da aba Religioso.
        </p>

      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">

        {religiousLookupConfigs.map((config) => (
          <Link
            key={config.slug}
            href={`/dashboard/configuracoes/cadastros-religiosos/${config.slug}`}
            className="flex items-center justify-between border-b p-6 transition hover:bg-slate-50"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {config.title}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {config.description}
              </p>
            </div>

            <ChevronRight
              size={20}
              className="text-slate-400"
            />
          </Link>
        ))}

      </div>

    </main>
  );
}
