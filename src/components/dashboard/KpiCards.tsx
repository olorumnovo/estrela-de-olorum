import {
  Users,
  DollarSign,
  CreditCard,
  CalendarDays,
} from "lucide-react";

import StatCard from "./StatCard";

export default function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">

      <StatCard
        title="Membros"
        value="248"
        color="#2563EB"
        icon={<Users size={28} />}
      />

      <StatCard
        title="Receita do Mês"
        value="R$ 18.430"
        color="#16A34A"
        icon={<DollarSign size={28} />}
      />

      <StatCard
        title="Mensalidades"
        value="7"
        color="#DC2626"
        icon={<CreditCard size={28} />}
      />

      <StatCard
        title="Agenda Hoje"
        value="12"
        color="#CA8A04"
        icon={<CalendarDays size={28} />}
      />

    </div>
  );
}