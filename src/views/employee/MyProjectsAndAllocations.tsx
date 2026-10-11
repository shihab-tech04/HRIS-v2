import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, Column } from '../../components/ui/Table';
import {
  FolderGit2,
  Clock,
  Send,
  CheckCircle,
  HelpCircle,
  Info,
} from 'lucide-react';

interface TimesheetLog {
  id: string;
  projectCode: string;
  projectName: string;
  date: string;
  hours: number;
  taskDescription: string;
  approverName: string;
  status: 'submitted' | 'approved';
}

export const MyProjectsAndAllocations: React.FC = () => {
  const { currentEmployee, recordAuditLog } = useHRIS();

  // Initial mock timesheets for active projects
  const [timesheets, setTimesheets] = useState<TimesheetLog[]>([
    {
      id: 'ts-1',
      projectCode: 'PRJ-TITAN',
      projectName: 'Titan Core NextGen Platform',
      date: '2026-10-09',
      hours: 7.5,
      taskDescription: 'Refactored microservice auth boundary & tenant JWT hydration filter.',
      approverName: 'Elena Rostova (Lead)',
      status: 'approved',
    },
    {
      id: 'ts-2',
      projectCode: 'PRJ-CHRONOS',
      projectName: 'Chronos Real-Time Telemetry',
      date: '2026-10-10',
      hours: 4.0,
      taskDescription: 'Optimized PostgreSQL connection pool settings for multi-tenant partition routes.',
      approverName: 'David Chen (Lead)',
      status: 'submitted',
    },
  ]);

  // Timesheet Entry Form State
  const [selectedProjectId, setSelectedProjectId] = useState(
    currentEmployee.projectAllocations[0]?.projectId || ''
  );
  const [hours, setHours] = useState('4.0');
  const [date, setDate] = useState('2026-10-11');
  const [taskDescription, setTaskDescription] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);

  const activeAllocations = currentEmployee.projectAllocations.filter(
    (a) => a.status === 'active'
  );

  const handleLogTimesheet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDescription.trim() || !selectedProjectId) return;

    const alloc = currentEmployee.projectAllocations.find(
      (a) => a.projectId === selectedProjectId
    );
    if (!alloc) return;

    const newEntry: TimesheetLog = {
      id: `ts-${Date.now()}`,
      projectCode: alloc.projectCode,
      projectName: alloc.projectName,
      date,
      hours: parseFloat(hours),
      taskDescription,
      approverName: alloc.projectLeadName,
      status: 'submitted',
    };

    setTimesheets((prev) => [newEntry, ...prev]);
    recordAuditLog(
      'TIMESHEET_SUBMIT',
      'timesheet_entries',
      newEntry.id,
      `Submitted ${hours}h on ${alloc.projectName} for lead ${alloc.projectLeadName} review.`
    );

    setTaskDescription('');
    setFormSuccess(true);
    setTimeout(() => setFormSuccess(false), 3000);
  };

  const columns: Column<TimesheetLog>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '120px',
      render: (r) => <span className="font-mono text-slate-700">{r.date}</span>,
    },
    {
      key: 'project',
      header: 'Project Code',
      width: '180px',
      render: (r) => (
        <div>
          <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
            {r.projectCode}
          </span>
          <span className="block text-[11px] text-slate-500 truncate mt-0.5">{r.projectName}</span>
        </div>
      ),
    },
    {
      key: 'taskDescription',
      header: 'Task Activity',
      render: (r) => <span className="text-slate-800 line-clamp-2">{r.taskDescription}</span>,
    },
    {
      key: 'hours',
      header: 'Hours',
      isNumeric: true,
      width: '90px',
      render: (r) => <span className="font-bold">{r.hours.toFixed(1)}h</span>,
    },
    {
      key: 'approverName',
      header: 'Project Reviewer',
      width: '160px',
      render: (r) => <span className="text-slate-600 text-[11px]">{r.approverName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (r) => (
        <Badge status={r.status === 'approved' ? 'active' : 'warning'}>
          {r.status === 'approved' ? 'Approved' : 'Submitted'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Educational Callout explaining the Matrix Reporting Rule */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Dual Reporting Matrix Architecture
            </h2>
            <p>
              In Synesis HRIS, <strong>Organizational reporting</strong> and <strong>Project-specific reporting</strong> are intentionally decoupled:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  1. Organizational Line Manager
                </span>
                <span className="text-xs font-semibold text-slate-900 block mt-0.5">
                  {currentEmployee.primaryManagerName}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  Responsible for career development, salary reviews, promotions, and organizational leaves.
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  2. Project-Specific Leads
                </span>
                <span className="text-xs font-semibold text-slate-900 block mt-0.5">
                  {activeAllocations.map((a) => a.projectLeadName).join(', ') || 'None assigned'}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  Responsible for day-to-day deliverables, sprint milestones, and project timesheet sign-offs.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Project Allocations Cards */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
          Active Multi-Project Assignments ({activeAllocations.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeAllocations.map((alloc) => (
            <Card key={alloc.id} className="border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                    {alloc.projectCode}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-900 mt-1 truncate">
                    {alloc.projectName}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Role: <strong className="text-slate-700 font-medium">{alloc.roleOnProject}</strong>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-slate-900 font-mono tabular-nums">
                    {alloc.allocationPercentage}%
                  </span>
                  <span className="block text-[10px] text-slate-400 uppercase">FTE Allocation</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>Project Lead: <strong className="text-slate-800">{alloc.projectLeadName}</strong></span>
                <span className="font-mono text-[11px] text-slate-400">Assigned: {alloc.assignedDate}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Log Timesheet Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          title="Submit Project Timesheet Entry"
          subtitle="Hours are routed to the assigned Project Lead"
          className="lg:col-span-1"
        >
          <form onSubmit={handleLogTimesheet} className="flex flex-col gap-4">
            <Select
              label="Assigned Project"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              options={activeAllocations.map((a) => ({
                value: a.projectId,
                label: `${a.projectCode} — ${a.projectName}`,
              }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                label="Hours"
                type="number"
                step="0.5"
                min="0.5"
                max="16"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-description-input" className="text-xs font-medium text-slate-700">
                Task Activity & Accomplishments
              </label>
              <textarea
                id="task-description-input"
                rows={3}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe key deliverable, code commit, or milestone work..."
                className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2.5 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none"
              />
            </div>

            {formSuccess && (
              <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Timesheet logged and queued for project lead signoff.
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={!taskDescription.trim() || activeAllocations.length === 0}
              icon={<Send className="w-3.5 h-3.5" />}
            >
              Submit for Lead Review
            </Button>
          </form>
        </Card>

        {/* Timesheet Log Table */}
        <div className="lg:col-span-2">
          <Card
            title="Timesheet Submission Ledger"
            subtitle="Recent weekly logs with project review status"
            noPadding
          >
            <Table
              columns={columns}
              data={timesheets}
              keyExtractor={(r) => r.id}
              emptyMessage="No timesheet entries recorded this week."
            />
          </Card>
        </div>
      </div>
    </div>
  );
};
