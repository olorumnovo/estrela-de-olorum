import {
  createMemberLookupHandlers,
} from "@/modules/member-lookups/member-lookup.route";

export const { GET, POST } =
  createMemberLookupHandlers("hierarchies");
