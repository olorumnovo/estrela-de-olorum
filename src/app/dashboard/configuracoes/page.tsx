import Link from "next/link";
import {
  CreditCard,
  Layers3,
  LockKeyhole,
  ReceiptText,
  Sparkles,
  Tags,
} from "lucide-react";
import SettingsBackButton from "@/components/settings/SettingsBackButton";

const sections = [
  {
    title: "Hierarquias",
    description:
      "Hierarquias utilizadas no cadastro de membros.",
    href: "/dashboard/configuracoes/hierarquias",
    icon: Layers3,
  },
  {
    title: "Classificações",
    description:
      "Classificações utilizadas no cadastro de membros.",
    href: "/dashboard/configuracoes/classificacoes",
    icon: Tags,
  },
  {
    title: "Categorias Financeiras",
    description:
      "Categorias usadas em receitas e despesas.",
    href: "/dashboard/configuracoes/categorias-financeiras",
    icon: Tags,
  },
  {
    title: "Cadastros Religiosos",
    description:
      "Entidades, tipos de contato e funções religiosas.",
    href: "/dashboard/configuracoes/cadastros-religiosos",
    icon: Sparkles,
  },
  {
    title: "Configuração PIX",
    description:
      "Chave PIX, nome e banco usados nas cobranças.",
    href: "/dashboard/configuracoes/pix",
    icon: CreditCard,
  },
  {
    title: "Contribuições",
    description:
      "Valores, vencimento, descontos e combos das mensalidades.",
    href: "/dashboard/configuracoes/contribuicoes",
    icon: ReceiptText,
  },
  {
    title: "Trocar Senha",
    description:
      "Atualize a senha do usuário logado.",
    href: "/dashboard/configuracoes/senha",
    icon: LockKeyhole,
  },
];

export default function ConfiguracoesPage() {
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div className="space-y-4">
        <SettingsBackButton href="/dashboard" />

        <h1 className="text-3xl font-bold text-slate-900">
          Configurações
        </h1>

        <p className="mt-2 text-slate-500">
          Cadastros auxiliares do sistema.
        </p>

      </div>

      <div className="grid gap-5 md:grid-cols-2">

        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-2xl bg-white p-6 shadow transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#C6921E] text-white">
                  <Icon size={22} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {section.title}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {section.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

      </div>

    </main>
  );
}
