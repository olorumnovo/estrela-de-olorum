"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";

import { MemberSchema } from "./member-schema";

type Props = {
  form: UseFormReturn<MemberSchema>;
};

export default function MemberPhoto({ form }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const foto = form.watch("foto");

  const [preview, setPreview] = useState<string | null>(
    typeof foto === "string" ? foto : null
  );

  function handleSelect() {
    inputRef.current?.click();
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    form.setValue("foto", file, {
      shouldDirty: true,
      shouldValidate: true,
    });

    setPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    form.setValue("foto", null, {
      shouldDirty: true,
      shouldValidate: true,
    });

    setPreview(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">

      <h2 className="mb-6 text-center text-lg font-semibold text-slate-800">
        Foto do Membro
      </h2>

      <div className="flex flex-col items-center">

        <div className="flex h-52 w-52 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">

          {preview ? (
            <Image
              src={preview}
              alt="Foto"
              width={208}
              height={208}
              className="h-full w-full object-cover"
            />
          ) : (
            <Camera
              size={65}
              className="text-slate-400"
            />
          )}

        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleChange}
        />

        <p className="mt-4 text-center text-sm text-slate-500">
          Foto opcional
        </p>

        <button
          type="button"
          onClick={handleSelect}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C6921E] px-4 py-3 font-semibold text-white hover:bg-[#B8860B]"
        >
          <ImagePlus size={18} />
          Selecionar Foto
        </button>

        <button
          type="button"
          onClick={removePhoto}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 hover:bg-red-50"
        >
          <Trash2 size={18} />
          Remover Foto
        </button>

      </div>

    </div>
  );
}
