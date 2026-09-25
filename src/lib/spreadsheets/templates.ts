export const spreadsheetTemplates = {
  members: {
    label: "Membros",
    fileName: "modelo-membros.xlsx",
    columns: ["Nome", "CPF", "Nascimento", "WhatsApp", "Telefone", "E-mail", "Status", "Cidade", "Estado", "Classificações", "Hierarquia"],
  },
  receivables: {
    label: "Contas a receber",
    fileName: "modelo-contas-a-receber.xlsx",
    columns: ["Documento", "Cliente", "Histórico", "Categoria", "Data emissão", "Competência", "Vencimento", "Valor", "Observações"],
  },
  payables: {
    label: "Contas a pagar",
    fileName: "modelo-contas-a-pagar.xlsx",
    columns: ["Documento", "Fornecedor", "Histórico", "Categoria", "Data emissão", "Competência", "Vencimento", "Valor", "Observações"],
  },
  activities: {
    label: "Atividades",
    fileName: "modelo-atividades.xlsx",
    columns: ["Título", "Categoria", "Data do evento", "Descrição", "Responsável", "Status", "Observações"],
  },
  sales: {
    label: "Vendas históricas",
    fileName: "modelo-vendas-historicas.xlsx",
    columns: ["Referência", "Data", "Cliente", "Total", "Método", "Status", "Observações"],
  },
  products: {
    label: "Produtos do estoque",
    fileName: "modelo-estoque.xlsx",
    columns: ["Código", "Produto", "Categoria", "Fornecedor", "Quantidade", "Estoque mínimo", "Preço de custo", "Preço de venda", "Localização", "Status"],
  },
} as const;

export type SpreadsheetResource = keyof typeof spreadsheetTemplates;

export function isSpreadsheetResource(value: string): value is SpreadsheetResource {
  return Object.hasOwn(spreadsheetTemplates, value);
}
