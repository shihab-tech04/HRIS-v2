import { useEffect, useRef, useState } from 'react';
import { CalendarClock, GraduationCap, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type LearningSession = { id: string; start_at: string | null; location: string | null };
type LearningProgram = { id: string; title: string; sessions: LearningSession[] };
type LearningEnrollment = { session_id: string | null; status: string };
type TrainingItem = { id: string; title: string; startAt: string; location: string | null };

function tx(locale: Locale, source: string) {
  return projectText(locale, source);
}

function sessionDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return tx(locale, 'Time to be confirmed');
  return date.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  });
}

export function EmployeeUpcomingTraining({ tenantId, locale, onOpen }: {
  tenantId: string;
  locale: Locale;
  onOpen: () => void;
}) {
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenant.current === requestedTenant;
    setItems([]);
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_learning_context', { p_tenant_id: requestedTenant });
        if (result.error) throw result.error;
        const data = result.data as {
          tenant_id?: string;
          programs?: LearningProgram[];
          enrollments?: LearningEnrollment[];
        } | null;
        if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.programs)
            || !Array.isArray(data.enrollments)) throw new Error('Learning data returned an invalid response.');

        const enrolledSessions = new Set(data.enrollments
          .filter(enrollment => enrollment?.status === 'enrolled' && typeof enrollment.session_id === 'string')
          .map(enrollment => enrollment.session_id as string));
        const now = Date.now();
        const upcoming = data.programs.flatMap(program => {
          if (!program || typeof program.id !== 'string' || typeof program.title !== 'string'
              || !Array.isArray(program.sessions)) return [];
          return program.sessions.flatMap(session => {
            if (!session || typeof session.id !== 'string' || !enrolledSessions.has(session.id)
                || typeof session.start_at !== 'string' || !Number.isFinite(Date.parse(session.start_at))
                || Date.parse(session.start_at) <= now) return [];
            return [{ id: session.id, title: program.title, startAt: session.start_at,
              location: typeof session.location === 'string' ? session.location : null }];
          });
        }).sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt)).slice(0, 3);
        if (current()) setItems(upcoming);
      } catch {
        if (current()) {
          setItems([]);
          setError(tx(locale, 'Unable to load upcoming training. Refresh to try again.'));
        }
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, locale, revision]);

  return <section aria-labelledby="employee-upcoming-training-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#DCEFF4] text-[#085587]">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id="employee-upcoming-training-heading" className="font-semibold text-[#08263D]">{tx(locale, 'Upcoming training')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx(locale, 'Confirmed sessions assigned to you.')}</p>
        </div>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh upcoming training')} onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    {loading && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'Loading your upcoming training…')}</p>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {!loading && !error && (items.length ? <ul className="mt-3 divide-y divide-slate-100">
      {items.map(item => <li key={item.id} data-upcoming-training-session={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#085587]" aria-hidden="true" />
        <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-800">{item.title}</p>
          <p className="mt-1 text-xs text-slate-600">{sessionDate(item.startAt, locale)}{item.location ? ` · ${item.location}` : ''}</p></div>
      </li>)}
    </ul> : !loading && !error ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'No upcoming confirmed training sessions.')}</p> : null)}
    <button type="button" onClick={onOpen} className="mt-3 inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-[#085587] hover:bg-[#EFF7F8]">
      {tx(locale, 'Open My Learning')}
    </button>
  </section>;
}
