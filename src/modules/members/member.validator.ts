import { z } from "zod";

const fileSchema = z.custom<File>(
  (value) =>
    typeof File !== "undefined" &&
    value instanceof File,
  "Arquivo inválido."
);

export const memberSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome."),

  cpfCnpj: z.string(),

  rg: z.string(),

  estadoCivil: z.string(),

  sexo: z.string(),

  hierarchyIds: z.array(z.string()).min(1),

  classificationIds: z.array(z.string()).min(1),

  dataNascimento: z.string(),

  dataEntrada: z.string(),

  dataSaida: z.string(),

  cep: z.string(),

  endereco: z.string(),

  numero: z.string(),

  complemento: z.string(),

  bairro: z.string(),

  cidade: z.string(),

  estado: z.string(),

  celular: z.string(),

  email: z.string().email().or(z.literal("")),

  entidadePai1: z.string(),

  entidadePai2: z.string(),

  entidadeMae1: z.string(),

  entidadeMae2: z.string(),

  observacoes: z.string(),

  foto: z.union([z.string(), fileSchema]).nullable(),

  status: z.enum([
    "ACTIVE",
    "INACTIVE",
    "SUSPENDED",
    "PENDING",
  ]),
});

export type MemberInput = z.infer<
  typeof memberSchema
>;
