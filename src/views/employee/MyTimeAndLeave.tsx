import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, Column } from '../../components/ui/Table';
import { LeaveRequest } from '../../types';
import { Calendar, Plus, Check, Clock } from 'lucide-react';

export const MyTimeAndLeave: React.FC = () => {
  const {
    currentEmployee,
    currentTenant,
    leaveCategories,
    leaveRequests,
    submitLeaveRequest,
  } = useHRIS();

  const [selectedCategoryId, setSelectedCategoryId] = useState(
    leaveCategories[0]?.id || ''
  );
  const [startDate, setStartDate] = useState('2026-11-23');
  const [endDate, setEndDate] = useState('2026-11-25');
  const [reason, setReason] = useState('');
  const [daysCount, setDaysCount] = useState('3');

  const myLeaves = leaveRequests.filter(
    (l) => l.employeeId === currentEmployee.id
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    const cat = leaveCategories.find((c) => c.id === selectedCategoryId);
    if (!cat) return;

    submitLeaveRequest({
      employeeId: currentEmployee.id,
      employeeName: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
      leaveCategoryId: cat.id,
      leaveCategoryName: cat.name,
      startDate,
      endDate,
      daysCount: parseFloat(daysCount) || 1,
      reason,
      approverId: currentEmployee.primaryManagerId,
      approverName: currentEmployee.primaryManagerName,
    });

    setReason('');
  };

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'dates',
      header: 'Dates Requested',
      width: '200px',
      render: (r) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800">
            {r.startDate} <span className="text-slate-400">→</span> {r.endDate}
          </span>
          <span className="block text-[11px] text-slate-500 font-mono">
            {r.daysCount} working days
          </span>
        </div>
      ),
    },
    {
      key: 'leaveCategoryName',
      header: 'Leave Category',
      render: (r) => (
        <span className="font-medium text-slate-900">{r.leaveCategoryName}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <span className="text-slate-600 truncate max-w-xs block">{r.reason}</span>,
    },
    {
      key: 'approverName',
      header: 'Designated Approver',
      render: (r) => (
        <span className="text-xs text-slate-600">{r.approverName || 'Department Head'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Review Status',
      width: '120px',
      render: (r) => {
        const statusMap: Record<string, 'active' | 'warning' | 'critical' | 'neutral'> = {
          approved: 'active',
          pending: 'warning',
          rejected: 'critical',
          cancelled: 'neutral',
        };
        return <Badge status={statusMap[r.status] || 'neutral'}>{r.status.toUpperCase()}</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Leave Entitlement Quotas Grid */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
          Configurable Leave Quotas — {currentTenant.name}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {leaveCategories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {cat.code}
                </span>
                <h4 className="text-sm font-semibold text-slate-900 mt-2">{cat.name}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {cat.isPaid ? 'Paid' : 'Unpaid'} · {cat.accrualCadence} accrual
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">Yearly Quota</span>
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {cat.annualQuotaDays} <span className="text-xs font-normal text-slate-500">days</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leave Application & History Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          title="Apply for Leave / Time Off"
          subtitle="Submitted requests route to your Organizational Manager"
          className="lg:col-span-1"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select
              label="Leave Category"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              options={leaveCategories.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.annualQuotaDays} days/yr)`,
              }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <Input
              label="Total Working Days"
              type="number"
              min="0.5"
              step="0.5"
              value={daysCount}
              onChange={(e) => setDaysCount(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label htmlFor="leave-reason-input" className="text-xs font-medium text-slate-700">
                Reason / Note for Approver
              </label>
              <textarea
                id="leave-reason-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for absence or vacation details..."
                className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2.5 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={!reason.trim()}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Submit Application
            </Button>
          </form>
        </Card>

        {/* History Ledger */}
        <div className="lg:col-span-2">
          <Card
            title="My Leave History & Approvals"
            subtitle="Application audit trail and decision timestamps"
            noPadding
          >
            <Table
              columns={columns}
              data={myLeaves}
              keyExtractor={(r) => r.id}
              emptyMessage="No leave requests filed yet."
            />
          </Card>
        </div>
      </div>
    </div>
  );
};
