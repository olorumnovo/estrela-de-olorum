"use client";

import {
  Cake,
  ChevronRight,
  Gift,
} from "lucide-react";

const aniversariantes = [
  {
    nome: "Maria Aparecida",
    cargo: "Cambone",
    data: "03 Jul",
  },
  {
    nome: "João Batista",
    cargo: "Médium",
    data: "09 Jul",
  },
  {
    nome: "Ana Cristina",
    cargo: "Dirigente",
    data: "15 Jul",
  },
  {
    nome: "Carlos Eduardo",
    cargo: "Consulente",
    data: "28 Jul",
  },
];

export default function RecentActivities() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">

        <div>

          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Pessoas
          </p>

          <h2 className="mt-2 text-[22px] font-bold text-slate-900">
            Aniversariantes
          </h2>

        </div>

        <button className="flex items-center gap-2 rounded-full bg-[#FFF3D6] px-4 py-2 text-sm font-semibold text-[#B8860B] hover:bg-[#FFE7AF]">

          Ver Todos

          <ChevronRight size={16} />

        </button>

      </div>

      <div>

        {aniversariantes.map((item) => (

          <div
            key={item.nome}
            className="flex items-center justify-between border-b border-slate-100 px-6 py-5 last:border-none"
          >

            <div className="flex items-center gap-4">

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF6E3]">

                <Cake
                  size={22}
                  className="text-[#C6921E]"
                />

              </div>

              <div>

                <h3 className="text-[17px] font-semibold text-slate-900">
                  {item.nome}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {item.cargo}
                </p>

              </div>

            </div>

            <div className="flex items-center gap-2 rounded-full bg-[#FFF6E3] px-3 py-2">

              <Gift
                size={16}
                className="text-[#C6921E]"
              />

              <span className="text-sm font-semibold text-[#B8860B]">
                {item.data}
              </span>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}