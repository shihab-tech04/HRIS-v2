import React from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { Employee, LeaveRequest } from '../../types';
import { Users, CheckCircle, XCircle, ArrowRight, ShieldAlert } from 'lucide-react';

export const MyTeamView: React.FC = () => {
  const {
    currentEmployee,
    employees,
    leaveRequests,
    updateLeaveRequestStatus,
  } = useHRIS();

  // Find employees reporting to current employee (either org manager or project lead)
  const directReports = employees.filter(
    (e) => e.primaryManagerId === currentEmployee.id
  );

  // Find project supervisees (members allocated to projects led by current employee)
  const projectSupervisees = employees.filter((e) =>
    e.projectAllocations.some((a) => a.projectLeadId === currentEmployee.id)
  );

  // Combined team members without duplicates
  const allTeamMembers = Array.from(
    new Map([...directReports, ...projectSupervisees].map((e) => [e.id, e])).values()
  );

  // Pending leaves awaiting approval from current employee
  const pendingApprovals = leaveRequests.filter(
    (l) => l.approverId === currentEmployee.id && l.status === 'pending'
  );

  const teamColumns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Team Member',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs font-mono shrink-0">
            {r.firstName[0]}{r.lastName[0]}
          </div>
          <div>
            <span className="font-semibold text-slate-900 block">{r.firstName} {r.lastName}</span>
            <span className="text-[11px] text-slate-500 font-mono">{r.employeeCode}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'jobTitle',
      header: 'Role & Department',
      render: (r) => (
        <div>
          <span className="text-slate-800 font-medium block">{r.jobTitle}</span>
          <span className="text-[11px] text-slate-500">{r.departmentName}</span>
        </div>
      ),
    },
    {
      key: 'allocations',
      header: 'Project Allocations',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          {r.projectAllocations.length === 0 ? (
            <span className="text-slate-400 text-xs">No active project</span>
          ) : (
            r.projectAllocations.map((a) => (
              <span key={a.id} className="text-[11px] text-slate-600 font-mono">
                {a.projectCode}: {a.allocationPercentage}% ({a.status})
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Reporting Relationship',
      render: (r) => {
        const isOrg = r.primaryManagerId === currentEmployee.id;
        const isProj = r.projectAllocations.some((a) => a.projectLeadId === currentEmployee.id);
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {isOrg && (
              <span className="text-[11px] text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Direct Org Report
              </span>
            )}
            {isProj && (
              <span className="text-[11px] text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                Project Supervisee
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'employmentStatus',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <Badge status={r.employmentStatus === 'active' ? 'active' : 'critical'}>
          {r.employmentStatus}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Team & Supervisee Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dual-Scope View: Members who report to you in organizational hierarchy or are allocated to projects you lead.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200">
            <Users className="w-4 h-4 text-slate-500" />
            <span>{allTeamMembers.length} Staff Under Supervision</span>
          </div>
        </div>
      </div>

      {/* Pending Approvals Queue */}
      {pendingApprovals.length > 0 && (
        <Card
          title={`Action Required: Pending Leave Requests (${pendingApprovals.length})`}
          subtitle="Requests submitted by your team members awaiting your sign-off"
        >
          <div className="flex flex-col divide-y divide-slate-100">
            {pendingApprovals.map((req) => (
              <div key={req.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900">
                      {req.employeeName}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-700">{req.leaveCategoryName}</span>
                    <span className="text-xs font-mono text-slate-500 font-medium">({req.daysCount} days)</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Dates: <strong className="text-slate-700">{req.startDate} to {req.endDate}</strong> — Note: "{req.reason}"
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateLeaveRequestStatus(req.id, 'rejected')}
                    icon={<XCircle className="w-3.5 h-3.5 text-red-600" />}
                  >
                    Decline
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => updateLeaveRequestStatus(req.id, 'approved')}
                    icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Team Roster Table */}
      <Card
        title="Direct Reports & Project Supervisees"
        subtitle="Roster showing reporting lines and current allocations"
        noPadding
      >
        <Table
          columns={teamColumns}
          data={allTeamMembers}
          keyExtractor={(r) => r.id}
          emptyMessage="You do not currently have any direct reports or allocated project supervisees."
        />
      </Card>
    </div>
  );
};
