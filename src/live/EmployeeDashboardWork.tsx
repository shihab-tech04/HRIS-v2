import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, RefreshCw, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type ProjectTask = {
  task_id: string;
  project_name: string;
  project_code: string;
  title: string;
  due_date: string | null;
  status: string;
  released_at: string | null;
};
type PerformanceGoal = {
  id: string;
  tenant_id: string;
  employee_id: string;
  title: string;
  due_date: string | null;
  status: string;
  current_progress: number;
};
type ActionItem = {
  id: string;
  kind: 'Task' | 'Goal';
  title: string;
  context: string;
  dueDate: string | null;
  status: string;
  overdue: boolean;
  progress?: number;
};

function tx(locale: Locale, value: string) {
  return projectText(locale, value);
}

function dateLabel(value: string | null, locale: Locale) {
  if (!value) return tx(locale, 'No due date');
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return tx(locale, 'Date unavailable');
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(date);
}

function statusLabel(status: string, locale: Locale) {
  if (status === 'in_progress') return tx(locale, 'In progress');
  if (status === 'not_started') return tx(locale, 'Not started');
  if (status === 'completed') return tx(locale, 'Completed');
  if (status === 'cancelled') return tx(locale, 'Cancelled');
  if (status === 'open') return tx(locale, 'Open');
  return status;
}

export function EmployeeDashboardWork({ tenantId, employeeId, dashboardDate, locale, onOpenProjects, onOpenPerformance }: {
  tenantId: string;
  employeeId: string;
  dashboardDate: string;
  locale: Locale;
  onOpenProjects: () => void;
  onOpenPerformance: () => void;
}) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;

  useEffect(() => {
    const request = ++sequence.current;
    const requestedTenant = tenantId;
    const isCurrent = () => request === sequence.current && activeTenant.current === requestedTenant;
    setItems([]);
    setError('');
    setLoading(true);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dashboardDate)) {
      setLoading(false);
      return () => { sequence.current += 1; };
    }

    void (async () => {
      try {
        const [taskResult, goalResult] = await Promise.all([
          supabase.rpc('hris_get_my_project_tasks', { p_tenant_id: requestedTenant }),
          supabase.from('performance_goals')
            .select('id,tenant_id,employee_id,title,due_date,status,current_progress')
            .eq('tenant_id', requestedTenant)
            .eq('employee_id', employeeId)
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(100),
        ]);
        if (!isCurrent()) return;
        if (taskResult.error) throw taskResult.error;
        if (goalResult.error) throw goalResult.error;
        const taskRows = (taskResult.data as { tasks?: unknown } | null)?.tasks;
        if (!Array.isArray(taskRows) || !Array.isArray(goalResult.data)) {
          throw new Error('Assigned work returned an invalid response.');
        }
        const tasks = taskRows.filter((value): value is ProjectTask => {
          if (!value || typeof value !== 'object') return false;
          const task = value as Partial<ProjectTask>;
          return typeof task.task_id === 'string' && typeof task.title === 'string'
            && typeof task.status === 'string' && (task.due_date === null || typeof task.due_date === 'string');
        });
        const goals = goalResult.data.filter((value): value is PerformanceGoal => {
          if (!value || typeof value !== 'object') return false;
          const goal = value as Partial<PerformanceGoal>;
          return goal.tenant_id === requestedTenant && goal.employee_id === employeeId
            && typeof goal.id === 'string' && typeof goal.title === 'string'
            && typeof goal.status === 'string' && (goal.due_date === null || typeof goal.due_date === 'string');
        });
        const taskItems: ActionItem[] = tasks.map(task => ({
          id: `task:${task.task_id}`, kind: 'Task', title: task.title,
          context: [task.project_code, task.project_name].filter(Boolean).join(' · '),
          dueDate: task.due_date, status: task.status,
          overdue: Boolean(task.due_date && task.due_date < dashboardDate
            && task.status !== 'completed' && !task.released_at),
        }));
        const goalItems: ActionItem[] = goals.map(goal => ({
          id: `goal:${goal.id}`, kind: 'Goal', title: goal.title, context: '',
          dueDate: goal.due_date, status: goal.status,
          overdue: Boolean(goal.due_date && goal.due_date < dashboardDate
            && goal.status !== 'completed' && goal.status !== 'cancelled'),
          progress: Number.isFinite(Number(goal.current_progress)) ? Number(goal.current_progress) : undefined,
        }));
        const nextItems = [...taskItems, ...goalItems].sort((left, right) => {
          if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
          if (!left.dueDate) return right.dueDate ? 1 : 0;
          if (!right.dueDate) return -1;
          return left.dueDate.localeCompare(right.dueDate);
        });
        if (isCurrent()) setItems(nextItems.slice(0, 4));
      } catch {
        if (isCurrent()) {
          setItems([]);
          setError(tx(locale, 'Unable to load your assigned work. Refresh to try again.'));
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, employeeId, dashboardDate, locale, revision]);

  return <section aria-labelledby="employee-dashboard-work-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E7F1F3] text-[#085587]">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id="employee-dashboard-work-heading" className="font-semibold text-[#08263D]">{tx(locale, 'My tasks and goals')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx(locale, 'Assigned work and deadlines from your organization.')}</p>
        </div>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh assigned work')} onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    {loading && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'Loading assigned work…')}</p>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{error}</p></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {!loading && !error && (items.length ? <ul className="mt-3 divide-y divide-slate-100">
      {items.map(item => <li key={item.id} data-employee-dashboard-work={item.kind.toLowerCase()} data-overdue={item.overdue ? 'true' : 'false'} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
        <span className="mt-0.5 shrink-0 text-[#085587]" aria-hidden="true">{item.kind === 'Goal' ? <Target className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="break-words text-sm font-medium text-slate-800">{item.title}</p>
            {item.overdue && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">{tx(locale, 'Overdue')}</span>}
          </div>
          {item.context && <p className="mt-1 break-words text-xs text-slate-500">{item.context}</p>}
          <p className="mt-1 text-xs text-slate-600">{tx(locale, item.kind)} · {tx(locale, 'Due:')} {dateLabel(item.dueDate, locale)} · {statusLabel(item.status, locale)}{item.progress !== undefined && item.status !== 'completed' ? ` · ${item.progress}%` : ''}</p>
        </div>
      </li>)}
    </ul> : !loading && !error ? <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'No assigned tasks or goals are available.')}</p> : null)}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={onOpenProjects} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-[#085587] hover:bg-[#EFF7F8]">{tx(locale, 'Open My Projects')}</button>
      <button type="button" onClick={onOpenPerformance} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-[#085587] hover:bg-[#EFF7F8]">{tx(locale, 'View my goals')}</button>
    </div>
  </section>;
}
