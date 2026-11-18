import { isValidIsoCalendarDate } from './iso-calendar-date.mjs';

/** Keep the existing roster API while sharing strict calendar validation. */
export const isValidRosterDate = isValidIsoCalendarDate;

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
