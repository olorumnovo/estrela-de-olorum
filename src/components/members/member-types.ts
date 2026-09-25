export type MemberFormData = {
  nome: string;

  cpfCnpj: string;

  rg: string;

  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

  estadoCivil: string;

  sexo: string;

  hierarchyIds: string[];

  classificationIds: string[];

  dataNascimento: string;

  dataEntrada: string;

  dataSaida: string;

  cep: string;

  endereco: string;

  numero: string;

  complemento: string;

  bairro: string;

  cidade: string;

  estado: string;

  celular: string;

  email: string;

  entidadePai1: string;

  entidadePai2: string;

  entidadeMae1: string;

  entidadeMae2: string;

  observacoes: string;

  foto: File | string | null;
};
