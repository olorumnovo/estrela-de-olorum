"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";

const data = [
  {
    name: "Pagas",
    value: 72,
    color: "#16A34A",
  },
  {
    name: "Pendentes",
    value: 18,
    color: "#D4A11E",
  },
  {
    name: "Atrasadas",
    value: 10,
    color: "#DC2626",
  },
];

export default function MonthlyFeesCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="border-b border-slate-100 px-8 py-6">

        <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
          Financeiro
        </p>

        <h2 className="mt-2 text-3xl font-bold text-slate-900">
          Mensalidades
        </h2>

      </div>

      <div className="grid gap-8 p-8 lg:grid-cols-[230px_1fr]">

        <div className="h-[220px]">

          <ResponsiveContainer width="100%" height="100%">

            <PieChart>

              <Pie
                data={data}
                innerRadius={65}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
              >

                {data.map((item) => (

                  <Cell
                    key={item.name}
                    fill={item.color}
                  />

                ))}

              </Pie>

            </PieChart>

          </ResponsiveContainer>

        </div>

        <div className="space-y-6">

          <Item
            color="#16A34A"
            titulo="Pagas"
            valor="R$ 18.450,00"
            percentual="72%"
          />

          <Item
            color="#D4A11E"
            titulo="Pendentes"
            valor="R$ 4.620,00"
            percentual="18%"
          />

          <Item
            color="#DC2626"
            titulo="Atrasadas"
            valor="R$ 2.180,00"
            percentual="10%"
          />

        </div>

      </div>

    </div>
  );
}

interface ItemProps {
  color: string;
  titulo: string;
  valor: string;
  percentual: string;
}

function Item({
  color,
  titulo,
  valor,
  percentual,
}: ItemProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">

      <div className="flex items-center gap-4">

        <div
          className="h-5 w-5 rounded-full"
          style={{
            background: color,
          }}
        />

        <div>

          <p className="font-semibold text-slate-900">
            {titulo}
          </p>

          <p className="text-sm text-slate-500">
            {valor}
          </p>

        </div>

      </div>

      <span className="text-xl font-bold text-slate-900">
        {percentual}
      </span>

    </div>
  );
}