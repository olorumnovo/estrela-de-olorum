import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { syncOlistReceivables } from "@/lib/olist/financial";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const result = await syncOlistReceivables(user.templeId);

    return ApiResponse.success({
      success: true,
      ...result,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
