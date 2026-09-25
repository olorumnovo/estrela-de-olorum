"use client";

import { useState } from "react";

type PixSettings = {
  pixKey: string;
  pixName: string;
  pixBank: string;
};

export default function PixSettingsForm({
  initialData,
}: {
  initialData: PixSettings;
}) {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);

    try {
      const response = await fetch("/api/settings/pix", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        window.alert("Não foi possível salvar.");
        return;
      }

      window.alert("Configuração PIX salva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-3xl rounded-2xl bg-white p-6 shadow">
      <div className="grid gap-5">
        <Field
          label="Chave PIX"
          value={form.pixKey}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              pixKey: value,
            }))
          }
        />
        <Field
          label="Nome"
          value={form.pixName}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              pixName: value,
            }))
          }
        />
        <Field
          label="Banco"
          value={form.pixBank}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              pixBank: value,
            }))
          }
        />
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-6 rounded-xl bg-[#C6921E] px-8 py-3 font-semibold text-white hover:bg-[#B8860B] disabled:opacity-70"
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block font-medium">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
      />
    </div>
  );
}
