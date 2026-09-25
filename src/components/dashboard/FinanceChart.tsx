"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const data = [
  { mes: "Jan", valor: 5200 },
  { mes: "Fev", valor: 8100 },
  { mes: "Mar", valor: 9800 },
  { mes: "Abr", valor: 12100 },
  { mes: "Mai", valor: 18200 },
  { mes: "Jun", valor: 20150 },
];

export default function FinanceChart() {
  return (
    <div>

      <div className="mb-6 grid grid-cols-3 gap-4">

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
            Entradas
          </p>

          <h3 className="mt-3 text-[24px] font-bold text-emerald-700">
            R$ 20.150,00
          </h3>

        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">

          <p className="text-xs font-bold uppercase tracking-widest text-red-700">
            Saídas
          </p>

          <h3 className="mt-3 text-[24px] font-bold text-red-700">
            R$ 11.420,00
          </h3>

        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Saldo
          </p>

          <h3 className="mt-3 text-[24px] font-bold text-amber-700">
            R$ 8.730,00
          </h3>

        </div>

      </div>

      <div className="h-[280px]">

        <ResponsiveContainer width="100%" height="100%">

          <AreaChart data={data}>

            <defs>

              <linearGradient
                id="saldo"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >

                <stop
                  offset="0%"
                  stopColor="#16A34A"
                  stopOpacity={0.35}
                />

                <stop
                  offset="100%"
                  stopColor="#16A34A"
                  stopOpacity={0.03}
                />

              </linearGradient>

            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E5E7EB"
            />

            <XAxis
              dataKey="mes"
              tick={{ fontSize: 12 }}
            />

            <YAxis tick={{ fontSize: 12 }} />

            <Tooltip />

            <Area
              type="monotone"
              dataKey="valor"
              stroke="#16A34A"
              strokeWidth={3}
              fill="url(#saldo)"
            />

          </AreaChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}