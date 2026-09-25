import { prisma } from "@/lib/prisma";

export type ReceivableWhatsappTemplateKind =
  | "UPCOMING"
  | "DUE_TODAY"
  | "OVERDUE";

export type ReceivableWhatsappTemplates = Record<
  ReceivableWhatsappTemplateKind,
  string
>;

export const receivableWhatsappTemplateKeys: Record<
  ReceivableWhatsappTemplateKind,
  string
> = {
  UPCOMING: "whatsapp_charge_template_upcoming",
  DUE_TODAY: "whatsapp_charge_template_due_today",
  OVERDUE: "whatsapp_charge_template_overdue",
};

export const receivableWhatsappTemplateDefaults: ReceivableWhatsappTemplates = {
  DUE_TODAY: [
    "📣 COMUNICADO – VENCIMENTO DE MENSALIDADES",
    "Tenda de Umbanda Estrela de Olorum 🌟",
    "",
    "Comunicamos que o vencimento de {{historico}} de {{mes_vencimento}} é HOJE, dia {{vencimento}}.",
    "",
    "Solicitamos que, ao efetuar o pagamento, envie o comprovante para a nossa secretaria para que possamos dar baixa no sistema.",
    "",
    "Informamos que atrasos nas mensalidades (inadimplência) impactam diretamente a manutenção e as atividades do terreiro, dificultando custos essenciais como luz, água e materiais ritualísticos.",
    "",
    "Contamos com a sua colaboração para manter nossa casa em ordem.",
    "",
    "Se você já efetuou o pagamento, pode desconsiderar essa mensagem.",
    "",
    "Axé!!!",
  ].join("\n"),
  UPCOMING: [
    "📣 COMUNICADO – VENCIMENTO DE MENSALIDADES",
    "Tenda de Umbanda Estrela de Olorum ⭐",
    "",
    "Comunicamos que o vencimento de {{historico}} de {{mes_vencimento}} é dia {{vencimento}}.",
    "",
    "Vou te pedir um favor, quando efetuar o pagamento, me encaminhe o comprovante para que possamos dar baixa no sistema.",
    "",
    "Vamos ajudar a manter nosso terreiro em ordem.",
    "",
    "Se você já efetuou a sua doação, pode desconsiderar essa mensagem.",
    "",
    "Axé!!!",
  ].join("\n"),
  OVERDUE: [
    "Olá, {{nome}}! Tudo bem?",
    "",
    "Identificamos um pagamento pendente no valor de {{valor_pendente}}, referente à {{historico}}, com vencimento em {{vencimento}}.",
    "",
    "Manter a mensalidade em dia é fundamental para a organização e continuidade das atividades espirituais e administrativas da nossa Casa.",
    "",
    "Conforme as normas financeiras da T.U.E.O., a inadimplência poderá ocasionar suspensão dos cursos, participação nas giras somente como consulente e possível cancelamento da matrícula.",
    "",
    "{{pix}}",
    "",
    "Após o pagamento, pedimos que encaminhe o comprovante ao financeiro. Caso já tenha pago, envie o comprovante para conferência.",
    "",
    "Agradecemos pela atenção. Axé!",
  ].join("\n"),
};

export const receivableWhatsappTemplateVariables = [
  { key: "{{nome}}", description: "Nome do membro" },
  { key: "{{historico}}", description: "Descrição da conta" },
  { key: "{{valor_pendente}}", description: "Saldo que ainda deve ser pago" },
  { key: "{{vencimento}}", description: "Data de vencimento" },
  { key: "{{mes_vencimento}}", description: "Mês do vencimento" },
  { key: "{{pix}}", description: "Dados do Pix da T.U.E.O." },
] as const;

export async function getReceivableWhatsappTemplates(templeId: string) {
  const settings = await prisma.setting.findMany({
    where: {
      templeId,
      chave: { in: Object.values(receivableWhatsappTemplateKeys) },
    },
    select: { chave: true, valor: true },
  });

  return Object.fromEntries(
    (Object.keys(receivableWhatsappTemplateKeys) as ReceivableWhatsappTemplateKind[]).map(
      (kind) => [
        kind,
        settings.find(
          (setting) => setting.chave === receivableWhatsappTemplateKeys[kind]
        )?.valor || receivableWhatsappTemplateDefaults[kind],
      ]
    )
  ) as ReceivableWhatsappTemplates;
}

export function renderReceivableWhatsappTemplate(
  template: string,
  variables: Record<string, string>
) {
  return Object.entries(variables).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    template
  );
}
