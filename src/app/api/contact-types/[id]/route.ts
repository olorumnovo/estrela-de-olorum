import { createReligiousLookupByIdHandlers } from "@/modules/religious-lookups/religious-lookup.route";

export const { GET, PUT, DELETE } =
  createReligiousLookupByIdHandlers(
    "contact-types"
  );
