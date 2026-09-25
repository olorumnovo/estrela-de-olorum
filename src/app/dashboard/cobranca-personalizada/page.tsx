import WhatsappChargeTemplatesForm from "./WhatsappChargeTemplatesForm";

import { getReceivableWhatsappTemplates } from "@/lib/finance/receivable-whatsapp-templates";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";

export default async function CobrancaPersonalizadaPage() {
  const user = await requireCurrentUserFromCookies();
  const templates = await getReceivableWhatsappTemplates(user.templeId);

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#C6921E]">
            Finanças • WhatsApp
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-900">
            Cobrança Personalizada
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Personalize as mensagens enviadas antes do vencimento, no dia do
            vencimento e quando uma conta estiver atrasada.
          </p>
        </header>

        <WhatsappChargeTemplatesForm initialTemplates={templates} />
      </div>
    </main>
  );
}
