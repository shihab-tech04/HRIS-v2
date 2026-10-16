/** Return a date string for the tenant's local calendar day. */
export function tenantAttendanceDate(now = new Date(), timeZone = 'UTC') {
  const options = {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  try {
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
