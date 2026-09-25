"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  title: string;
  api: string;
  backUrl: string;

  id?: string;
  nome?: string;
  ativo?: boolean;
  tipo?: string;
};

export default function LookupForm({
  title,
  api,
  backUrl,
  id,
  nome = "",
  ativo = true,
  tipo,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nome,
    ativo,
    ...(tipo ? { tipo } : {}),
  });

  async function salvar() {
    try {
      setLoading(true);

      const response = await fetch(
        id ? `${api}/${id}` : api,
        {
          method: id ? "PUT" : "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(form),
        }
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(
          error.message ??
          error.error ??
          "Erro ao salvar."
        );
      }

      router.push(backUrl);

      router.refresh();

    } catch (e) {

      alert(
        e instanceof Error
          ? e.message
          : "Erro ao salvar."
      );

    } finally {

      setLoading(false);

    }
  }

  return (

    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-8 text-2xl font-bold">
        {title}
      </h2>

      <div className="space-y-6">

        <div>

          <label className="mb-2 block font-medium">
            Nome
          </label>

          <input
            value={form.nome}
            onChange={(e) =>
              setForm({
                ...form,
                nome: e.target.value,
              })
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Situação
          </label>

          <select
            value={form.ativo ? "1" : "0"}
            onChange={(e) =>
              setForm({
                ...form,
                ativo: e.target.value === "1",
              })
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="1">
              Ativo
            </option>

            <option value="0">
              Inativo
            </option>

          </select>

        </div>

        <div className="flex gap-4">

          <button
            type="button"
            onClick={() => router.push(backUrl)}
            className="rounded-xl border border-slate-300 px-6 py-3"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={salvar}
            className="rounded-xl bg-[#C6921E] px-8 py-3 font-semibold text-white hover:bg-[#B8860B]"
          >
            {loading
              ? "Salvando..."
              : "Salvar"}
          </button>

        </div>

      </div>

    </div>

  );
}
