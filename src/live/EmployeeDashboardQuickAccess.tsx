import { CalendarDays, ClipboardList, Receipt, UserRound, type LucideIcon } from 'lucide-react';
import { projectText, type Locale } from './project-locale';

type QuickAccessAction = {
  label: string;
  icon: LucideIcon;
  onOpen: () => void;
};

export function EmployeeDashboardQuickAccess({ locale, onOpenAttendance, onOpenLeave, onOpenPayslips, onOpenProfile, onOpenRequests }: {
  locale: Locale;
  onOpenAttendance: () => void;
  onOpenLeave: () => void;
  onOpenPayslips: () => void;
  onOpenProfile: () => void;
  onOpenRequests: () => void;
}) {
  const actions: QuickAccessAction[] = [
    { label: 'Attendance', icon: CalendarDays, onOpen: onOpenAttendance },
    { label: 'Leave', icon: CalendarDays, onOpen: onOpenLeave },
    { label: 'My Payslips', icon: Receipt, onOpen: onOpenPayslips },
    { label: 'My profile', icon: UserRound, onOpen: onOpenProfile },
    { label: 'My Requests', icon: ClipboardList, onOpen: onOpenRequests },
  ];

  return <nav aria-label={projectText(locale, 'Quick access')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="font-semibold text-[#08263D]">{projectText(locale, 'Quick access')}</h3>
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {actions.map(({ label, icon: Icon, onOpen }) => <li key={label} className="min-w-0">
        <button type="button" onClick={onOpen} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-[#085587] hover:bg-[#EFF7F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08558B]">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{projectText(locale, label)}</span>
        </button>
      </li>)}
    </ul>
  </nav>;
}
