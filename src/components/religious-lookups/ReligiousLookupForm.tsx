"use client";

import LookupForm from "@/components/lookups/LookupForm";

type Props = {
  id?: string;
  nome?: string;
  ativo?: boolean;
  singularTitle: string;
  api: string;
  backUrl: string;
  tipo?: string;
};

export default function ReligiousLookupForm({
  id,
  nome,
  ativo,
  singularTitle,
  api,
  backUrl,
  tipo,
}: Props) {
  return (
    <LookupForm
      id={id}
      nome={nome}
      ativo={ativo}
      tipo={tipo}
      title={
        id
          ? `Editar ${singularTitle}`
          : `Novo ${singularTitle}`
      }
      api={api}
      backUrl={backUrl}
    />
  );
}
