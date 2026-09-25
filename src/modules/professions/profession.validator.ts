import { z } from "zod";

export const professionSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome da profissão."),

  ativo: z.boolean().default(true),
});

export type ProfessionInput = z.infer<
  typeof professionSchema
>;