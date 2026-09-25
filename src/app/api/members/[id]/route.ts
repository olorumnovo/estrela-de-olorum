import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import {
  memberSchema,
  memberService,
} from "@/modules/members";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  req: NextRequest,
  { params }: Params
) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    const member = await memberService.buscar(
      id,
      user.templeId
    );

    if (!member) {
      return ApiResponse.notFound(
        "Membro não encontrado."
      );
    }

    return ApiResponse.success(member);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();
    const data = memberSchema.parse(body);

    const member =
      await memberService.atualizar(
        id,
        data,
        user.templeId
      );

    return ApiResponse.success(member);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;
    const user = await requireAuth(req);
    const body = await req.json();

    const status =
      body?.status === "ACTIVE" ||
      body?.status === "INACTIVE"
        ? body.status
        : null;

    if (!status) {
      return ApiResponse.serverError(
        "Status inválido."
      );
    }

    const member =
      await memberService.atualizarStatus(
        id,
        status,
        user.templeId
      );

    return ApiResponse.success(member);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: Params
) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    await memberService.excluir(
      id,
      user.templeId
    );

    return ApiResponse.success({
      success: true,
    });
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}
