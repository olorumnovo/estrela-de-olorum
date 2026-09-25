"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

const avisos = [
  {
    titulo: "Mensalidades vencidas",
    descricao: "12 membros estão com mensalidades em atraso.",
    icone: AlertTriangle,
    cor: "bg-red-100 text-red-600",
  },
  {
    titulo: "Nova gira cadastrada",
    descricao: "Gira de Caboclos cadastrada para sexta-feira.",
    icone: CheckCircle2,
    cor: "bg-green-100 text-green-600",
  },
  {
    titulo: "Estoque baixo",
    descricao: "Velas Brancas atingiram o estoque mínimo.",
    icone: Bell,
    cor: "bg-amber-100 text-amber-700",
  },
];

export default function NotificationsCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">

        <div>

          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Sistema
          </p>

          <h2 className="mt-2 text-[22px] font-bold text-slate-900">
            Avisos
          </h2>

        </div>

        <button className="flex items-center gap-2 rounded-full bg-[#FFF3D6] px-4 py-2 text-sm font-semibold text-[#B8860B] hover:bg-[#FFE7AF]">

          Ver Todos

          <ChevronRight size={16} />

        </button>

      </div>

      <div>

        {avisos.map((item) => {

          const Icon = item.icone;

          return (

            <div
              key={item.titulo}
              className="flex gap-4 border-b border-slate-100 px-6 py-5 last:border-none"
            >

              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.cor}`}>

                <Icon size={22} />

              </div>

              <div className="flex-1">

                <h3 className="text-[17px] font-semibold text-slate-900">

                  {item.titulo}

                </h3>

                <p className="mt-1 text-sm leading-6 text-slate-500">

                  {item.descricao}

                </p>

              </div>

            </div>

          );

        })}

      </div>

    </div>
  );
}