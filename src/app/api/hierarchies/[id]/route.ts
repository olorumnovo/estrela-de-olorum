import {
  createMemberLookupByIdHandlers,
} from "@/modules/member-lookups/member-lookup.route";

export const { GET, PUT, DELETE } =
  createMemberLookupByIdHandlers("hierarchies");
