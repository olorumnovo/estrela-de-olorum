import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { ApiResponse } from "@/lib/response";
import { getErrorMessage } from "@/lib/errors";

import {
  professionSchema,
} from "@/modules/professions/profession.validator";

import {
  professionService,
} from "@/modules/professions/profession.service";

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

    const profession =
      await professionService.buscar(
        id,
        user.templeId
      );

    if (!profession) {
      return ApiResponse.notFound(
        "Profissão não encontrada."
      );
    }

    return ApiResponse.success(
      profession
    );
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

    const data =
      professionSchema.parse(body);

    const profession =
      await professionService.atualizar(
        id,
        data,
        user.templeId
      );

    return ApiResponse.success(
      profession
    );
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

    await professionService.excluir(
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
