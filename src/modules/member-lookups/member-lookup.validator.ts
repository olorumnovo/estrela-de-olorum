import { z } from "zod";

export const memberLookupSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  ativo: z.boolean().default(true),
});

export type MemberLookupInput = z.infer<
  typeof memberLookupSchema
>;
