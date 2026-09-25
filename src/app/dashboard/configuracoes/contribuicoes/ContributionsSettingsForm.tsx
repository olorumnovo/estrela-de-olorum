"use client";

import { useState } from "react";

type ContributionsSettings = {
  dueDay: string;
  monthlyFull: string;
  monthlyDiscount: string;
  courseFull: string;
  courseDiscount: string;
  enrollment: string;
  comboSilver: string;
  comboGold: string;
  financeWhatsapp: string;
};

export default function ContributionsSettingsForm({
  initialData,
}: {
  initialData: ContributionsSettings;
}) {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);

    try {
      const response = await fetch("/api/settings/contributions", {
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

      window.alert("Configurações de contribuição salvas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-5xl rounded-2xl bg-white p-6 shadow">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Dia do vencimento" value={form.dueDay} onChange={(value) => setForm((current) => ({ ...current, dueDay: value }))} />
        <Field label="WhatsApp financeiro" value={form.financeWhatsapp} onChange={(value) => setForm((current) => ({ ...current, financeWhatsapp: value }))} />
        <Field label="Mensalidade integral" value={form.monthlyFull} onChange={(value) => setForm((current) => ({ ...current, monthlyFull: value }))} />
        <Field label="Mensalidade até vencimento" value={form.monthlyDiscount} onChange={(value) => setForm((current) => ({ ...current, monthlyDiscount: value }))} />
        <Field label="Curso integral" value={form.courseFull} onChange={(value) => setForm((current) => ({ ...current, courseFull: value }))} />
        <Field label="Curso até vencimento" value={form.courseDiscount} onChange={(value) => setForm((current) => ({ ...current, courseDiscount: value }))} />
        <Field label="Matrícula" value={form.enrollment} onChange={(value) => setForm((current) => ({ ...current, enrollment: value }))} />
        <Field label="Combo Prata" value={form.comboSilver} onChange={(value) => setForm((current) => ({ ...current, comboSilver: value }))} />
        <Field label="Combo Ouro" value={form.comboGold} onChange={(value) => setForm((current) => ({ ...current, comboGold: value }))} />
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
