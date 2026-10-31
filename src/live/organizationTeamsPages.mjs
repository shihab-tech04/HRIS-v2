/**
 * Read every tenant-scoped organization directory page. The caller owns the
 * tenant filter and stable ordering; this helper never changes authorization.
 * Invalidate requests when the active tenant or refresh generation changes.
 *
 * @template T
 * @param {(from: number, to: number) => Promise<{data: T[] | null, error: unknown}>} fetchPage
 * @param {() => boolean} isCurrent
 * @param {number} [pageSize]
 * @returns {Promise<T[]>}
 */
export async function readAllOrganizationPages(fetchPage, isCurrent, pageSize = 250) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('Invalid organization page size.');
  }

  const rows = [];
  for (let offset = 0; isCurrent(); offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (!isCurrent()) return [];
    if (error) throw error;

    // PostgREST returns [] (not null) when a page is legitimately empty.
    // Treat null as an incomplete/ambiguous response, never as end-of-list;
    // otherwise a temporary failed read can silently truncate CSV exports.
    if (!Array.isArray(data) || data.length > pageSize) {
      throw new Error('Invalid organization page response.');
    }
    const page = data;
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  return [];
}
