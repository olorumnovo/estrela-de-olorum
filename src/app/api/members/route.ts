import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import {
  memberSchema,
  memberService,
} from "@/modules/members";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const templeId = user.templeId;
    const search =
      req.nextUrl.searchParams.get("search") ??
      undefined;
    const workerOnly =
      req.nextUrl.searchParams.get("workerOnly") ===
      "true";
    const statusParam =
      req.nextUrl.searchParams.get("status") ??
      undefined;
    const status =
      statusParam === "ACTIVE" ||
      statusParam === "INACTIVE" ||
      statusParam === "PENDING" ||
      statusParam === "SUSPENDED"
        ? statusParam
        : undefined;

    const members = await memberService.listar(
      templeId,
      {
        search,
        workerOnly,
        status,
      }
    );

    return ApiResponse.success(members);
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
    const data = memberSchema.parse(body);
    const user = await requireAuth(req);
    const templeId = user.templeId;

    const member = await memberService.criar(
      templeId,
      data
    );

    return ApiResponse.created(member);
  } catch (error) {
    return ApiResponse.serverError(
      getErrorMessage(error)
    );
  }
}
