import { createReligiousLookupHandlers } from "@/modules/religious-lookups/religious-lookup.route";

export const { GET, POST } =
  createReligiousLookupHandlers(
    "religious-functions"
  );
