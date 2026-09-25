import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import {
  professionService,
} from "@/modules/professions/profession.service";
import {
  professionSchema,
} from "@/modules/professions/profession.validator";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;

    const professions =
      await professionService.listar(templeId);

    return ApiResponse.success(professions);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    const body = await req.json();
    const data =
      professionSchema.parse(body);
    const user = await requireAuth(req);
    const templeId = user.templeId;

    const profession =
      await professionService.criar(
        templeId,
        data
      );

    return ApiResponse.created(profession);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}
