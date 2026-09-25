"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MonthlyPoint = {
  mes: string;
  recebido: number;
  aberto: number;
};

type AnnualPoint = {
  ano: string;
  receita: number;
  despesa: number;
};

type DashboardChartsProps = {
  monthly: MonthlyPoint[];
  annual: AnnualPoint[];
};

export default function DashboardCharts({
  monthly,
  annual,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
          Mensal
        </p>
        <h2 className="mt-2 text-[22px] font-bold text-slate-900">
          Recebido x aberto
        </h2>

        <div className="mt-6 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="recebido"
                stroke="#16A34A"
                fill="#DCFCE7"
                strokeWidth={3}
              />
              <Area
                type="monotone"
                dataKey="aberto"
                stroke="#CA8A04"
                fill="#FEF3C7"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6921E]">
          Anual
        </p>
        <h2 className="mt-2 text-[22px] font-bold text-slate-900">
          Receita x despesa
        </h2>

        <div className="mt-6 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="ano" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="receita" fill="#16A34A" radius={[6, 6, 0, 0]} />
              <Bar dataKey="despesa" fill="#DC2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
