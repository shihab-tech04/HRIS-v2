import React, { useState } from 'react';
import { HRISProvider, useHRIS } from './context/HRISContext';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { BreadcrumbItem } from './components/ui/Breadcrumbs';
import { Phase1AuditReportModal } from './components/audit/Phase1AuditReportModal';

// Employee Views
import { EmployeeDashboard } from './views/employee/EmployeeDashboard';
import { MyProjectsAndAllocations } from './views/employee/MyProjectsAndAllocations';
import { MyTimeAndLeave } from './views/employee/MyTimeAndLeave';
import { MyTeamView } from './views/employee/MyTeamView';
import { MyDocuments } from './views/employee/MyDocuments';

// Admin Views
import { AdminDashboard } from './views/admin/AdminDashboard';
import { OrgStructureAndRoles } from './views/admin/OrgStructureAndRoles';
import { EmployeeDirectoryAndMatrix } from './views/admin/EmployeeDirectoryAndMatrix';
import { ProjectManagement } from './views/admin/ProjectManagement';
import { TenantSettings } from './views/admin/TenantSettings';
import { SQLContractExplorer } from './views/admin/SQLContractExplorer';
import { AuditAndCompliance } from './views/admin/AuditAndCompliance';

import { X, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { LiveApp } from './live/LiveApp';
import { FrontendReviewApp } from './frontend-review/FrontendReviewApp';

const MainShell: React.FC = () => {
  const {
    viewMode,
    currentTenant,
    notificationBanner,
    dismissNotification,
  } = useHRIS();

  const [employeeTab, setEmployeeTab] = useState('employee_overview');
  const [adminTab, setAdminTab] = useState('admin_dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const activeTab = viewMode === 'employee' ? employeeTab : adminTab;
  const setActiveTab = (tabId: string) => {
    if (viewMode === 'employee') {
      setEmployeeTab(tabId);
    } else {
      setAdminTab(tabId);
    }
  };

  // Dynamic breadcrumbs based on active environment and section
  const breadcrumbs: BreadcrumbItem[] = [
    { label: currentTenant.name, onClick: () => setActiveTab(viewMode === 'employee' ? 'employee_overview' : 'admin_dashboard') },
    { label: viewMode === 'employee' ? 'Employee Self-Service' : 'Tenant Administration' },
    {
      label:
        viewMode === 'employee'
          ? {
              employee_overview: 'Personal Overview',
              employee_projects: 'Projects & Allocations',
              employee_time_leave: 'Time & Attendance',
              employee_team: 'Team & Supervisees',
              employee_documents: 'Contracts & Vault',
            }[employeeTab] || 'Overview'
          : {
              admin_dashboard: 'Operations Console',
              admin_org_roles: 'Org Structure & Roles',
              admin_directory_matrix: 'Directory & Matrix',
              admin_projects: 'Project Workspaces',
              admin_tenant_settings: 'Tenant Settings',
              admin_sql_contracts: 'PostgreSQL Contracts',
              admin_audit_logs: 'System Audit Logs',
            }[adminTab] || 'Dashboard',
      active: true,
    },
  ];

  return (
    <div className="min-h-screen min-w-0 flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Bar with Top Bar Contract */}
      <TopBar
        breadcrumbs={breadcrumbs}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Global Notification Banner */}
      {notificationBanner && (
        <div
          className={`px-4 py-2.5 flex items-center justify-between text-xs transition-all ${
            notificationBanner.type === 'error'
              ? 'bg-red-50 text-red-900 border-b border-red-200'
              : notificationBanner.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200'
              : 'bg-blue-50 text-blue-900 border-b border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
            {notificationBanner.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : notificationBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span className="font-medium">{notificationBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={dismissNotification}
            className="p-1 hover:opacity-75 rounded transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar
          currentTab={activeTab}
          onSelectTab={setActiveTab}
          className="hidden lg:flex"
        />

        {/* Mobile Navigation Drawer */}
        <MobileNav
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          currentTab={activeTab}
          onSelectTab={setActiveTab}
        />

        {/* Viewport Content Area */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {viewMode === 'employee' ? (
            <>
              {employeeTab === 'employee_overview' && (
                <EmployeeDashboard onNavigateTab={setEmployeeTab} />
              )}
              {employeeTab === 'employee_projects' && <MyProjectsAndAllocations />}
              {employeeTab === 'employee_time_leave' && <MyTimeAndLeave />}
              {employeeTab === 'employee_team' && <MyTeamView />}
              {employeeTab === 'employee_documents' && <MyDocuments />}
            </>
          ) : (
            <>
              {adminTab === 'admin_dashboard' && (
                <AdminDashboard
                  onNavigateTab={setAdminTab}
                  onOpenAuditModal={() => setIsAuditModalOpen(true)}
                />
              )}
              {adminTab === 'admin_org_roles' && <OrgStructureAndRoles />}
              {adminTab === 'admin_directory_matrix' && <EmployeeDirectoryAndMatrix />}
              {adminTab === 'admin_projects' && <ProjectManagement />}
              {adminTab === 'admin_tenant_settings' && <TenantSettings />}
              {adminTab === 'admin_sql_contracts' && <SQLContractExplorer />}
              {adminTab === 'admin_audit_logs' && <AuditAndCompliance />}
            </>
          )}
        </main>
      </div>

      {/* Phase 1 Independent Audit Evidence Report Modal */}
      <Phase1AuditReportModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  if (import.meta.env.VITE_HRIS_FRONTEND_REVIEW === 'true') return <FrontendReviewApp />;
  return <LiveApp preview={<HRISProvider><MainShell /></HRISProvider>} />;
}
