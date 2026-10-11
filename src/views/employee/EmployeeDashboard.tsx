import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Clock,
  Briefcase,
  Calendar,
  Building,
  UserCheck,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface EmployeeDashboardProps {
  onNavigateTab: (tabId: string) => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ onNavigateTab }) => {
  const { currentEmployee, currentTenant, leaveCategories, leaveRequests } = useHRIS();
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);

  const handleToggleCheckIn = () => {
    if (!isCheckedIn) {
      setIsCheckedIn(true);
      setCheckInTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      setIsCheckedIn(false);
      setCheckInTime(null);
    }
  };

  const pendingLeaves = leaveRequests.filter(
    (l) => l.employeeId === currentEmployee.id && l.status === 'pending'
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Employee Identity Hero Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold font-mono shrink-0 shadow-xs">
              {currentEmployee.firstName[0]}
              {currentEmployee.lastName[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  {currentEmployee.firstName} {currentEmployee.lastName}
                </h1>
                <span className="text-xs text-slate-400">·</span>
                <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {currentEmployee.employeeCode}
                </span>
                <Badge status={currentEmployee.employmentStatus === 'active' ? 'active' : 'critical'}>
                  {currentEmployee.employmentStatus.toUpperCase()}
                </Badge>
              </div>

              <p className="text-xs text-slate-600 mt-1 font-medium">
                {currentEmployee.jobTitle}
                <span className="text-slate-400 mx-1.5">/</span>
                {currentEmployee.departmentName}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {currentEmployee.location}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  Reports to: <strong className="text-slate-700 font-medium">{currentEmployee.primaryManagerName}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Attendance Check-in Widget */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-slate-500 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-medium tracking-wider">
                  Today's Attendance
                </span>
                <span className="text-xs font-semibold text-slate-900 font-mono">
                  {isCheckedIn ? `Active since ${checkInTime}` : 'Not Checked In'}
                </span>
              </div>
            </div>
            <Button
              variant={isCheckedIn ? 'outline' : 'primary'}
              size="sm"
              onClick={handleToggleCheckIn}
            >
              {isCheckedIn ? 'Punch Out' : 'Web Check-In'}
            </Button>
          </div>
        </div>
      </div>

      {/* Grid: Matrix Allocations & Leave Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Multi-Project Allocations */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card
            title="My Matrix Project Allocations"
            subtitle="Demonstrating Dual Reporting: Distinct from your Departmental Manager"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateTab('employee_projects')}
                icon={<ArrowUpRight className="w-3.5 h-3.5" />}
              >
                View Timesheets
              </Button>
            }
          >
            {currentEmployee.projectAllocations.length === 0 ? (
              <p className="text-xs text-slate-500">Currently not assigned to any client projects.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {currentEmployee.projectAllocations.map((alloc) => (
                  <div key={alloc.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {alloc.projectName}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          {alloc.projectCode}
                        </span>
                        <Badge status={alloc.status === 'active' ? 'active' : 'neutral'}>
                          {alloc.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span>Role: <strong className="text-slate-700">{alloc.roleOnProject}</strong></span>
                        <span>·</span>
                        <span>Project Lead: <strong className="text-slate-700">{alloc.projectLeadName}</strong></span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                        {alloc.allocationPercentage}%
                      </span>
                      <span className="block text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        FTE Share
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Notice: Safe Harbor Principle */}
          <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-lg flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <strong>Employee-First Architecture:</strong> Your employment contract is anchored to the tenant organization (
              <strong>{currentTenant.name}</strong>). Releases from individual project allocations do not affect your active employment status.
            </div>
          </div>
        </div>

        {/* Right 1 Col: Leave Balances & Upcoming Time Off */}
        <div className="flex flex-col gap-4">
          <Card
            title="Leave & Time Off Balances"
            subtitle={`Governed by ${currentTenant.name} policies`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateTab('employee_time_leave')}
              >
                Apply
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              {leaveCategories.slice(0, 3).map((cat) => (
                <div
                  key={cat.id}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-medium text-slate-900 block">{cat.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Accrues {cat.accrualCadence} · Limit: {cat.carryForwardLimitDays}d
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-slate-900 font-mono tabular-nums">
                      {cat.annualQuotaDays}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase">Days / Yr</span>
                  </div>
                </div>
              ))}
            </div>

            {pendingLeaves.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-700 block mb-2">
                  Pending Applications ({pendingLeaves.length})
                </span>
                {pendingLeaves.map((pl) => (
                  <div key={pl.id} className="text-xs text-slate-600 flex items-center justify-between py-1">
                    <span>{pl.leaveCategoryName} ({pl.daysCount}d)</span>
                    <Badge status="warning">Awaiting Approval</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
