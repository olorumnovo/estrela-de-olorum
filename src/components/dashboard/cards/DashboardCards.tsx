"use client";

import {
  CalendarDays,
  CreditCard,
  DollarSign,
  Users,
  TrendingUp,
} from "lucide-react";

const cards = [
  {
    title: "MEMBROS ATIVOS",
    value: "128",
    info: "+8 este mês",
    color: "bg-[#D39A11]",
    icon: Users,
  },
  {
    title: "RECEITA MENSAL",
    value: "R$ 18.430",
    info: "+15% este mês",
    color: "bg-[#D39A11]",
    icon: DollarSign,
  },
  {
    title: "MENSALIDADES",
    value: "23",
    info: "5 vencendo hoje",
    color: "bg-[#D39A11]",
    icon: CreditCard,
  },
  {
    title: "AGENDA HOJE",
    value: "12",
    info: "3 atendimentos",
    color: "bg-[#D39A11]",
    icon: CalendarDays,
  },
];

export default function DashboardCards() {
  return (
    <div className="grid grid-cols-4 gap-5">

      {cards.map((card) => {

        const Icon = card.icon;

        return (

          <div
            key={card.title}
            className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md"
          >

            <div
              className={`mb-7 flex h-14 w-14 items-center justify-center rounded-full ${card.color}`}
            >
              <Icon
                size={28}
                className="text-white"
              />
            </div>

            <p className="text-[12px] font-bold tracking-wider text-slate-500">
              {card.title}
            </p>

            <h2 className="mt-3 text-[34px] font-bold leading-none text-slate-900">
              {card.value}
            </h2>

            <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700">

              <TrendingUp size={15} />

              {card.info}

            </div>

            <div className="absolute -bottom-8 -right-5 text-[180px] font-black text-slate-100 opacity-70">

              {card.title === "MEMBROS ATIVOS" && "◌"}
              {card.title === "RECEITA MENSAL" && "$"}
              {card.title === "MENSALIDADES" && "▭"}
              {card.title === "AGENDA HOJE" && "+"}

            </div>

          </div>

        );

      })}

    </div>
  );
}