"use client";

import { ClipboardEvent, FormEvent, useState } from "react";

import {
  maskCep,
  maskCpfCnpj,
  maskPhone,
  maskRg,
} from "@/lib/masks";
import { buscarCep } from "@/lib/viaCep";

type FormState = {
  nome: string;
  rg: string;
  cpfCnpj: string;
  dataNascimento: string;
  email: string;
  celular: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  desejo: string;
  experienciaTerreiro: string;
};

const initialForm: FormState = {
  nome: "",
  rg: "",
  cpfCnpj: "",
  dataNascimento: "",
  email: "",
  celular: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  desejo: "",
  experienciaTerreiro: "",
};

export default function PublicMemberRegistrationForm() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  function setField(
    field: keyof FormState,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCep(value: string) {
    const cep = maskCep(value);
    setField("cep", cep);

    const endereco = await buscarCep(cep);

    if (!endereco) {
      return;
    }

    setForm((current) => ({
      ...current,
      endereco: endereco.logradouro,
      bairro: endereco.bairro,
      cidade: endereco.localidade,
      estado: endereco.uf,
      complemento: endereco.complemento ?? "",
    }));
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
      return `${numbers.slice(4, 8)}-${numbers.slice(2, 4)}-${numbers.slice(0, 2)}`;
    }

    return null;
  }

  function handleDatePaste(event: ClipboardEvent<HTMLInputElement>) {
    const nextDate = normalizePastedDate(event.clipboardData.getData("text"));

    if (!nextDate) {
      return;
    }

    event.preventDefault();
    setField("dataNascimento", nextDate);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "/api/public/member-registration",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message || "Não foi possível enviar o cadastro."
        );
        return;
      }

      setForm(initialForm);
      setSuccessModalOpen(true);
    } catch {
      setError("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {successModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
              ✓
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-950">
              Cadastro realizado com sucesso!
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Recebemos suas informações. Agora seu cadastro ficará como
              pendente para análise do Templo Estrela de Olorum.
            </p>
            <button
              type="button"
              onClick={() => setSuccessModalOpen(false)}
              className="mt-7 h-12 rounded-full bg-[#0D3B82] px-8 font-semibold text-white shadow-sm transition hover:bg-[#0B316C]"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={submit}
        className="rounded-3xl bg-white p-6 shadow-xl md:p-8"
      >
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block font-medium">
            Nome Completo *
          </label>
          <input
            value={form.nome}
            onChange={(event) =>
              setField("nome", event.target.value)
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          />
        </div>

        <Input
          label="Data de Nascimento *"
          type="date"
          value={form.dataNascimento}
          onChange={(value) =>
            setField("dataNascimento", value)
          }
          onPaste={handleDatePaste}
          required
        />

        <Input
          label="CPF *"
          value={form.cpfCnpj}
          onChange={(value) =>
            setField("cpfCnpj", maskCpfCnpj(value))
          }
          required
        />

        <Input
          label="RG *"
          value={form.rg}
          onChange={(value) => setField("rg", maskRg(value))}
          required
        />

        <Input
          label="E-mail *"
          type="email"
          value={form.email}
          onChange={(value) => setField("email", value)}
          required
        />

        <Input
          label="Celular *"
          type="tel"
          value={form.celular}
          onChange={(value) => setField("celular", maskPhone(value))}
          required
        />

        <div className="md:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-slate-900">
            Endereço completo *
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <Input
              label="CEP *"
              value={form.cep}
              onChange={(value) =>
                setField("cep", maskCep(value))
              }
              onBlur={() => handleCep(form.cep)}
              required
            />

            <Input
              label="Número *"
              value={form.numero}
              onChange={(value) => setField("numero", value)}
              required
            />

            <div className="md:col-span-2">
              <Input
                label="Endereço *"
                value={form.endereco}
                onChange={(value) =>
                  setField("endereco", value)
                }
                required
              />
            </div>

            <Input
              label="Complemento"
              value={form.complemento}
              onChange={(value) =>
                setField("complemento", value)
              }
            />

            <Input
              label="Bairro *"
              value={form.bairro}
              onChange={(value) => setField("bairro", value)}
              required
            />

            <Input
              label="Cidade *"
              value={form.cidade}
              onChange={(value) => setField("cidade", value)}
              required
            />

            <Input
              label="Estado (UF) *"
              value={form.estado}
              onChange={(value) =>
                setField("estado", value.toUpperCase())
              }
              maxLength={2}
              required
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block font-medium">
            O que você deseja? *
          </label>
          <select
            value={form.desejo}
            onChange={(event) =>
              setField("desejo", event.target.value)
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          >
            <option value="">Selecione...</option>
            <option value="Curso de Teologia">Curso de Teologia</option>
            <option value="Curso de Atabaque">Curso de Atabaque</option>
            <option value="Curso de Desenvolvimento Mediúnico">Curso de Desenvolvimento Mediúnico</option>
            <option value="Desejo trabalhar na corrente como filho da casa">
              Desejo trabalhar na corrente como filho da casa
            </option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block font-medium">
            Já trabalhou ou trabalha em outro Terreiro? *
          </label>
          <select
            value={form.experienciaTerreiro}
            onChange={(event) =>
              setField("experienciaTerreiro", event.target.value)
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          >
            <option value="">Selecione...</option>
            <option value="Sim, já trabalhei">Sim, já trabalhei</option>
            <option value="Não, não trabalhei em outro terreiro">
              Não, não trabalhei em outro terreiro
            </option>
            <option value="Sim, trabalho em outro terreiro">
              Sim, trabalho em outro terreiro
            </option>
          </select>
        </div>
      </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-8 h-12 w-full rounded-xl bg-[#C6921E] font-semibold text-white hover:bg-[#B8860B] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Enviando..." : "Enviar cadastro"}
        </button>
      </form>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  onBlur,
  onPaste,
  type = "text",
  maxLength,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
  type?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block font-medium">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        onBlur={onBlur}
        onPaste={onPaste}
        maxLength={maxLength}
        required={required}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
      />
    </div>
  );
}
