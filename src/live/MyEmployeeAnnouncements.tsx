import { useEffect, useState } from 'react';
import { ExternalLink, Megaphone, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type Announcement = {
  id: string;
  title: string;
  category: string;
  body: string;
  attachment_url: string | null;
  pinned: boolean;
  published_at: string | null;
};

function tx(locale: Locale, text: string) {
  return projectText(locale, text);
}

function formatPublishedAt(value: string | null, locale: Locale) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return '';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(parsed);
}

export function MyEmployeeAnnouncements({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: requestError } = await supabase.from('notices')
          .select('id,title,category,body,attachment_url,pinned,published_at')
          .eq('tenant_id', tenantId)
          .eq('active', true)
          .order('pinned', { ascending: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(50);
        if (requestError) throw requestError;
        if (active) setItems(Array.isArray(data) ? data as Announcement[] : []);
      } catch {
        if (active) {
          setItems([]);
          setError(tx(locale, 'Announcements are unavailable. Refresh to try again.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tenantId, locale, revision]);

  return <section aria-labelledby="my-announcements-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id="my-announcements-heading" className="text-2xl font-medium text-[#49454F]">{tx(locale, 'Announcements')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tx(locale, 'Active notices for your organization and department.')}</p>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh announcements')} disabled={loading}
        onClick={() => setRevision(value => value + 1)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />{tx(locale, 'Refresh')}
      </button>
    </div>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <span>{error}</span>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-md border border-red-300 px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {loading ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx(locale, 'Loading announcements…')}</p>
      : error ? null
        : items.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx(locale, 'No active announcements are available.')}</p>
          : <ul className="grid min-w-0 gap-3 lg:grid-cols-2">
            {items.map(item => <li key={item.id} data-announcement-id={item.id}
              className={`min-w-0 rounded-xl border bg-white p-4 shadow-sm ${item.pinned ? 'border-[#085587] ring-1 ring-[#085587]/15' : 'border-slate-200'}`}>
              <article>
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${item.pinned ? 'bg-[#DCEFF4] text-[#085587]' : 'bg-slate-100 text-slate-600'}`}>
                    <Megaphone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-semibold text-slate-900">{item.title}</h3>
                      {item.pinned && <span className="rounded-full bg-[#DCEFF4] px-2.5 py-1 text-xs font-semibold text-[#085587]">{tx(locale, 'Pinned notice')}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.category}{item.published_at ? ` · ${formatPublishedAt(item.published_at, locale)}` : ''}</p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.body}</p>
                {item.attachment_url && <a href={item.attachment_url} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-[#085587] hover:bg-slate-50">
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="break-all">{tx(locale, 'Open attachment')}</span>
                </a>}
              </article>
            </li>)}
          </ul>}
  </section>;
}
