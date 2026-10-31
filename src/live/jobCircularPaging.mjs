/**
 * Fetch exactly one tenant-scoped job circular page. The caller supplies an
 * authenticated, tenant-filtered and deterministically ordered PostgREST read.
 * Failures must never be converted into partial success or empty results.
 *
 * @template T
 * @param {(from: number, to: number) => Promise<{data: T[] | null, error: unknown}>} fetchRange
 * @param {number} offset
 * @param {number} [pageSize]
 */
export async function fetchJobCircularPage(fetchRange, offset, pageSize = 100) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new RangeError('Invalid job circular page request.');
  }
  const { data, error } = await fetchRange(offset, offset + pageSize - 1);
  if (error) throw error;
  if (!Array.isArray(data) || data.length > pageSize) throw new Error('Invalid job circular page response.');
  return { rows: data, nextOffset: offset + data.length, hasMore: data.length === pageSize };
}

/**
 * Existing rows retain their rendered ordering. A duplicate row from an
 * overlapping remote page may not create duplicate Edit/Publish affordances.
 *
 * @template {{id:string}} T
 * @param {T[]} previous
 * @param {T[]} incoming
 * @returns {T[]}
 */
export function appendUniqueJobCirculars(previous, incoming) {
  const ids = new Set(previous.map(row => row.id));
  return [...previous, ...incoming.filter(row => {
    if (!row || typeof row.id !== 'string' || ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  })];
}
