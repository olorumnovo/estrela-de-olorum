import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ApiResponse } from "@/lib/response";
import {
  ReligiousLookupType,
  SpiritualEntityType,
} from "./religious-lookup.config";
import { religiousLookupService } from "./religious-lookup.service";
import { religiousLookupSchema } from "./religious-lookup.validator";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export function createReligiousLookupHandlers(
  type: ReligiousLookupType
) {
  return {
    async GET(req: NextRequest) {
      try {
        const user = await requireAuth(req);
        const templeId = user.templeId;
        const entityType =
          (req.nextUrl.searchParams.get("tipo") as
            | SpiritualEntityType
            | null) ?? undefined;

        const items =
          await religiousLookupService.listar(
            type,
            templeId,
            entityType
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
        const body = await req.json();
        const data =
          religiousLookupSchema.parse(body);
        const user = await requireAuth(req);
        const templeId = user.templeId;

        const item =
          await religiousLookupService.criar(
            type,
            templeId,
            data,
            data.tipo as SpiritualEntityType | undefined
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

export function createReligiousLookupByIdHandlers(
  type: ReligiousLookupType
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
          await religiousLookupService.buscar(
            type,
            id,
            user.templeId
          );

        if (!item) {
          return ApiResponse.notFound(
            "Registro não encontrado."
          );
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
        const body = await req.json();
        const data =
          religiousLookupSchema.parse(body);

        const item =
          await religiousLookupService.atualizar(
            type,
            id,
            data,
            user.templeId,
            data.tipo as SpiritualEntityType | undefined
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

        await religiousLookupService.excluir(
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
