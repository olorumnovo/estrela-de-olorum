"use client";

import { UseFormReturn } from "react-hook-form";
import { MemberSchema } from "./member-schema";

type Props = {
  form: UseFormReturn<MemberSchema>;
};

export default function MemberNotesTab({ form }: Props) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-8 text-2xl font-bold text-slate-800">
        Observações
      </h2>

      <div>

        <label className="mb-2 block font-medium">
          Observações Gerais
        </label>

        <textarea
          {...form.register("observacoes")}
          rows={12}
          placeholder="Digite aqui observações sobre o membro..."
          className="w-full rounded-xl border border-slate-200 p-4 outline-none transition focus:border-[#C6921E]"
        />

      </div>

    </div>
  );
}