import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function SettingsBackButton({
  href = "/dashboard/configuracoes",
}: {
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E4D8C2] bg-white px-4 text-sm font-semibold text-[#171717] shadow-sm transition hover:bg-[#FAF8F3]"
    >
      <ArrowLeft size={16} />
      Voltar
    </Link>
  );
}
