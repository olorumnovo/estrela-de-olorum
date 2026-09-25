"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  UseFormReturn,
  useWatch,
} from "react-hook-form";
import type { ClipboardEvent } from "react";
import { MemberSchema } from "./member-schema";
import { maskCpfCnpj, maskRg } from "@/lib/masks";

type SelectOption = {
  id: string;
  nome: string;
};

type Props = {
  form: UseFormReturn<MemberSchema>;
  hierarchies: SelectOption[];
  classifications: SelectOption[];
};

export default function MemberGeneralTab({
  form,
  hierarchies,
  classifications,
}: Props) {
  const hierarchyIds =
    useWatch({
      control: form.control,
      name: "hierarchyIds",
    }) ?? [""];

  const classificationIds =
    useWatch({
      control: form.control,
      name: "classificationIds",
    }) ?? [""];
  const selectedClassificationIds = classificationIds.filter(Boolean);

  function updateHierarchy(
    index: number,
    value: string
  ) {
    const next = [...hierarchyIds];
    next[index] = value;
    form.setValue("hierarchyIds", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function addHierarchy() {
    form.setValue(
      "hierarchyIds",
      [...hierarchyIds, ""],
      {
        shouldDirty: true,
        shouldValidate: true,
      }
    );
  }

  function removeHierarchy(index: number) {
    if (hierarchyIds.length === 1) return;

    form.setValue(
      "hierarchyIds",
      hierarchyIds.filter(
        (_, currentIndex) =>
          currentIndex !== index
      ),
      {
        shouldDirty: true,
        shouldValidate: true,
      }
    );
  }

  function updateClassification(
    index: number,
    value: string
  ) {
    const next = [...classificationIds].filter(
      (classificationId, currentIndex) =>
        currentIndex === index ||
        !value ||
        classificationId !== value
    );
    next[index] = value;
    form.setValue("classificationIds", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function addClassification() {
    if (classificationIds.some((classificationId) => !classificationId)) {
      return;
    }

    form.setValue(
      "classificationIds",
      [...classificationIds, ""],
      {
        shouldDirty: true,
        shouldValidate: true,
      }
    );
  }

  function removeClassification(index: number) {
    if (classificationIds.length === 1) return;

    form.setValue(
      "classificationIds",
      classificationIds.filter(
        (_, currentIndex) =>
          currentIndex !== index
      ),
      {
        shouldDirty: true,
        shouldValidate: true,
      }
    );
  }

  function normalizePastedDate(value: string) {
    const trimmed = value.trim();

    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const brMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (brMatch) {
      const [, day, month, yearValue] = brMatch;
      const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
      return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const numbers = trimmed.replace(/\D/g, "");
    if (numbers.length === 8) {
      const day = numbers.slice(0, 2);
      const month = numbers.slice(2, 4);
      const year = numbers.slice(4, 8);
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  function handleDatePaste(
    event: ClipboardEvent<HTMLInputElement>,
    field: "dataNascimento" | "dataEntrada" | "dataSaida"
  ) {
    const nextDate = normalizePastedDate(event.clipboardData.getData("text"));

    if (!nextDate) {
      return;
    }

    event.preventDefault();
    form.setValue(field, nextDate, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-8 text-2xl font-bold text-slate-800">
        Dados Gerais
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">

        <div>
          <label className="mb-2 block font-medium">
            Nome Completo *
          </label>

          <input
            {...form.register("nome")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />
        </div>

        <div>
          <label className="mb-2 block font-medium">
            RG
          </label>

          <input
            {...form.register("rg")}
            placeholder="12.345.678-9"
            onChange={(e) =>
              form.setValue(
                "rg",
                maskRg(e.target.value),
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
            CPF
          </label>

          <input
            {...form.register("cpfCnpj")}
            placeholder="000.000.000-00"
            onChange={(e) =>
              form.setValue(
                "cpfCnpj",
                maskCpfCnpj(e.target.value),
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
            Data de Nascimento
          </label>

          <input
            type="date"
            {...form.register("dataNascimento")}
            onPaste={(event) => handleDatePaste(event, "dataNascimento")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Estado Civil
          </label>

          <select
            {...form.register("estadoCivil")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            <option value="SOLTEIRO">Solteiro(a)</option>
            <option value="CASADO">Casado(a)</option>
            <option value="VIUVO">Viúvo(a)</option>
            <option value="UNIAO_ESTAVEL">União Estável</option>
            <option value="NAO_INFORMADO">Não Informado</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Sexo
          </label>

          <select
            {...form.register("sexo")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="">Selecione...</option>
            <option value="MASCULINO">Masculino</option>
            <option value="FEMININO">Feminino</option>
            <option value="NAO_INFORMADO">Não Informado</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="mb-2 block font-medium">
                Hierarquia
              </label>

              <p className="text-sm text-slate-500">
                Você pode adicionar quantas hierarquias quiser.
              </p>
            </div>

            <button
              type="button"
              onClick={addHierarchy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Plus size={16} />
              Adicionar outra hierarquia
            </button>
          </div>

          <div className="space-y-3">
            {hierarchyIds.map((value, index) => (
              <div
                key={`hierarchy-${index}`}
                className="flex items-center gap-3"
              >
                <select
                  value={value}
                  onChange={(event) =>
                    updateHierarchy(
                      index,
                      event.target.value
                    )
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                >
                  <option value="">
                    Selecione...
                  </option>

                  {hierarchies.map((hierarchy) => (
                    <option
                      key={hierarchy.id}
                      value={hierarchy.id}
                    >
                      {hierarchy.nome}
                    </option>
                  ))}
                </select>

                {hierarchyIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      removeHierarchy(index)
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                    aria-label="Remover hierarquia"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label className="mb-2 block font-medium">
                Classificação
              </label>

              <p className="text-sm text-slate-500">
                Você pode adicionar quantas classificações quiser.
              </p>
            </div>

            <button
              type="button"
              onClick={addClassification}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Plus size={16} />
              Adicionar outra classificação
            </button>
          </div>

          <div className="space-y-3">
            {classificationIds.map((value, index) => (
              <div
                key={`classification-${index}`}
                className="flex items-center gap-3"
              >
                <select
                  value={value}
                  onChange={(event) =>
                    updateClassification(
                      index,
                      event.target.value
                    )
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
                >
                  <option value="">
                    Selecione...
                  </option>

                  {classifications
                    .filter(
                      (classification) =>
                        classification.id === value ||
                        !selectedClassificationIds.includes(classification.id)
                    )
                    .map((classification) => (
                      <option
                        key={classification.id}
                        value={classification.id}
                      >
                        {classification.nome}
                      </option>
                    ))}
                </select>

                {classificationIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      removeClassification(index)
                    }
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                    aria-label="Remover classificação"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Data de Admissão no Centro
          </label>

          <input
            type="date"
            {...form.register("dataEntrada")}
            onPaste={(event) => handleDatePaste(event, "dataEntrada")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Data de Saída do Centro
          </label>

          <input
            type="date"
            {...form.register("dataSaida")}
            onPaste={(event) => handleDatePaste(event, "dataSaida")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          />
        </div>

        <div>
          <label className="mb-2 block font-medium">
            Status
          </label>

          <select
            {...form.register("status")}
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
          >
            <option value="PENDING">Pendente</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
            <option value="SUSPENDED">Suspenso</option>
          </select>
        </div>

      </div>

    </div>
  );
}
