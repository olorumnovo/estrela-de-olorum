"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Camera, Check, Trash2, UserRound } from "lucide-react";

import { useLayoutData } from "@/components/layout/context/LayoutDataContext";

type Props = {
  initialName: string;
  initialEmail: string;
  initialPhoto?: string | null;
};

export default function ProfileForm({
  initialName,
  initialEmail,
  initialPhoto,
}: Props) {
  const { reload } = useLayoutData();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    nome: initialName,
    foto: initialPhoto || "",
  });

  const initials = useMemo(() => {
    return form.nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }, [form.nome]);

  async function resizeProfileImage(file: File) {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
        img.src = imageUrl;
      });

      const maxSize = 512;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Não foi possível preparar a imagem.");
      }

      context.drawImage(image, 0, 0, width, height);

      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setMessage("");

    try {
      const resizedImage = await resizeProfileImage(file);
      setForm((current) => ({
        ...current,
        foto: resizedImage,
      }));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível processar a imagem."
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.message || "Não foi possível atualizar o perfil.");
      setLoading(false);
      return;
    }

    await reload();
    setMessage("Perfil atualizado com sucesso.");
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="relative">
          {form.foto ? (
            <div className="rounded-full bg-white p-[4px] shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80">
              <img
                src={form.foto}
                alt={form.nome}
                className="h-28 w-28 rounded-full object-cover object-center"
              />
            </div>
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#F8FAFC] via-white to-[#E8EEF9] text-2xl font-semibold text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80">
              {initials || <UserRound size={36} />}
            </div>
          )}

          <label className="absolute bottom-1 right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#C6921E] text-white shadow-[0_8px_18px_rgba(198,146,30,0.32)] ring-4 ring-white">
            <Camera size={18} />
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-900">Meu Perfil</h2>
          <p className="mt-1 text-sm text-slate-500">
            Atualize seu nome e sua foto de perfil.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            A foto é reduzida automaticamente para caber no perfil.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">Nome</span>
          <input
            value={form.nome}
            onChange={(event) =>
              setForm((current) => ({ ...current, nome: event.target.value }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#C6921E]"
            required
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">E-mail</span>
          <input
            value={initialEmail}
            disabled
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-500 outline-none"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#C6921E] px-6 py-3 font-semibold text-white hover:bg-[#B8860B]"
        >
          <Check size={18} />
          {loading ? "Salvando..." : "Salvar perfil"}
        </button>

        {form.foto && (
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, foto: "" }))}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-slate-700"
          >
            <Trash2 size={18} />
            Remover foto
          </button>
        )}
      </div>

      {message && <p className="mt-4 text-sm font-semibold text-slate-600">{message}</p>}
    </form>
  );
}
