"use client";

import {
  CalendarDays,
  Clock3,
  MapPin,
  ChevronRight,
} from "lucide-react";

const eventos = [
  {
    titulo: "Gira de Caboclos",
    data: "26/06/2026 • 19:30",
    local: "Salão Principal",
    status: "Hoje",
    cor: "bg-emerald-100 text-emerald-700",
  },
  {
    titulo: "Desenvolvimento Mediúnico",
    data: "28/06/2026 • 20:00",
    local: "Sala 02",
    status: "Confirmado",
    cor: "bg-blue-100 text-blue-700",
  },
  {
    titulo: "Atendimento Espiritual",
    data: "30/06/2026 • 18:00",
    local: "Sala de Atendimento",
    status: "Agenda",
    cor: "bg-amber-100 text-amber-700",
  },
];

export default function AgendaCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">

        <div>

          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
            Agenda
          </p>

          <h2 className="mt-2 text-[22px] font-bold text-slate-900">
            Próximas Atividades
          </h2>

        </div>

        <button className="flex items-center gap-2 rounded-full bg-[#FFF3D6] px-4 py-2 text-sm font-semibold text-[#B8860B] transition hover:bg-[#FFE7AF]">

          Ver Todas

          <ChevronRight size={16} />

        </button>

      </div>

      <div>

        {eventos.map((evento) => (

          <div
            key={evento.titulo}
            className="flex gap-4 border-b border-slate-100 px-6 py-5 last:border-none"
          >

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF6E3]">

              <CalendarDays
                size={22}
                className="text-[#C6921E]"
              />

            </div>

            <div className="flex-1">

              <div className="flex items-center justify-between">

                <h3 className="text-[17px] font-bold text-slate-900">
                  {evento.titulo}
                </h3>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${evento.cor}`}
                >
                  {evento.status}
                </span>

              </div>

              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">

                <Clock3 size={14} />

                {evento.data}

              </div>

              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">

                <MapPin size={14} />

                {evento.local}

              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}