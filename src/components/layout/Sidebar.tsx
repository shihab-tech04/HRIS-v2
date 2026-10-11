import React, { useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  className?: string;
  isCompact?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  className = '',
  isCompact: controlledCompact,
}) => {
  const { viewMode, currentPersona, currentEmployee } = useHRIS();
  const [internalCompact, setInternalCompact] = useState(false);
  const isCompact = controlledCompact !== undefined ? controlledCompact : internalCompact;

  // Employee View Navigation Items
  const employeeNavItems = [
    { id: 'employee_overview', label: 'My Personal Overview', shortLabel: 'Overview', icon: User },
    { id: 'employee_projects', label: 'My Projects & Allocations', shortLabel: 'Projects', icon: FolderGit2, badge: `${currentEmployee.projectAllocations.length} Active` },
    { id: 'employee_time_leave', label: 'My Time & Attendance', shortLabel: 'Attendance', icon: CalendarDays },
    { id: 'employee_team', label: 'My Team & Supervisees', shortLabel: 'Team', icon: Users, isLeadOnly: true },
    { id: 'employee_documents', label: 'My Contracts & Vault', shortLabel: 'Documents', icon: FileText },
  ];

  // Admin View Navigation Items
  const adminNavItems = [
    { id: 'admin_dashboard', label: 'Operations Console', shortLabel: 'Console', icon: LayoutDashboard },
    { id: 'admin_org_roles', label: 'Org Structure & Roles', shortLabel: 'Structure', icon: SlidersHorizontal, note: 'Zero hardcoded' },
    { id: 'admin_directory_matrix', label: 'Directory & Matrix Allocations', shortLabel: 'Matrix', icon: Users },
    { id: 'admin_projects', label: 'Project Workspaces', shortLabel: 'Projects', icon: Briefcase },
    { id: 'admin_tenant_settings', label: 'Tenant Configuration', shortLabel: 'Settings', icon: Building },
    { id: 'admin_sql_contracts', label: 'PostgreSQL Contracts & RLS', shortLabel: 'Contracts', icon: Database, badge: '153 Modules' },
    { id: 'admin_audit_logs', label: 'Audit Trail & Compliance', shortLabel: 'Audit Logs', icon: History },
  ];

  const items = viewMode === 'employee' ? employeeNavItems : adminNavItems;

  return (
    <aside
      className={`${
        isCompact ? 'w-[111px]' : 'w-64'
      } bg-[#07304C] text-slate-200 flex flex-col justify-between border-r border-[#05263D] shrink-0 select-none transition-all duration-200 ${className}`}
      data-testid="app-sidebar"
      data-sidebar-width={isCompact ? '111' : '256'}
    >
      <div className={`flex flex-col ${isCompact ? 'p-2 gap-3' : 'p-4 gap-6'}`}>
        {/* View Badge / Context Banner */}
        <div className={`flex items-center justify-between ${isCompact ? 'px-1.5 py-1 text-center justify-center' : 'px-3 py-2'} bg-[#05263D] rounded-lg border border-[#0A3D61]`}>
          {!isCompact ? (
            <>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                  Active Environment
                </span>
                <span className="text-xs font-semibold text-white">
                  {viewMode === 'employee' ? 'Employee Self-Service' : 'Tenant Administration'}
                </span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                viewMode === 'employee' ? 'bg-[#085587] text-white' : 'bg-amber-900/60 text-amber-200'
              }`}>
                {viewMode.toUpperCase()}
              </span>
            </>
          ) : (
            <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
              viewMode === 'employee' ? 'bg-[#085587] text-white' : 'bg-amber-900/60 text-amber-200'
            }`}>
              {viewMode === 'employee' ? 'EMPLOYEE' : 'ADMIN'}
            </span>
          )}
        </div>

        {/* Navigation Group */}
        <nav className="flex flex-col gap-1">
          {!isCompact && (
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1">
              {viewMode === 'employee' ? 'Personal Operations' : 'Governance & Systems'}
            </span>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={item.label}
                className={`rounded-lg transition-colors cursor-pointer ${
                  isCompact
                    ? 'flex flex-col items-center justify-center p-2 text-center text-[10px]'
                    : 'flex items-center justify-between px-3 py-2.5 text-xs font-medium text-left'
                } ${
                  isActive
                    ? 'bg-[#085587] text-white font-semibold shadow-xs'
                    : 'text-slate-200 hover:bg-[#0A3D61]/60 hover:text-white'
                }`}
              >
                {isCompact ? (
                  <>
                    <Icon className={`w-5 h-5 mb-1 shrink-0 ${isActive ? 'text-white' : 'text-slate-300'}`} />
                    <span className="truncate max-w-[95px] leading-tight">{item.shortLabel}</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {'badge' in item && item.badge && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                        isActive ? 'bg-[#074770] text-white' : 'bg-[#05263D] text-slate-300'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Session Footnote & Figma 111px Toggle */}
      <div className={`${isCompact ? 'p-2' : 'p-3'} border-t border-[#0A3D61] bg-[#052135] flex flex-col gap-2`}>
        <div className={`flex items-center ${isCompact ? 'justify-center' : 'gap-2.5'}`}>
          <div className="w-8 h-8 rounded-full bg-[#085587] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#0A3D61]">
            {currentPersona.avatarText}
          </div>
          {!isCompact && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{currentPersona.name}</p>
              <p className="text-[10px] text-slate-300 truncate">{currentPersona.roleDescription}</p>
            </div>
          )}
        </div>

        {/* Figma 111px Compact vs 256px Expanded Toggle */}
        <button
          type="button"
          onClick={() => setInternalCompact(!isCompact)}
          className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10px] text-slate-400 hover:text-white hover:bg-[#0A3D61] transition-colors cursor-pointer"
          title={isCompact ? 'Expand to 256px standard sidebar' : 'Collapse to Figma 111px compact sidebar'}
          aria-label={isCompact ? 'Expand sidebar to 256px' : 'Collapse sidebar to 111px'}
        >
          {isCompact ? (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          ) : (
            <>
              <PanelLeftClose className="w-3.5 h-3.5" />
              <span>Compact (111px)</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
