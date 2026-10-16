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


/** Format a stored timestamptz for the tenant; return null for absent or invalid values. */
export function tenantAttendanceTime(value, timeZone = 'UTC') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const options = { timeZone: timeZone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try {
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date);
  }
}

/** Format a stored timestamptz as a tenant-local date and time. */
export function tenantAttendanceDateTime(value, timeZone = 'UTC') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const options = {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timeZone || 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date);
  }
}
