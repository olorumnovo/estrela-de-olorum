import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres.")
  .regex(/[a-z]/, "A senha deve conter letra minúscula.")
  .regex(/[A-Z]/, "A senha deve conter letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter número.")
  .regex(/[^a-zA-Z0-9]/, "A senha deve conter caractere especial.");

function cleanCpf(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string) {
  const cpf = cleanCpf(value);

  if (!cpf || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const digits = cpf.split("").map(Number);
  const first =
    (digits.slice(0, 9).reduce((sum, digit, index) => sum + digit * (10 - index), 0) * 10) %
    11;
  const second =
    (digits.slice(0, 10).reduce((sum, digit, index) => sum + digit * (11 - index), 0) * 10) %
    11;

  return (first === 10 ? 0 : first) === digits[9] && (second === 10 ? 0 : second) === digits[10];
}

const optionalCpf = z
  .string()
  .optional()
  .nullable()
  .transform((value) => (value ? cleanCpf(value) : null))
  .refine((value) => !value || isValidCpf(value), "CPF inválido.");

export const userCreateSchema = z
  .object({
    nome: z.string().min(2, "Nome é obrigatório."),
    email: z.string().email("E-mail inválido."),
    telefone: z.string().optional().nullable(),
    cpf: optionalCpf,
    cargo: z.string().optional().nullable(),
    foto: z.string().optional().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED", "PENDING"]).default("ACTIVE"),
    observacoes: z.string().optional().nullable(),
    senha: strongPasswordSchema,
    confirmarSenha: z.string(),
    deveTrocarSenha: z.boolean().default(false),
    roleIds: z.array(z.string()).default([]),
    permissionOverrides: z
      .array(
        z.object({
          permissionId: z.string(),
          allowed: z.boolean(),
        })
      )
      .default([]),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "A confirmação da senha não confere.",
    path: ["confirmarSenha"],
  });

export const userUpdateSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório."),
  email: z.string().email("E-mail inválido."),
  telefone: z.string().optional().nullable(),
  cpf: optionalCpf,
  cargo: z.string().optional().nullable(),
  foto: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED", "PENDING"]),
  observacoes: z.string().optional().nullable(),
  deveTrocarSenha: z.boolean().default(false),
  roleIds: z.array(z.string()).default([]),
  permissionOverrides: z
    .array(
      z.object({
        permissionId: z.string(),
        allowed: z.boolean(),
      })
    )
    .default([]),
});

export const userPasswordResetSchema = z
  .object({
    senha: strongPasswordSchema,
    confirmarSenha: z.string(),
    deveTrocarSenha: z.boolean().default(true),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "A confirmação da senha não confere.",
    path: ["confirmarSenha"],
  });

export const userBlockSchema = z.object({
  motivo: z.string().min(3, "Informe o motivo do bloqueio."),
});

export const roleSchema = z.object({
  nome: z.string().min(2, "Nome é obrigatório."),
  descricao: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
  permissionIds: z.array(z.string()).default([]),
});

export const rolePermissionsSchema = z.object({
  permissionIds: z.array(z.string()).default([]),
});

export const userPermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permissionId: z.string(),
      allowed: z.boolean(),
    })
  ),
});

export const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});
