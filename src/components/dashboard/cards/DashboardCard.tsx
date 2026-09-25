import { ReactNode } from "react";
import { TrendingUp } from "lucide-react";

interface DashboardCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  ghost: ReactNode;
}

export default function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  ghost,
}: DashboardCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-[#ECECEC] bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

      {/* Ícone fantasma */}
      <div className="absolute -right-5 -bottom-5 opacity-[0.04]">

        <div className="scale-[3.5]">

          {ghost}

        </div>

      </div>

      {/* Topo */}

      <div className="flex items-center justify-between">

        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-[#D9A520] via-[#C6921E] to-[#A97808] text-white shadow-lg transition-transform duration-300 group-hover:scale-110">

          {icon}

        </div>

      </div>

      {/* Conteúdo */}

      <div className="mt-7">

        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>

        <h2 className="mt-3 text-5xl font-bold text-slate-900">
          {value}
        </h2>

      </div>

      {/* Rodapé */}

      <div className="mt-7 flex items-center justify-between">

        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2">

          <TrendingUp
            size={18}
            className="text-emerald-600"
          />

          <span className="text-sm font-semibold text-emerald-700">
            {subtitle}
          </span>

        </div>

      </div>

    </div>
  );
}
