"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

export type LookupItem = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Props = {
  title: string;
  description: string;
  baseUrl: string;
  buttonLabel: string;
  api: string;
  items: LookupItem[];
};

export default function LookupTable({
  title,
  description,
  baseUrl,
  buttonLabel,
  api,
  items,
}: Props) {
  const router = useRouter();

  async function excluir(id: string) {
    const ok = confirm("Deseja realmente excluir este registro?");

    if (!ok) return;

    const response = await fetch(`${api}/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      alert("Erro ao excluir.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow">

      <div className="flex items-center justify-between border-b p-6">

        <div>
          <h2 className="text-xl font-bold">
            {title}
          </h2>

          <p className="text-sm text-slate-500">
            {description}
          </p>
        </div>

        <Link
          href={`${baseUrl}/novo`}
          className="flex items-center gap-2 rounded-xl bg-[#C6921E] px-5 py-3 font-semibold text-white hover:bg-[#B8860B]"
        >
          <Plus size={18} />
          {buttonLabel}
        </Link>

      </div>

      <div className="overflow-x-auto">

      <table className="w-full min-w-[620px]">

        <thead>

          <tr className="border-b bg-slate-50">

            <th className="px-6 py-4 text-left">
              Nome
            </th>

            <th className="text-left">
              Situação
            </th>

            <th className="pr-6 text-right">
              Ações
            </th>

          </tr>

        </thead>

        <tbody>

          {items.length === 0 && (
            <tr>
              <td
                colSpan={3}
                className="py-16 text-center text-slate-400"
              >
                Nenhum registro encontrado.
              </td>
            </tr>
          )}

          {items.map((item) => (

            <tr
              key={item.id}
              className="border-b hover:bg-slate-50"
            >

              <td className="px-6 py-4 font-medium">
                {item.nome}
              </td>

              <td>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.ativo
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.ativo ? "Ativo" : "Inativo"}
                </span>
              </td>

              <td>

                <div className="flex justify-end gap-2 pr-6">

                  <Link
                    href={`${baseUrl}/${item.id}`}
                    className="rounded-lg p-2 hover:bg-slate-100"
                    title="Editar"
                  >
                    <Pencil size={18} />
                  </Link>

                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => excluir(item.id)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={18} />
                  </button>

                </div>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

      </div>

    </div>
  );
}
