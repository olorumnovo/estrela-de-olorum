import {
  LayoutDashboard,
  Users,
  CalendarDays,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Boxes,
  Bell,
  BarChart3,
  Settings,
  Shield
} from "lucide-react";

export const menu = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    title: "Membros",
    icon: Users,
    href: "/membros",
  },
  {
    title: "Agenda",
    icon: CalendarDays,
    href: "/agenda",
  },
  {
    title: "Financeiro",
    icon: DollarSign,
    href: "/financeiro",
  },
  {
    title: "Mensalidades",
    icon: CreditCard,
    href: "/mensalidades",
  },
  {
    title: "PDV",
    icon: ShoppingCart,
    href: "/pdv",
  },
  {
    title: "Estoque",
    icon: Boxes,
    href: "/estoque",
  },
  {
    title: "Notificações",
    icon: Bell,
    href: "/notificacoes",
  },
  {
    title: "Relatórios",
    icon: BarChart3,
    href: "/relatorios",
  },
  {
    title: "Usuários",
    icon: Shield,
    href: "/usuarios",
  },
  {
    title: "Configurações",
    icon: Settings,
    href: "/configuracoes",
  },
];