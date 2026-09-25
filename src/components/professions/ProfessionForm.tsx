"use client";

import LookupForm from "@/components/lookups/LookupForm";

type Props = {
  id?: string;
  nome?: string;
  ativo?: boolean;
};

export default function ProfessionForm(props: Props) {
  return (
    <LookupForm
      title={props.id ? "Editar Profissão" : "Nova Profissão"}
      api="/api/professions"
      backUrl="/dashboard/configuracoes/profissoes"
      {...props}
    />
  );
}