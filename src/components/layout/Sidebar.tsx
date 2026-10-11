import React from 'react';
import { useHRIS } from '../../context/HRISContext';
import {
  User,
  FolderGit2,
  CalendarDays,
  Users,
  FileText,
  SlidersHorizontal,
  Building,
  Briefcase,
  Database,
  History,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  className = '',
}) => {
  const { viewMode, currentPersona, currentEmployee } = useHRIS();

  // Employee View Navigation Items
  const employeeNavItems = [
    { id: 'employee_overview', label: 'My Personal Overview', icon: User },
    { id: 'employee_projects', label: 'My Projects & Allocations', icon: FolderGit2, badge: `${currentEmployee.projectAllocations.length} Active` },
    { id: 'employee_time_leave', label: 'My Time & Attendance', icon: CalendarDays },
    { id: 'employee_team', label: 'My Team & Supervisees', icon: Users, isLeadOnly: true },
    { id: 'employee_documents', label: 'My Contracts & Vault', icon: FileText },
  ];

  // Admin View Navigation Items
  const adminNavItems = [
    { id: 'admin_dashboard', label: 'Operations Console', icon: LayoutDashboard },
    { id: 'admin_org_roles', label: 'Org Structure & Roles', icon: SlidersHorizontal, note: 'Zero hardcoded' },
    { id: 'admin_directory_matrix', label: 'Directory & Matrix Allocations', icon: Users },
    { id: 'admin_projects', label: 'Project Workspaces', icon: Briefcase },
    { id: 'admin_tenant_settings', label: 'Tenant Configuration', icon: Building },
    { id: 'admin_sql_contracts', label: 'PostgreSQL Contracts & RLS', icon: Database, badge: '153 Modules' },
    { id: 'admin_audit_logs', label: 'Audit Trail & Compliance', icon: History },
  ];

  const items = viewMode === 'employee' ? employeeNavItems : adminNavItems;

  return (
    <aside
      className={`w-64 bg-slate-900 text-slate-300 flex flex-col justify-between border-r border-slate-800 shrink-0 select-none ${className}`}
    >
      <div className="p-4 flex flex-col gap-6">
        {/* View Badge / Context Banner */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 rounded-lg border border-slate-700/60">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
              Active Environment
            </span>
            <span className="text-xs font-semibold text-white">
              {viewMode === 'employee' ? 'Employee Self-Service' : 'Tenant Administration'}
            </span>
          </div>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            viewMode === 'employee' ? 'bg-blue-900/60 text-blue-200' : 'bg-amber-900/60 text-amber-200'
          }`}>
            {viewMode.toUpperCase()}
          </span>
        </div>

        {/* Navigation Group */}
        <nav className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-1">
            {viewMode === 'employee' ? 'Personal Operations' : 'Governance & Systems'}
          </span>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {'badge' in item && item.badge && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                    isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Session Footnote */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center text-xs font-bold shrink-0 border border-slate-700">
            {currentPersona.avatarText}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{currentPersona.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{currentPersona.roleDescription}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
