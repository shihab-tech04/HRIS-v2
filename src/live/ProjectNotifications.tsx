import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type ProjectNotification = {
  id: string;
  source: 'project_review';
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
type LearningNotification = {
  id: string;
  source: 'learning_completion';
  kind: 'verified' | 'returned_for_correction';
  enrollment_id: string;
  program_title: string;
  created_at: string;
};
type TravelNotification = {
  id: string;
  source: 'travel_decision';
  kind: 'approved' | 'rejected';
  travel_request_id: string;
  travel_destination: string | null;
  travel_from_date: string | null;
  travel_to_date: string | null;
  created_at: string;
};
type LeaveNotification = {
  id: string;
  source: 'leave_decision';
  kind: 'approved' | 'rejected';
  leave_request_id: string;
  leave_type_name: string | null;
  leave_from_date: string | null;
  leave_to_date: string | null;
  created_at: string;
};
type ServiceRequestNotification = {
  id: string;
  source: 'service_request_decision';
  kind: 'completed' | 'rejected';
  service_request_id: string;
  service_request_type: string;
  created_at: string;
};
type RosterNotification = {
  id: string;
  source: 'roster_change';
  kind: 'assigned';
  roster_assignment_id: string;
  roster_assignment_date: string;
  roster_shift_name: string;
  roster_start_time: string | null;
  roster_end_time: string | null;
  created_at: string;
};
type Notification = ProjectNotification | LearningNotification | TravelNotification | LeaveNotification | ServiceRequestNotification | RosterNotification;
type Cursor = { createdAt: string; source: Notification['source']; id: string };
type NotificationResponse = {
  notifications?: Notification[];
  unread_project_reviews?: number;
  has_more?: boolean;
};

function uniqueNotifications(rows: Notification[]) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = `${row.source}:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function message(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Unable to load your notifications.';
}

export function ProjectNotifications({ tenantId, locale, onOpenProjects, onOpenLearning, onOpenTravel, onOpenLeave, onOpenServiceRequest, onOpenRoster }: {
  tenantId: string;
  locale: Locale;
  onOpenProjects: () => void;
  onOpenLearning: () => void;
  onOpenTravel: (travelRequestId: string) => void;
  onOpenLeave: (leaveRequestId: string) => void;
  onOpenServiceRequest: (serviceRequestId: string) => void;
  onOpenRoster: (assignmentDate: string) => void;
}) {
  const tx = (english: string) => projectText(locale, english);
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
        const result = await supabase.rpc('hris_get_my_notifications', {
          p_tenant_id: tenantId, p_limit: 50,
          p_before_created_at: null, p_before_source: null, p_before_id: null,
        });
        if (requestId !== requestSequence.current) return;
        if (result.error) throw result.error;
        const response = result.data as NotificationResponse | null;
        if (!Array.isArray(response?.notifications) || !Number.isInteger(response?.unread_project_reviews)
            || typeof response?.has_more !== 'boolean') {
          throw new Error('Notification inbox returned an invalid response.');
        }
        const rows = response.notifications;
        setItems(uniqueNotifications(rows)); setUnreadCount(response.unread_project_reviews || 0);
        if (response.has_more && rows.length) {
          const last = rows.at(-1)!;
          setCursor({ createdAt: last.created_at, source: last.source, id: last.id });
        }
        setHasMore(response.has_more);
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
      const result = await supabase.rpc('hris_get_my_notifications', {
        p_tenant_id: tenantId, p_limit: 50,
        p_before_created_at: cursor.createdAt, p_before_source: cursor.source, p_before_id: cursor.id,
      });
      if (requestId !== requestSequence.current) return;
      if (result.error) throw result.error;
      const response = result.data as NotificationResponse | null;
      if (!Array.isArray(response?.notifications) || !Number.isInteger(response?.unread_project_reviews)
          || typeof response?.has_more !== 'boolean') {
        throw new Error('Notification history returned an invalid response.');
      }
      const rows = response.notifications;
      setItems(current => uniqueNotifications([...current, ...rows]));
      setUnreadCount(response.unread_project_reviews || 0);
      setHasMore(response.has_more);
      if (rows.length) {
        const last = rows.at(-1)!;
        setCursor({ createdAt: last.created_at, source: last.source, id: last.id });
      } else setCursor(null);
    } catch (cause) {
      if (requestId === requestSequence.current) setError(message(cause));
    } finally {
      if (requestId === requestSequence.current) setLoadingMore(false);
    }
  }

  return <section aria-labelledby="project-notifications-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="project-notifications-heading" className="text-2xl font-medium text-[#49454F]">{tx('Notifications')}</h2>
        <p className="mt-1 text-sm text-slate-500">{tx('Project review alerts, learning completion decisions, travel requests, leave, service request outcomes, and roster updates from your organization.')}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">{unreadCount.toLocaleString()} {tx('unread project review alerts')}</span>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx('Refresh')}</button>
      </div>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading notifications…')}</p> : items.length === 0 ?
      <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><Bell className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true"/><p className="mt-2 text-sm text-slate-600">{tx('You have no notifications.')}</p></div> :
      <div className="space-y-3">{items.map(item => {
        const isProjectReview = item.source === 'project_review';
        const pending = isProjectReview && item.review_status === 'pending';
        const isTravelDecision = item.source === 'travel_decision';
        const isLeaveDecision = item.source === 'leave_decision';
        const isServiceRequestDecision = item.source === 'service_request_decision';
        const isRosterChange = item.source === 'roster_change';
        const needsCorrection = item.source === 'learning_completion' && item.kind === 'returned_for_correction';
        const needsAction = pending || needsCorrection;
        const decisionRejected = (isTravelDecision || isLeaveDecision || isServiceRequestDecision) && item.kind === 'rejected';
        const decisionFromDate = isLeaveDecision ? item.leave_from_date : isTravelDecision ? item.travel_from_date : null;
        const decisionToDate = isLeaveDecision ? item.leave_to_date : isTravelDecision ? item.travel_to_date : null;
        const dateRange = decisionFromDate && decisionToDate
          ? `${new Date(`${decisionFromDate}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')} – ${new Date(`${decisionToDate}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}`
          : '';
        return <article key={`${item.source}:${item.id}`} data-notification-source={item.source} data-notification-kind={item.kind}
          data-notification-request-id={isLeaveDecision ? item.leave_request_id : isServiceRequestDecision ? item.service_request_id : undefined}
          data-roster-assignment-id={isRosterChange ? item.roster_assignment_id : undefined}
          className={`rounded-xl border p-4 shadow-sm sm:p-5 ${needsAction ? 'border-amber-200 bg-white' : decisionRejected ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${needsAction ? 'bg-amber-50 text-amber-800' : decisionRejected ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {needsAction || decisionRejected ? <Bell className="h-4 w-4" aria-hidden="true"/> : <CheckCircle2 className="h-4 w-4" aria-hidden="true"/>}
              </span>
              <div className="min-w-0">
                {isProjectReview ? <>
                  <p className="text-xs font-medium text-slate-500">{tx('Project review')} · {item.project_name} · {item.task_title}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{pending ? (locale === 'bn' ? `${item.reviewee_name}-এর জন্য সহকর্মী পর্যালোচনা` : `Peer review for ${item.reviewee_name}`) : (locale === 'bn' ? `${item.reviewee_name}-এর পর্যালোচনা সম্পন্ন` : `Review for ${item.reviewee_name} completed`)}</h3>
                  <p className="mt-1 text-sm text-slate-600">{tx(pending ? 'A task collaborator is waiting for your review.' : 'Your submitted review is recorded in the task history.')}</p>
                </> : isTravelDecision ? <>
                  <p className="text-xs font-medium text-slate-500">{tx('Travel update')}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{tx(item.kind === 'approved' ? 'Travel request approved' : 'Travel request rejected')}</h3>
                  <p className="mt-1 break-words text-sm font-medium text-slate-700">{item.travel_destination || tx('Travel request')}</p>
                  {dateRange && <p className="mt-1 text-sm text-slate-600">{dateRange}</p>}
                  <p className="mt-1 text-sm text-slate-600">{tx(item.kind === 'approved' ? 'Your travel request was approved.' : 'Your travel request was rejected.')}</p>
                </> : isLeaveDecision ? <>
                  <p className="text-xs font-medium text-slate-500">{tx('Leave update')}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{tx(item.kind === 'approved' ? 'Leave request approved' : 'Leave request rejected')}</h3>
                  <p className="mt-1 break-words text-sm font-medium text-slate-700">{item.leave_type_name || tx('Leave request')}</p>
                  {dateRange && <p className="mt-1 text-sm text-slate-600">{dateRange}</p>}
                  <p className="mt-1 text-sm text-slate-600">{tx(item.kind === 'approved' ? 'Your leave request was approved.' : 'Your leave request was rejected.')}</p>
                </> : isServiceRequestDecision ? <>
                  <p className="text-xs font-medium text-slate-500">{tx('Service request update')}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{tx(item.kind === 'completed' ? 'Service request completed' : 'Service request rejected')}</h3>
                  <p className="mt-1 text-sm text-slate-600">{tx(item.kind === 'completed' ? 'Your service request was completed.' : 'Your service request was rejected.')}</p>
                </> : isRosterChange ? <>
                  <p className="text-xs font-medium text-slate-500">{tx('Roster update')}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{tx('Your roster was updated')}</h3>
                  <p className="mt-1 break-words text-sm font-medium text-slate-700">{item.roster_shift_name}</p>
                  <p className="mt-1 text-sm text-slate-600">{new Date(`${item.roster_assignment_date}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p>
                  {item.roster_start_time && item.roster_end_time && <p className="mt-1 text-sm text-slate-600">{item.roster_start_time.slice(0, 5)} – {item.roster_end_time.slice(0, 5)}</p>}
                </> : <>
                  <p className="text-xs font-medium text-slate-500">{tx('Learning update')}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{tx(item.kind === 'verified' ? 'Learning completion verified' : 'Learning completion returned for correction')}</h3>
                  <p className="mt-1 break-words text-sm font-medium text-slate-700">{item.program_title}</p>
                  <p className="mt-1 text-sm text-slate-600">{tx(item.kind === 'verified' ? 'A manager verified this training completion.' : 'A manager returned this training completion for correction.')}</p>
                </>}
                <time className="mt-2 block text-xs text-slate-500" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              </div>
            </div>
            {pending && <button type="button" onClick={onOpenProjects} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open review')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
            {item.source === 'learning_completion' && <button type="button" onClick={onOpenLearning} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open learning')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
            {isTravelDecision && <button type="button" onClick={() => onOpenTravel(item.travel_request_id)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open travel')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
            {isLeaveDecision && <button type="button" onClick={() => onOpenLeave(item.leave_request_id)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open leave')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
            {isServiceRequestDecision && <button type="button" onClick={() => onOpenServiceRequest(item.service_request_id)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open service request')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
            {isRosterChange && <button type="button" onClick={() => onOpenRoster(item.roster_assignment_date)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white">{tx('Open roster')} <ArrowRight className="h-4 w-4" aria-hidden="true"/></button>}
          </div>
        </article>;
      })}</div>}
    {!loading && hasMore && <div className="flex justify-center"><button type="button" onClick={() => void loadOlder()} disabled={loadingMore} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium disabled:opacity-50">{loadingMore ? tx('Loading…') : tx('Load older notifications')}</button></div>}
  </section>;
}
