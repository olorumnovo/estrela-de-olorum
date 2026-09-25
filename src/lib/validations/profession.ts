import { z } from "zod";

export const professionSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe a profissão.")
    .max(120),

  ativo: z.boolean().default(true),
});

export type ProfessionInput = z.infer<typeof professionSchema>;