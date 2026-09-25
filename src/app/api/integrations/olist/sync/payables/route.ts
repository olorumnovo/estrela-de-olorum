import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { resetAndSyncOlistPayables, syncOlistPayables } from "@/lib/olist/financial";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    let reset = false;

    try {
      const body = await req.json();
      reset = body?.reset === true;
    } catch {
      reset = req.nextUrl.searchParams.get("reset") === "true";
    }

    const result = reset
      ? await resetAndSyncOlistPayables(user.templeId)
      : await syncOlistPayables(user.templeId);

    return ApiResponse.success({
      success: true,
      ...result,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
