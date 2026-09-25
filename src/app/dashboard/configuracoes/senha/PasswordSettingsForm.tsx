"use client";

import { FormEvent, useState } from "react";
import { Check } from "lucide-react";

export default function PasswordSettingsForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.message || "Não foi possível alterar a senha.");
      setLoading(false);
      return;
    }

    setForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setMessage("Senha alterada com sucesso.");
    setLoading(false);
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white p-6 shadow"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">
            Senha atual
          </span>
          <input
            type="password"
            value={form.currentPassword}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                currentPassword: event.target.value,
              }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">
            Nova senha
          </span>
          <input
            type="password"
            minLength={8}
            value={form.newPassword}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                newPassword: event.target.value,
              }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">
            Confirmar nova senha
          </span>
          <input
            type="password"
            minLength={8}
            value={form.confirmPassword}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          />
        </label>
      </div>

      {message && (
        <p className="mt-4 text-sm font-semibold text-slate-600">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#C6921E] px-6 py-3 font-semibold text-white hover:bg-[#B8860B]"
      >
        <Check size={18} />
        {loading ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
