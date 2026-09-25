export type PaginationParams = {
  page?: number;
  limit?: number;
};

export function getPagination(params: PaginationParams) {
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.max(1, Math.min(100, Number(params.limit || 20)));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}