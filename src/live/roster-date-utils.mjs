/** Validate an ISO calendar date without accepting JS Date's rollover of impossible days. */
export function isValidRosterDate(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

/** Matches the existing maximum 31-day inclusive roster RPC date window. */
export function rosterRangeIssue(start, end) {
  if (!isValidRosterDate(start) || !isValidRosterDate(end) || start > end) return 'invalid';
  const span = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000;
  return span > 30 ? 'too_long' : null;
}

/** Rejects records outside the exact dates returned for the requested roster. */
export function isDateWithinRosterRange(date, start, end) {
  return isValidRosterDate(date) && rosterRangeIssue(start, end) === null && date >= start && date <= end;
}
