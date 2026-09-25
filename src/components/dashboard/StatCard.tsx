import { ReactNode } from "react";
import { TrendingUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  color: string;
}

export default function StatCard({
  title,
  value,
  icon,
  color,
}: StatCardProps) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

      <div className="flex items-start justify-between">

        <div>

          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <h2 className="mt-3 text-4xl font-bold text-slate-900">
            {value}
          </h2>

          <div className="mt-5 flex items-center gap-2">

            <TrendingUp
              size={16}
              className="text-emerald-600"
            />

            <span className="text-sm font-medium text-emerald-600">
              +12% este mês
            </span>

          </div>

        </div>

        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:scale-110"
          style={{
            background: color,
          }}
        >
          {icon}
        </div>

      </div>

    </div>
  );
}