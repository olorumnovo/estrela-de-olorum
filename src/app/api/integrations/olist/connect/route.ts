import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { buildOlistAuthorizationUrl } from "@/lib/olist/oauth";
import { ApiResponse } from "@/lib/response";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const url = buildOlistAuthorizationUrl({
      templeId: user.templeId,
      userId: user.id,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}

