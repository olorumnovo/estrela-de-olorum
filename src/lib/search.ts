export function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function includesNormalizedSearch(value: unknown, search: unknown) {
  const term = normalizeSearchText(search);

  if (!term) {
    return true;
  }

  return normalizeSearchText(value).includes(term);
}

export function anyIncludesNormalizedSearch(values: unknown[], search: unknown) {
  const term = normalizeSearchText(search);

  if (!term) {
    return true;
  }

  return values.some((value) => normalizeSearchText(value).includes(term));
}

export function nameMatchesSearchSuggestion(name: unknown, search: unknown) {
  const term = normalizeSearchText(search);
  const normalizedName = normalizeSearchText(name);

  if (!term) {
    return false;
  }

  return normalizedName
    .split(/\s+/)
    .some((part) => part.startsWith(term));
}
