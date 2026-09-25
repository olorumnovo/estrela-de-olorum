import {
    LayoutDashboard,
    Users,
    ClipboardList,
    CalendarDays,
    Wallet,
    CreditCard,
    ShoppingCart,
    Package,
    Bell,
    Shield,
    FileBarChart,
    Settings
} from "lucide-react";

export const menu = [
    {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard
    },
    {
        title: "Membros",
        href: "/membros",
        icon: Users
    },
    {
        title: "Atendimentos",
        href: "/atendimentos",
        icon: ClipboardList
    },
    {
        title: "Agenda",
        href: "/agenda",
        icon: CalendarDays
    },
    {
        title: "Financeiro",
        href: "/financeiro",
        icon: Wallet
    },
    {
        title: "Mensalidades",
        href: "/mensalidades",
        icon: CreditCard
    },
    {
        title: "PDV",
        href: "/pdv",
        icon: ShoppingCart
    },
    {
        title: "Produtos",
        href: "/produtos",
        icon: Package
    },
    {
        title: "Notificações",
        href: "/notificacoes",
        icon: Bell
    },
    {
        title: "Usuários",
        href: "/usuarios",
        icon: Shield
    },
    {
        title: "Relatórios",
        href: "/relatorios",
        icon: FileBarChart
    },
    {
        title: "Configurações",
        href: "/configuracoes",
        icon: Settings
    }
];