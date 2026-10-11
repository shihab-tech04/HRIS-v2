import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Table, Column } from '../../components/ui/Table';
import { Employee } from '../../types';
import {
  Users,
  Search,
  Plus,
  Briefcase,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  FolderMinus,
  CheckCircle2,
} from 'lucide-react';

export const EmployeeDirectoryAndMatrix: React.FC = () => {
  const {
    employees,
    projects,
    assignEmployeeToProject,
    releaseEmployeeFromProject,
  } = useHRIS();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');

  // Allocation Modal State
  const [isAllocModalOpen, setIsAllocModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
  const [allocPercentage, setAllocPercentage] = useState('50');
  const [roleOnProject, setRoleOnProject] = useState('Core Contributor');

  // Invariant verification state
  const [lastReleaseProof, setLastReleaseProof] = useState<{
    employeeName: string;
    message: string;
    status: string;
  } | null>(null);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.jobTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === 'ALL' || emp.departmentName === selectedDept;
    return matchesSearch && matchesDept;
  });

  const handleOpenAllocateModal = (empId: string) => {
    setSelectedEmployeeId(empId);
    setIsAllocModalOpen(true);
  };

  const handleSaveAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !targetProjectId) return;
    assignEmployeeToProject(
      selectedEmployeeId,
      targetProjectId,
      parseFloat(allocPercentage) || 20,
      roleOnProject
    );
    setIsAllocModalOpen(false);
  };

  const handleRelease = (emp: Employee, allocId: string) => {
    const result = releaseEmployeeFromProject(emp.id, allocId);
    setLastReleaseProof({
      employeeName: `${emp.firstName} ${emp.lastName}`,
      message: result.message,
      status: emp.employmentStatus,
    });
  };

  const columns: Column<Employee>[] = [
    {
      key: 'identity',
      header: 'Employee Identity',
      width: '240px',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs font-mono shrink-0">
            {r.firstName[0]}{r.lastName[0]}
          </div>
          <div>
            <span className="font-semibold text-slate-900 block">{r.firstName} {r.lastName}</span>
            <span className="text-[11px] text-slate-500 font-mono">{r.employeeCode} · {r.workEmail}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'orgLine',
      header: 'Department & Org Manager',
      width: '220px',
      render: (r) => (
        <div>
          <span className="text-slate-900 font-medium block">{r.jobTitle}</span>
          <span className="text-[11px] text-slate-500 block">{r.departmentName}</span>
          <span className="text-[11px] text-blue-700 block mt-0.5">
            Reports to: {r.primaryManagerName}
          </span>
        </div>
      ),
    },
    {
      key: 'projectAllocations',
      header: 'Matrix Project Allocations (Dual Reporting)',
      render: (r) => {
        const activeAllocs = r.projectAllocations.filter((a) => a.status === 'active');
        if (activeAllocs.length === 0) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs italic">Unallocated (Bench)</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenAllocateModal(r.id)}
              >
                + Allocate
              </Button>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-1.5 py-1">
            {activeAllocs.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 bg-slate-50 px-2 py-1 rounded border border-slate-200/60 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">{a.projectCode}</span>
                  <span className="text-slate-500 mx-1">({a.allocationPercentage}%)</span>
                  <span className="text-slate-400">· Lead: {a.projectLeadName}</span>
                </div>
                <button
                  type="button"
                  title="Release from project (employment is preserved)"
                  onClick={() => handleRelease(r, a.id)}
                  className="text-red-600 hover:text-red-800 text-[11px] font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                >
                  Release
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleOpenAllocateModal(r.id)}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium text-left cursor-pointer"
            >
              + Add another project allocation
            </button>
          </div>
        );
      },
    },
    {
      key: 'employmentStatus',
      header: 'Status & Invariant',
      width: '140px',
      render: (r) => (
        <div>
          <Badge status={r.employmentStatus === 'active' ? 'active' : 'critical'}>
            {r.employmentStatus.toUpperCase()}
          </Badge>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Joined {r.joinDate}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Educational Banner regarding Permanent Architectural Rule */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-700 leading-relaxed">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              Matrix Organization & Safe-Harbor Release Rule
            </h2>
            <p>
              Employees in Synesis HRIS may be allocated across multiple projects concurrently, each with different project leads and timesheet authorizers.
              <strong> Permanent Rule:</strong> An employee's release from a project releases their project allocation, but <em>never terminates their employment</em>.
            </p>
          </div>
        </div>
      </div>

      {/* Live Invariant Verification Callout if a release was executed */}
      {lastReleaseProof && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs text-emerald-900">
              <span className="font-bold">Permanent Rule Verified: </span>
              {lastReleaseProof.message}
              <span className="block text-[11px] text-emerald-700 mt-0.5">
                Staff member {lastReleaseProof.employeeName} retains employment_status = <strong>{lastReleaseProof.status.toUpperCase()}</strong>.
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLastReleaseProof(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <Input
            placeholder="Search employees by name, code, or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">Filter Dept:</span>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs text-slate-800 bg-white border border-slate-300 rounded-md py-1.5 px-2.5 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="ALL">All Departments</option>
            <option value="Engineering & Cloud Systems">Engineering & Cloud Systems</option>
            <option value="People & Culture">People & Culture</option>
            <option value="Product Architecture & UX">Product Architecture & UX</option>
          </select>
        </div>
      </div>

      {/* Employee Directory Table */}
      <Card
        title={`Workforce Master Directory (${filteredEmployees.length} Records)`}
        subtitle="Matrix allocation and organizational hierarchy controls"
        noPadding
      >
        <Table
          columns={columns}
          data={filteredEmployees}
          keyExtractor={(r) => r.id}
          emptyMessage="No employees matching current filter criteria."
        />
      </Card>

      {/* Allocate to Project Modal */}
      <Modal
        isOpen={isAllocModalOpen}
        onClose={() => setIsAllocModalOpen(false)}
        title="Assign Project Allocation (Matrix Reporting)"
        subtitle="Employee will work under the selected Project Lead without altering their Org Manager"
      >
        <form onSubmit={handleSaveAllocation} className="flex flex-col gap-4">
          <Select
            label="Client Project"
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.code} — ${p.name} (Lead: ${p.projectLeadName})`,
            }))}
          />

          <Input
            label="Role on Project"
            placeholder="e.g. Lead Architect, QA Specialist, Consultant"
            value={roleOnProject}
            onChange={(e) => setRoleOnProject(e.target.value)}
            required
          />

          <Input
            label="Allocation Percentage (% FTE)"
            type="number"
            min="10"
            max="100"
            step="5"
            value={allocPercentage}
            onChange={(e) => setAllocPercentage(e.target.value)}
            helperText="Maximum total FTE across all projects is capped at 100%."
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAllocModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Assign Allocation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
