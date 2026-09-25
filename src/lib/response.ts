import { NextResponse } from "next/server";

export class ApiResponse {
  static success(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
  }

  static created(data: unknown) {
    return NextResponse.json(data, { status: 201 });
  }

  static error(message: string, status = 400) {
    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status,
      }
    );
  }

  static notFound(message = "Registro não encontrado.") {
    return this.error(message, 404);
  }

  static unauthorized(message = "Não autorizado.") {
    return this.error(message, 401);
  }

  static forbidden(message = "Acesso negado.") {
    return this.error(message, 403);
  }

  static serverError(message = "Erro interno do servidor.") {
    if (message === "UNAUTHORIZED") {
      return this.unauthorized();
    }

    if (message === "FORBIDDEN") {
      return this.forbidden();
    }

    return this.error(message, 500);
  }
}
