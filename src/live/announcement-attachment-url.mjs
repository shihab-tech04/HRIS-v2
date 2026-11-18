/** Allow ordinary external and same-origin paths; reject script/data/protocol-relative URLs. */
export function safeAnnouncementAttachmentUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.includes('\\')) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
