import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { syncOlistProducts } from "@/lib/olist/products";
import { ApiResponse } from "@/lib/response";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const result = await syncOlistProducts(user.templeId);

    return ApiResponse.success({
      success: true,
      module: "products",
      ...result,
    });
  } catch (error) {
    return ApiResponse.serverError(getErrorMessage(error));
  }
}
