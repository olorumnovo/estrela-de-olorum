import { z } from "zod";

export const religiousLookupSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome."),

  ativo: z.boolean().default(true),

  tipo: z.string().trim().min(1).optional(),
});

export type ReligiousLookupInput = z.infer<
  typeof religiousLookupSchema
>;
