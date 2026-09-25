"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import MemberPhoto from "./MemberPhoto";
import MemberGeneralTab from "./MemberGeneralTab";
import MemberContactTab from "./MemberContactTab";
import MemberReligiousTab from "./MemberReligiousTab";
import MemberNotesTab from "./MemberNotesTab";

import { memberSchema, MemberSchema } from "./member-schema";
import { memberDefaults } from "./member-defaults";

type ReligiousOption = {
  id: string;
  nome: string;
};

type Props = {
  fatherFrontEntities: ReligiousOption[];
  fatherBackEntities: ReligiousOption[];
  motherFrontEntities: ReligiousOption[];
  motherBackEntities: ReligiousOption[];
  hierarchies: ReligiousOption[];
  classifications: ReligiousOption[];
  memberId?: string;
  initialData?: MemberSchema;
};

export default function MemberForm({
  fatherFrontEntities,
  fatherBackEntities,
  motherFrontEntities,
  motherBackEntities,
  hierarchies,
  classifications,
  memberId,
  initialData,
}: Props) {
  const router = useRouter();

  const [registrationType, setRegistrationType] = useState<"MEMBER" | "SUPPLIER">("MEMBER");
  const [saving, setSaving] = useState(false);

  const form = useForm<MemberSchema>({
    resolver: zodResolver(memberSchema),
    defaultValues: initialData ?? memberDefaults,
    mode: "onChange",
  });

  async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Arquivo inválido."));
      };

      reader.onerror = () =>
        reject(new Error("Erro ao ler foto."));

      reader.readAsDataURL(file);
    });
  }

  async function normalizeData(data: MemberSchema) {
    if (data.foto instanceof File) {
      return {
        ...data,
        foto: await fileToDataUrl(data.foto),
      };
    }

    return data;
  }

  async function onSubmit(data: MemberSchema) {
    try {
      setSaving(true);

      const payload = await normalizeData(data);

      const response = await fetch(
        memberId
          ? `/api/members/${memberId}`
          : "/api/members",
        {
          method: memberId ? "PUT" : "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.json();

        alert(
          error.message ??
            "Erro ao salvar membro."
        );

        return;
      }

      alert("Membro salvo com sucesso!");

      router.push("/dashboard/membros");
      router.refresh();

    } catch (error) {
      console.error(error);

      alert("Erro interno do servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

        <div>

          <Link
            href="/dashboard/membros"
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#C6921E]"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>

          <h1 className="text-3xl font-bold text-slate-900">
            {memberId
              ? registrationType === "SUPPLIER"
                ? "Editar Fornecedor"
                : "Editar Membro"
              : registrationType === "SUPPLIER"
                ? "Novo Fornecedor"
                : "Novo Membro"}
          </h1>

          <p className="mt-1 text-slate-500">
            Cadastro de membros do templo.
          </p>

        </div>

        <button
          type="button"
          disabled={saving}
          onClick={form.handleSubmit(onSubmit)}
          className="flex items-center gap-2 rounded-xl bg-[#C6921E] px-6 py-3 font-semibold text-white transition hover:bg-[#B8860B] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? (
            <>
              <Loader2
                size={20}
                className="animate-spin"
              />
              Salvando...
            </>
          ) : (
            <>
              <Save size={20} />
              Salvar
            </>
          )}
        </button>

      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">

        <MemberPhoto form={form} />

        <div className="space-y-6">

          <section className="rounded-2xl bg-white p-2 shadow">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#C6921E]">
                  Tipo de cadastro
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Identifique se este registro é membro ou fornecedor.
                </p>
              </div>

              <div className="grid rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRegistrationType("MEMBER")}
                  className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
                    registrationType === "MEMBER"
                      ? "bg-[#C6921E] text-white shadow"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Membro
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationType("SUPPLIER")}
                  className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
                    registrationType === "SUPPLIER"
                      ? "bg-[#C6921E] text-white shadow"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Fornecedor
                </button>
              </div>
            </div>
          </section>

          {registrationType === "SUPPLIER" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Este cadastro está marcado como fornecedor. Nesta versão, ele mantém os
              mesmos campos da ficha completa para você preencher tudo em uma única tela.
            </div>
          )}

          <div id="dados-gerais">
            <MemberGeneralTab
              form={form}
              hierarchies={hierarchies}
              classifications={classifications}
            />
          </div>

          <div id="contato">
            <MemberContactTab form={form} />
          </div>

          <div id="religioso">
            <MemberReligiousTab
              form={form}
              fatherFrontEntities={fatherFrontEntities}
              fatherBackEntities={fatherBackEntities}
              motherFrontEntities={motherFrontEntities}
              motherBackEntities={motherBackEntities}
            />
          </div>

          <div id="observacoes">
            <MemberNotesTab form={form} />
          </div>

        </div>

      </div>

    </main>
  );
}
