import { useState } from 'react';
import { LiveHrisWorkspace } from '../live/LiveHrisWorkspace';

const tenantId = '00000000-0000-4000-8000-000000000001';
const managerPermissions = {
  dashboard: true, attendance: true, attendanceView: true, attendanceManage: true,
  attendanceReport: true, leave: true, leaveManage: true, organization: true,
  organizationManage: false, employees: true, employeesManage: false,
  performance: true, recruitment: false, recruitmentManage: false,
  referrals: false, referralsManage: false, holidayManage: false,
  learningManage: false, travel: false, travelView: false, travelManage: false,
  expenses: false, expensesView: false, expensesManage: false,
  payroll: false, payrollManage: false, selfServiceManage: false,
};

export function FrontendReviewApp() {
  const [role, setRole] = useState<'manager' | 'employee'>('manager');
  const isEmployee = role === 'employee';
  const permissions = isEmployee
    ? { ...managerPermissions, dashboard: false, attendance: false, attendanceView: false,
        attendanceManage: false, attendanceReport: false, leave: false,
        leaveManage: false, organization: false, employees: false, performance: false }
    : managerPermissions;
  return <div data-frontend-review="offline" className="min-h-screen bg-[#F5F8FA]">
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-sm">
      <span className="font-medium text-[#085587]">HRIS frontend review — offline; production records and actions disabled</span>
      <div className="flex items-center gap-2" role="group" aria-label="Review role">
        <button type="button" onClick={() => setRole('manager')} aria-pressed={!isEmployee}
          className="rounded-md border border-slate-300 px-3 py-1 aria-pressed:bg-[#085587] aria-pressed:text-white">Manager view</button>
        <button type="button" onClick={() => setRole('employee')} aria-pressed={isEmployee}
          className="rounded-md border border-slate-300 px-3 py-1 aria-pressed:bg-[#085587] aria-pressed:text-white">Employee view</button>
      </div>
    </div>
    <LiveHrisWorkspace key={role} userId="00000000-0000-4000-8000-000000000002"
      userEmail="review@example.invalid" tenantId={tenantId}
      tenantName="Synesis Design Review" tenants={[{ id: tenantId, name: 'Synesis Design Review', slug: 'review' }]}
      onTenantChange={() => {}} onSignOut={() => {}}
      isSuperAdmin={false} isEmployee={isEmployee} tenantRole={role} permissions={permissions} />
  </div>;
}
