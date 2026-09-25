import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function getErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => issue.message)
      .join(", ");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return "Registro já cadastrado.";

      case "P2025":
        return "Registro não encontrado.";

      case "P2003":
        return "Registro vinculado a outro cadastro.";

      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro interno do servidor.";
}