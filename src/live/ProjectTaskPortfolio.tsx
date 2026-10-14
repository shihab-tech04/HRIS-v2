import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ClipboardList, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type PortfolioTask = {
  task_id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'completed';
  completed_at: string | null;
  feedback_pending: number;
  members: Array<{ employee_id: string; employee_name: string }>;
};
type PortfolioProject = {
  project_id: string;
  project_code: string;
  project_name: string;
  project_status: string;
  tasks: PortfolioTask[];
};
type Portfolio = {
  projects: PortfolioProject[];
  counts: { tasks: number; open: number; in_progress: number; completed: number; feedback_pending: number };
};
type StatusFilter = 'all' | PortfolioTask['status'] | 'feedback_pending';

const taskStatusLabels: Record<PortfolioTask['status'], string> = {
  open: 'Open', in_progress: 'In progress', completed: 'Completed',
};

function errorMessage(cause: unknown) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return 'Unable to load the task portfolio.';
}

export function ProjectTaskPortfolio({ tenantId, locale, onOpenProject }: {
  tenantId: string;
  locale: Locale;
  onOpenProject: (projectId: string) => void;
}) {
  const tx = (english: string) => projectText(locale, english);
  const [portfolio, setPortfolio] = useState<Portfolio>({
    projects: [], counts: { tasks: 0, open: 0, in_progress: 0, completed: 0, feedback_pending: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const requestSequence = useRef(0);

  useEffect(() => {
    setSearch('');
    setStatus('all');
  }, [tenantId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setPortfolio({ projects: [], counts: { tasks: 0, open: 0, in_progress: 0, completed: 0, feedback_pending: 0 } });
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_my_project_task_portfolio', { p_tenant_id: tenantId });
        if (requestId !== requestSequence.current) return;
        if (rpcError) throw rpcError;
        const value = data as Portfolio | null;
        if (!value || !Array.isArray(value.projects) || !value.counts || typeof value.counts.tasks !== 'number') {
          throw new Error('Task portfolio returned an invalid response.');
        }
        setPortfolio(value);
      } catch (cause) {
        if (requestId === requestSequence.current) setError(errorMessage(cause));
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return portfolio.projects.map(project => ({
      ...project,
      tasks: project.tasks.filter(task => {
        if (status === 'feedback_pending' && task.feedback_pending === 0) return false;
        if (status !== 'all' && status !== 'feedback_pending' && task.status !== status) return false;
        return !query || [project.project_name, project.project_code, task.title, task.description,
          ...task.members.map(member => member.employee_name)]
          .some(value => value.toLocaleLowerCase().includes(query));
      }),
    })).filter(project => project.tasks.length > 0);
  }, [portfolio.projects, search, status]);

  return <div className="space-y-4" aria-labelledby="project-task-portfolio-heading">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 id="project-task-portfolio-heading" className="text-xl font-semibold text-[#08263D]">{tx('Task portfolio')}</h3>
        <p className="mt-1 text-sm text-slate-600">{tx('Tasks across projects you manage. Reviews stay separately tracked as Feedback Pending.')}</p>
      </div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {tx('Refresh')}
      </button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={tx('Task portfolio totals')}>
      {[
        [tx('Tasks'), portfolio.counts.tasks], [tx('Open'), portfolio.counts.open],
        [tx('In progress'), portfolio.counts.in_progress], [tx('Completed'), portfolio.counts.completed],
        [tx('Reviews pending'), portfolio.counts.feedback_pending],
      ].map(([label, count]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{Number(count).toLocaleString()}</p>
      </article>)}
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="project-task-portfolio-search" className="mb-1 block text-xs font-medium text-slate-600">{tx('Search tasks')}</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input id="project-task-portfolio-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder={tx('Task, project, or member')} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" />
        </div>
      </div>
      <div className="w-full sm:w-56">
        <label htmlFor="project-task-portfolio-status" className="mb-1 block text-xs font-medium text-slate-600">{tx('Task status')}</label>
        <select id="project-task-portfolio-status" value={status} onChange={event => setStatus(event.target.value as StatusFilter)}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="all">{tx('All tasks')}</option><option value="open">{tx('Open')}</option><option value="in_progress">{tx('In progress')}</option>
          <option value="completed">{tx('Completed')}</option><option value="feedback_pending">{tx('Feedback pending')}</option>
        </select>
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">{visibleProjects.reduce((sum, project) => sum + project.tasks.length, 0).toLocaleString()} shown</p>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button>
    </div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading your task portfolio…')}</p>
      : visibleProjects.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        {portfolio.counts.tasks ? tx('No tasks match these filters.') : tx('You have no tasks across your managed projects yet.')}
      </p> : <div className="space-y-4">{visibleProjects.map(project => <section key={project.project_id} aria-label={`${project.project_code} ${project.project_name}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4">
          <div className="flex min-w-0 items-start gap-3"><ClipboardList className="mt-1 h-5 w-5 shrink-0 text-[#08558B]" aria-hidden="true" />
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{project.project_code} · {project.project_status.replaceAll('_', ' ')}</p>
              <h4 className="break-words font-semibold text-slate-900">{project.project_name}</h4>
            </div>
          </div>
          <button type="button" onClick={() => onOpenProject(project.project_id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:border-[#085587] focus-visible:outline-2 focus-visible:outline-[#085587]">
            {tx('Open project tasks')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="divide-y divide-slate-100">{project.tasks.map(task => <li key={task.task_id} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h5 className="break-words font-medium text-slate-900">{task.title}</h5>
              {task.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{task.description}</p>}
              <p className="mt-2 text-xs text-slate-500">{tx('Members:')} {task.members.length ? task.members.map(member => member.employee_name).join(', ') : tx('None assigned')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{tx(taskStatusLabels[task.status])}</span>
              {task.due_date && <span className="text-xs text-slate-500">{tx('Due')} {task.due_date}</span>}
              {task.feedback_pending > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">{tx('Feedback Pending')} · {task.feedback_pending} {tx('reviews')}</span>}
            </div>
          </div>
        </li>)}</ul>
      </section>)}</div>}
  </div>;
}
