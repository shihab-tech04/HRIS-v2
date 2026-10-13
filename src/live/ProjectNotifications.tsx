import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Notification = {
  id: string;
  kind: 'peer_review_required';
  peer_review_id: string;
  task_id: string;
  project_id: string;
  project_name: string;
  task_title: string;
  reviewee_name: string;
  review_status: 'pending' | 'submitted';
  created_at: string;
  read_at: string | null;
};
type Cursor = { createdAt: string; id: string };
type NotificationResponse = { notifications?: Notification[]; unread_count?: number };

function message(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Unable to load your notifications.';
}

export function ProjectNotifications({ tenantId, onOpenProjects }: {
  tenantId: string;
  onOpenProjects: () => void;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setItems([]); setCursor(null); setHasMore(false); setUnreadCount(0); setError(''); setLoading(true);
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_project_notifications', {
          p_tenant_id: tenantId, p_limit: 50,
          p_before_created_at: null, p_before_id: null,
        });
        if (requestId !== requestSequence.current) return;
        if (result.error) throw result.error;
        const response = result.data as NotificationResponse | null;
        if (!Array.isArray(response?.notifications) || !Number.isInteger(response?.unread_count)) {
          throw new Error('Notification inbox returned an invalid response.');
        }
        const rows = response.notifications;
        setItems(rows); setUnreadCount(response.unread_count || 0);
        if (rows.length === 50) setCursor({ createdAt: rows.at(-1)!.created_at, id: rows.at(-1)!.id });
        setHasMore(rows.length === 50);
      } catch (cause) {
        if (requestId === requestSequence.current) setError(message(cause));
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  async function loadOlder() {
    if (!cursor || loadingMore) return;
    const requestId = requestSequence.current;
    setLoadingMore(true); setError('');
    try {
      const result = await supabase.rpc('hris_get_my_project_notifications', {
        p_tenant_id: tenantId, p_limit: 50,
        p_before_created_at: cursor.createdAt, p_before_id: cursor.id,
      });
      if (requestId !== requestSequence.current) return;
      if (result.error) throw result.error;
      const response = result.data as NotificationResponse | null;
      if (!Array.isArray(response?.notifications) || !Number.isInteger(response?.unread_count)) {
        throw new Error('Notification history returned an invalid response.');
      }
      const rows = response.notifications;
      setItems(current => [...current, ...rows]); setUnreadCount(response.unread_count || 0);
      setHasMore(rows.length === 50);
      if (rows.length) setCursor({ createdAt: rows.at(-1)!.created_at, id: rows.at(-1)!.id });
      else setCursor(null);
    } catch (cause) {
      if (requestId === requestSequence.current) setError(message(cause));
    } finally {
      if (requestId === requestSequence.current) setLoadingMore(false);
    }
  }

  return <section aria-labelledby="project-notifications-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="project-notifications-heading" className="text-2xl font-medium text-[#49454F]">Notifications</h2>
        <p className="mt-1 text-sm text-slate-500">Project review alerts are tied to your task assignments. Completing a review clears its alert.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">{unreadCount.toLocaleString()} unread</span>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
      </div>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading notifications…</p> : items.length === 0 ?
      <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><Bell className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true"/><p className="mt-2 text-sm text-slate-600">You have no project review notifications.</p></div> :
      <div className="space-y-3">{items.map(item => {
        const pending = item.review_status === 'pending';
        return <article key={item.id} className={`rounded-xl border p-4 shadow-sm sm:p-5 ${pending ? 'border-amber-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${pending ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {pending ? <Bell className="h-4 w-4" aria-hidden="true"/> : <CheckCircle2 className="h-4 w-4" aria-hidden="true"/>}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">{item.project_name} · {item.task_title}</p>
                <h3 className="mt-1 break-words font-semibold text-slate-900">{pending ? `Peer review for ${item.reviewee_name}` : `Review for ${item.reviewee_name} completed`}</h3>
                <p className="mt-1 text-sm text-slate-600">{pending ? 'A task collaborator is waiting for your review.' : 'Your submitted review is recorded in the task history.'}</p>
                <time className="mt-2 block text-xs text-slate-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              </div>
            </div>
            {pending && <button type="button" onClick={onOpenProjects} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">Open review <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
          </div>
        </article>;
      })}</div>}
    {!loading && hasMore && <div className="flex justify-center"><button type="button" onClick={() => void loadOlder()} disabled={loadingMore} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load older notifications'}</button></div>}
  </section>;
}
