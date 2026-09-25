"use client";

import { UseFormReturn } from "react-hook-form";
import { MemberSchema } from "./member-schema";

import { maskCep, maskPhone } from "@/lib/masks";
import { buscarCep } from "@/lib/viaCep";

type Props = {
  form: UseFormReturn<MemberSchema>;
};

export default function MemberContactTab({ form }: Props) {
  async function handleCep(value: string) {
    const cep = maskCep(value);

    form.setValue("cep", cep, {
      shouldDirty: true,
      shouldValidate: true,
    });

    const endereco = await buscarCep(cep);

    if (!endereco) return;

    form.setValue("endereco", endereco.logradouro);
    form.setValue("bairro", endereco.bairro);
    form.setValue("cidade", endereco.localidade);
    form.setValue("estado", endereco.uf);
    form.setValue("complemento", endereco.complemento ?? "");
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-8 text-2xl font-bold text-slate-800">
        Contato e Endereço
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">

        <div>

          <label className="mb-2 block font-medium">
            Celular
          </label>

          <input
            {...form.register("celular")}
            placeholder="(11) 99999-9999"
            onChange={(e) =>
              form.setValue(
                "celular",
                maskPhone(e.target.value),
                {
                  shouldDirty: true,
                  shouldValidate: true,
                }
              )
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            E-mail
          </label>

          <input
            type="email"
            {...form.register("email")}
            placeholder="email@exemplo.com"
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            CEP
          </label>

          <input
            {...form.register("cep")}
            placeholder="00000-000"
            onBlur={(e) => handleCep(e.target.value)}
            onChange={(e) =>
              form.setValue(
                "cep",
                maskCep(e.target.value),
                {
                  shouldDirty: true,
                  shouldValidate: true,
                }
              )
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Número
          </label>

          <input
            {...form.register("numero")}
            placeholder="123"
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div className="lg:col-span-2">

          <label className="mb-2 block font-medium">
            Endereço
          </label>

          <input
            {...form.register("endereco")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Complemento
          </label>

          <input
            {...form.register("complemento")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Bairro
          </label>

          <input
            {...form.register("bairro")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Cidade
          </label>

          <input
            {...form.register("cidade")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />

        </div>

        <div>

          <label className="mb-2 block font-medium">
            Estado (UF)
          </label>

          <input
            {...form.register("estado")}
            maxLength={2}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 uppercase outline-none focus:border-[#C6921E]"
          />

        </div>

      </div>

    </div>
  );
}