import { MemberSchema } from "./member-schema";

export const memberDefaults: MemberSchema = {
  nome: "",

  cpfCnpj: "",

  rg: "",

  estadoCivil: "",

  sexo: "",

  hierarchyIds: [""],

  classificationIds: [""],

  dataNascimento: "",

  dataEntrada: "",

  dataSaida: "",

  cep: "",

  endereco: "",

  numero: "",

  complemento: "",

  bairro: "",

  cidade: "",

  estado: "",

  celular: "",

  email: "",

  entidadePai1: "",

  entidadePai2: "",

  entidadeMae1: "",

  entidadeMae2: "",

  observacoes: "",

  foto: null,

  status: "ACTIVE",
};
