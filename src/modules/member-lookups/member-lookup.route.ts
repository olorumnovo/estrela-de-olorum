import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import {
  MemberLookupType,
  memberLookupService,
} from "./member-lookup.service";
import {
  memberLookupSchema,
} from "./member-lookup.validator";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export function createMemberLookupHandlers(
  type: MemberLookupType
) {
  return {
    async GET(req: NextRequest) {
      try {
        const user = await requireAuth(req);
        const items =
          await memberLookupService.listar(
            type,
            user.templeId
          );

        return ApiResponse.success(items);
      } catch (error) {
        return ApiResponse.serverError(
          getErrorMessage(error)
        );
      }
    },

    async POST(req: NextRequest) {
      try {
        const user = await requireAuth(req);
        const data = memberLookupSchema.parse(
          await req.json()
        );
        const item =
          await memberLookupService.criar(
            type,
            user.templeId,
            data
          );

        return ApiResponse.created(item);
      } catch (error) {
        return ApiResponse.serverError(
          getErrorMessage(error)
        );
      }
    },
  };
}

export function createMemberLookupByIdHandlers(
  type: MemberLookupType
) {
  return {
    async GET(
      req: NextRequest,
      { params }: Params
    ) {
      try {
        const user = await requireAuth(req);
        const { id } = await params;
        const item =
          await memberLookupService.buscar(
            type,
            id,
            user.templeId
          );

        if (!item) {
          return ApiResponse.notFound();
        }

        return ApiResponse.success(item);
      } catch (error) {
        return ApiResponse.serverError(
          getErrorMessage(error)
        );
      }
    },

    async PUT(
      req: NextRequest,
      { params }: Params
    ) {
      try {
        const user = await requireAuth(req);
        const { id } = await params;
        const data = memberLookupSchema.parse(
          await req.json()
        );
        const item =
          await memberLookupService.atualizar(
            type,
            id,
            user.templeId,
            data
          );

        return ApiResponse.success(item);
      } catch (error) {
        return ApiResponse.serverError(
          getErrorMessage(error)
        );
      }
    },

    async DELETE(
      req: NextRequest,
      { params }: Params
    ) {
      try {
        const user = await requireAuth(req);
        const { id } = await params;

        await memberLookupService.excluir(
          type,
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
    },
  };
}
