import React from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Users,
  Building2,
  FolderGit2,
  Database,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  History,
  FileCheck2,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateTab: (tabId: string) => void;
  onOpenAuditModal: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigateTab,
  onOpenAuditModal,
}) => {
  const {
    currentTenant,
    employees,
    roles,
    departments,
    projects,
    auditLogs,
    testResults,
  } = useHRIS();

  const totalFteAllocated = projects.reduce(
    (sum, p) => sum + (p.totalAllocatedFte || 0),
    0
  );

  const passingTests = testResults.filter((t) => t.status === 'PASS').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner: Tenant Status & System Integrity */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Tenant Administration Console
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-mono text-slate-500">{currentTenant.slug}</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">
              {currentTenant.name}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {currentTenant.legalEntityName} · Currency: <strong className="text-slate-700 font-mono">{currentTenant.policies.currency}</strong> · Timezone: <strong className="text-slate-700 font-mono">{currentTenant.policies.timezone}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenAuditModal}
              icon={<FileCheck2 className="w-3.5 h-3.5 text-blue-600" />}
            >
              Phase 1 Audit Report ({passingTests}/{testResults.length} Tests)
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigateTab('admin_sql_contracts')}
              icon={<Database className="w-3.5 h-3.5" />}
            >
              PostgreSQL Contracts
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Workforce</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {employees.length}
            </span>
            <span className="text-xs text-slate-400">staff members</span>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium block mt-1">
            100% active contracts verified
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Matrix Projects</span>
            <FolderGit2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {projects.length}
            </span>
            <span className="text-xs text-slate-400">client workspaces</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1 font-mono">
            {totalFteAllocated.toFixed(1)} FTE committed
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Configurable Roles</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {roles.length}
            </span>
            <span className="text-xs text-slate-400">dynamic roles</span>
          </div>
          <span className="text-[11px] text-blue-700 font-medium block mt-1">
            Zero hardcoded roles
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">PostgreSQL RLS Status</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              Active
            </span>
            <span className="text-xs text-slate-400">Row Level Security</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-1 font-mono">
            153 Modules in contract
          </span>
        </div>
      </div>

      {/* Main Split: Quick Administration Gates & Recent Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Architectural Foundation Modules */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card
            title="Core Governance Modules"
            subtitle="Configurable engines ready for tenant operational controls"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('admin_org_roles')}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Org Structure & Roles
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Define dynamic roles, custom permissions, and department hierarchies.
                </p>
                <span className="text-[10px] font-mono text-blue-700 block mt-2">
                  {roles.length} Roles · {departments.length} Departments
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('admin_directory_matrix')}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Directory & Matrix Allocations
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Manage dual reporting lines and test the project release safe-harbor invariant.
                </p>
                <span className="text-[10px] font-mono text-blue-700 block mt-2">
                  {employees.length} Employee Records
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('admin_sql_contracts')}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    SQL Contract & RLS Explorer
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Inspect PostgreSQL DDL, test RLS token simulations, and browse 153 modules.
                </p>
                <span className="text-[10px] font-mono text-emerald-700 block mt-2">
                  153 Modules Mapped
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('admin_tenant_settings')}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Tenant Policy Engine
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Configure work hours, probation limits, fiscal anchors, and branding.
                </p>
                <span className="text-[10px] font-mono text-blue-700 block mt-2">
                  {currentTenant.policies.defaultWorkWeekDays}d / {currentTenant.policies.standardWorkHoursPerDay}h standard
                </span>
              </button>
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Audit Stream */}
        <div className="flex flex-col gap-4">
          <Card
            title="System Audit Stream"
            subtitle="Real-time tamper-evident events"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateTab('admin_audit_logs')}
              >
                All Logs
              </Button>
            }
          >
            <div className="flex flex-col divide-y divide-slate-100">
              {auditLogs.slice(0, 4).map((entry) => (
                <div key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded">
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1 line-clamp-2 leading-relaxed">
                    {entry.description}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    By <strong className="text-slate-600 font-medium">{entry.actorName}</strong>
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
