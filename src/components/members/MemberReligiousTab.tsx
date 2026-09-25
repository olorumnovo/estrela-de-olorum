"use client";

import { UseFormReturn } from "react-hook-form";
import { MemberSchema } from "./member-schema";

type Props = {
  form: UseFormReturn<MemberSchema>;
  fatherFrontEntities: ReligiousOption[];
  fatherBackEntities: ReligiousOption[];
  motherFrontEntities: ReligiousOption[];
  motherBackEntities: ReligiousOption[];
};

type ReligiousOption = {
  id: string;
  nome: string;
};

export default function MemberReligiousTab({
  form,
  fatherFrontEntities,
  fatherBackEntities,
  motherFrontEntities,
  motherBackEntities,
}: Props) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-8 text-2xl font-bold text-slate-800">
        Informações Religiosas
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">

        <div>
          <label className="mb-2 block font-medium">
            Pai de Frente
          </label>

          <select
            {...form.register("entidadePai1")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            {fatherFrontEntities.map((entity) => (
              <option
                key={entity.id}
                value={entity.id}
              >
                {entity.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Pai de Costas
          </label>

          <select
            {...form.register("entidadePai2")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            {fatherBackEntities.map((entity) => (
              <option
                key={entity.id}
                value={entity.id}
              >
                {entity.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Mãe de Frente
          </label>

          <select
            {...form.register("entidadeMae1")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            {motherFrontEntities.map((entity) => (
              <option
                key={entity.id}
                value={entity.id}
              >
                {entity.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Mãe de Costas
          </label>

          <select
            {...form.register("entidadeMae2")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            {motherBackEntities.map((entity) => (
              <option
                key={entity.id}
                value={entity.id}
              >
                {entity.nome}
              </option>
            ))}
          </select>
        </div>

      </div>

    </div>
  );
}
