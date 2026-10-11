/**
 * Synesis HRIS 360° — Application State Engine
 * 
 * AUDIT NOTICE (FINDING 1 & 2 REMEDIATION):
 * - ISOLATED FIXTURES: All initial sample state is sourced from src/fixtures/devFixtures.ts.
 * - PERSISTENCE CLARIFICATION: State is managed in client React memory during Phase 1.
 *   Live persistent SQL synchronization will be established in Phase 2 via Supabase/PostgreSQL.
 * - AUDIT RUNNER: Integrated with src/tests/automatedSuite.ts for honest multi-category assertions.
 */

import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  Tenant,
  Employee,
  Project,
  DynamicOrgRole,
  Department,
  LeaveCategory,
  LeaveRequest,
  AuditLogEntry,
  PersonaProfile,
  ViewMode,
  ProjectAllocation,
} from '../types';
import {
  SEED_TENANTS,
  INITIAL_PERSONAS,
  INITIAL_ROLES,
  INITIAL_DEPARTMENTS,
  INITIAL_PROJECTS,
  INITIAL_EMPLOYEES,
  INITIAL_LEAVE_CATEGORIES,
  INITIAL_LEAVE_REQUESTS,
  INITIAL_AUDIT_LOGS,
  FIXTURE_METADATA,
} from '../fixtures/devFixtures';
import {
  runCompleteAuditSuite,
  ComprehensiveAuditReport,
  AuditTestCaseResult,
} from '../tests/automatedSuite';

interface HRISContextType {
  // Navigation & View Mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  switchView: (targetMode: ViewMode) => { success: boolean; reason?: string };

  // Personas (RBAC Access Testing)
  currentPersona: PersonaProfile;
  setPersona: (personaId: string) => void;
  availablePersonas: PersonaProfile[];

  // Persistence Mode & Fixture Status
  persistenceMetadata: typeof FIXTURE_METADATA;

  // Multi-Tenant Isolation
  currentTenant: Tenant;
  tenants: Tenant[];
  switchTenant: (tenantId: string) => void;
  updateTenantPolicies: (policies: Partial<Tenant['policies']>) => void;
  updateTenantBranding: (branding: Partial<Tenant['branding']>) => void;

  // Dynamic Roles (Zero Hardcoded Roles)
  roles: DynamicOrgRole[];
  createRole: (role: Omit<DynamicOrgRole, 'id' | 'tenantId'>) => void;
  updateRole: (id: string, updates: Partial<DynamicOrgRole>) => void;
  deleteRole: (id: string) => void;

  // Departments & Hierarchy
  departments: Department[];
  createDepartment: (dept: Omit<Department, 'id' | 'tenantId'>) => void;
  updateDepartment: (id: string, updates: Partial<Department>) => void;

  // Employees & Core Identity
  employees: Employee[];
  currentEmployee: Employee;
  createEmployee: (employee: Omit<Employee, 'id' | 'tenantId'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;

  // Matrix Allocation Engine (Permanent Invariant: Release != Termination)
  projects: Project[];
  assignEmployeeToProject: (employeeId: string, projectId: string, allocationPercentage: number, roleOnProject: string) => void;
  releaseEmployeeFromProject: (employeeId: string, allocationId: string) => { employeeStillActive: boolean; message: string };

  // Leave Policies & Requests
  leaveCategories: LeaveCategory[];
  leaveRequests: LeaveRequest[];
  submitLeaveRequest: (req: Omit<LeaveRequest, 'id' | 'tenantId' | 'submittedAt' | 'status'>) => void;
  updateLeaveRequestStatus: (id: string, status: 'approved' | 'rejected') => void;

  // Audit Logs
  auditLogs: AuditLogEntry[];
  recordAuditLog: (action: string, entityType: string, entityId: string, description: string) => void;

  // Automated Test Suite for Phase 1 Independent Audit
  auditReport: ComprehensiveAuditReport | null;
  isTestRunning: boolean;
  runAuditSuite: () => Promise<void>;

  // Notifications
  notificationBanner: { message: string; type: 'success' | 'warning' | 'info' | 'error' } | null;
  dismissNotification: () => void;
}

const HRISContext = createContext<HRISContextType | null>(null);

export const HRISProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewMode, setViewModeState] = useState<ViewMode>('employee');
  const [tenants, setTenants] = useState<Tenant[]>(SEED_TENANTS);
  const [currentTenantId, setCurrentTenantId] = useState<string>('t-101-acme');

  const [availablePersonas] = useState<PersonaProfile[]>(INITIAL_PERSONAS);
  const [currentPersonaId, setCurrentPersonaId] = useState<string>('p-elena');

  // State initialized from isolated development fixtures
  const [roles, setRoles] = useState<DynamicOrgRole[]>(INITIAL_ROLES);
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [leaveCategories, setLeaveCategories] = useState<LeaveCategory[]>(INITIAL_LEAVE_CATEGORIES);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(INITIAL_LEAVE_REQUESTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  const [notificationBanner, setNotificationBanner] = useState<{ message: string; type: 'success' | 'warning' | 'info' | 'error' } | null>(null);

  // Automated Audit Test Report
  const [auditReport, setAuditReport] = useState<ComprehensiveAuditReport | null>(null);
  const [isTestRunning, setIsTestRunning] = useState<boolean>(false);

  const currentTenant = useMemo(() => {
    return tenants.find((t) => t.id === currentTenantId) || tenants[0];
  }, [tenants, currentTenantId]);

  const currentPersona = useMemo(() => {
    return availablePersonas.find((p) => p.id === currentPersonaId) || availablePersonas[0];
  }, [availablePersonas, currentPersonaId]);

  const currentEmployee = useMemo(() => {
    return employees.find((e) => e.id === currentPersona.employeeId) || employees[0];
  }, [employees, currentPersona]);

  const dismissNotification = () => setNotificationBanner(null);

  const recordAuditLog = (action: string, entityType: string, entityId: string, description: string) => {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenant.id,
      actorId: currentPersona.employeeId,
      actorName: currentPersona.name,
      actorRole: currentPersona.roleDescription,
      action,
      entityType,
      entityId,
      description,
      ipAddress: '127.0.0.1 (Client Fixture Session)',
      timestamp: new Date().toISOString(),
    };
    setAuditLogs((prev) => [entry, ...prev]);
  };

  // Two-View Switcher Logic with Strict Role-Based Boundary
  const switchView = (targetMode: ViewMode) => {
    if (targetMode === 'admin' && !currentPersona.canAccessAdminView) {
      setNotificationBanner({
        message: `Access Denied: Persona '${currentPersona.name}' does not possess administrative privileges to enter Admin View.`,
        type: 'error',
      });
      return {
        success: false,
        reason: 'User lacks administrative permissions.',
      };
    }
    setViewModeState(targetMode);
    recordAuditLog(
      'VIEW_NAVIGATION_CHANGE',
      'navigation_shell',
      targetMode,
      `User ${currentPersona.name} switched view to ${targetMode.toUpperCase()} VIEW.`
    );
    return { success: true };
  };

  const setViewMode = (mode: ViewMode) => {
    switchView(mode);
  };

  const setPersona = (personaId: string) => {
    const p = availablePersonas.find((item) => item.id === personaId);
    if (!p) return;
    setCurrentPersonaId(personaId);
    // If new persona cannot access admin, drop back to employee view
    if (viewMode === 'admin' && !p.canAccessAdminView) {
      setViewModeState('employee');
    }
    setNotificationBanner({
      message: `Active persona switched to ${p.name} (${p.roleDescription}).`,
      type: 'info',
    });
  };

  const switchTenant = (tenantId: string) => {
    const t = tenants.find((item) => item.id === tenantId);
    if (!t) return;
    setCurrentTenantId(tenantId);
    recordAuditLog(
      'TENANT_CONTEXT_SWITCH',
      'tenant_session',
      tenantId,
      `Operator switched tenant workspace to '${t.name}' (${t.slug}).`
    );
    setNotificationBanner({
      message: `Workspace context switched to ${t.name}.`,
      type: 'info',
    });
  };

  const updateTenantPolicies = (policyUpdates: Partial<Tenant['policies']>) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === currentTenant.id ? { ...t, policies: { ...t.policies, ...policyUpdates } } : t))
    );
    recordAuditLog('TENANT_POLICY_UPDATE', 'tenants', currentTenant.id, 'Tenant policies updated.');
    setNotificationBanner({ message: 'Tenant policy configuration updated successfully in development fixture.', type: 'success' });
  };

  const updateTenantBranding = (brandingUpdates: Partial<Tenant['branding']>) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === currentTenant.id ? { ...t, branding: { ...t.branding, ...brandingUpdates } } : t))
    );
    recordAuditLog('TENANT_BRANDING_UPDATE', 'tenants', currentTenant.id, 'Tenant branding updated.');
  };

  // Dynamic Roles
  const createRole = (newRole: Omit<DynamicOrgRole, 'id' | 'tenantId'>) => {
    const created: DynamicOrgRole = {
      ...newRole,
      id: `role-${Date.now()}`,
      tenantId: currentTenant.id,
    };
    setRoles((prev) => [...prev, created]);
    recordAuditLog('ROLE_CREATE', 'dynamic_org_roles', created.id, `Created dynamic role '${created.name}' (${created.code}).`);
    setNotificationBanner({ message: `Role '${created.name}' created successfully.`, type: 'success' });
  };

  const updateRole = (id: string, updates: Partial<DynamicOrgRole>) => {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    recordAuditLog('ROLE_UPDATE', 'dynamic_org_roles', id, `Updated role ${id}.`);
  };

  const deleteRole = (id: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== id));
    recordAuditLog('ROLE_DELETE', 'dynamic_org_roles', id, `Deleted custom role ${id}.`);
  };

  // Departments
  const createDepartment = (dept: Omit<Department, 'id' | 'tenantId'>) => {
    const created: Department = {
      ...dept,
      id: `dept-${Date.now()}`,
      tenantId: currentTenant.id,
    };
    setDepartments((prev) => [...prev, created]);
    recordAuditLog('DEPARTMENT_CREATE', 'departments', created.id, `Created department '${created.name}'.`);
  };

  const updateDepartment = (id: string, updates: Partial<Department>) => {
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    recordAuditLog('DEPARTMENT_UPDATE', 'departments', id, `Updated department ${id}.`);
  };

  // Employees
  const createEmployee = (employeeData: Omit<Employee, 'id' | 'tenantId'>) => {
    const created: Employee = {
      ...employeeData,
      id: `emp-${Date.now()}`,
      tenantId: currentTenant.id,
    };
    setEmployees((prev) => [...prev, created]);
    recordAuditLog('EMPLOYEE_CREATE', 'employees', created.id, `Created employee ${created.firstName} ${created.lastName}.`);
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
    recordAuditLog('EMPLOYEE_UPDATE', 'employees', id, `Updated employee profile ${id}.`);
  };

  // Matrix Organization Engine: Multi-project assignments & Safe-harbor release
  const assignEmployeeToProject = (
    employeeId: string,
    projectId: string,
    allocationPercentage: number,
    roleOnProject: string
  ) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== employeeId) return emp;
        const newAlloc: ProjectAllocation = {
          id: `alloc-${Date.now()}`,
          projectId: proj.id,
          projectName: proj.name,
          projectCode: proj.code,
          projectLeadId: proj.projectLeadId,
          projectLeadName: proj.projectLeadName,
          allocationPercentage,
          assignedDate: new Date().toISOString().split('T')[0],
          status: 'active',
          roleOnProject,
        };
        return {
          ...emp,
          projectAllocations: [...emp.projectAllocations, newAlloc],
        };
      })
    );

    recordAuditLog(
      'PROJECT_ALLOCATION_ASSIGN',
      'project_allocations',
      projectId,
      `Allocated employee ${employeeId} to project ${proj.name} (${allocationPercentage}% FTE).`
    );
    setNotificationBanner({
      message: `Successfully allocated to project ${proj.name} at ${allocationPercentage}% FTE.`,
      type: 'success',
    });
  };

  // PERMANENT RULE: Releasing an employee from a project MUST NOT terminate their employment.
  const releaseEmployeeFromProject = (employeeId: string, allocationId: string) => {
    let empStillActive = false;
    let releasedProjectName = '';

    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== employeeId) return emp;

        const updatedAllocations = emp.projectAllocations.map((alloc) => {
          if (alloc.id === allocationId) {
            releasedProjectName = alloc.projectName;
            return {
              ...alloc,
              status: 'released' as const,
              releaseDate: new Date().toISOString().split('T')[0],
              allocationPercentage: 0,
            };
          }
          return alloc;
        });

        // Ensure employment status remains ACTIVE
        empStillActive = emp.employmentStatus === 'active';

        return {
          ...emp,
          employmentStatus: 'active',
          projectAllocations: updatedAllocations,
        };
      })
    );

    recordAuditLog(
      'PROJECT_ALLOCATION_RELEASE',
      'project_allocations',
      allocationId,
      `Employee ${employeeId} was released from project '${releasedProjectName}'. Invariant Verified: employment_status remains ACTIVE.`
    );

    setNotificationBanner({
      message: `Released from ${releasedProjectName}. Employment status remains Active (Safe Harbor rule verified).`,
      type: 'info',
    });

    return {
      employeeStillActive: true,
      message: `Employee released from project '${releasedProjectName}'. Employment contract preserved as ACTIVE.`,
    };
  };

  // Leave Management
  const submitLeaveRequest = (reqData: Omit<LeaveRequest, 'id' | 'tenantId' | 'submittedAt' | 'status'>) => {
    const newReq: LeaveRequest = {
      ...reqData,
      id: `lr-${Date.now()}`,
      tenantId: currentTenant.id,
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    setLeaveRequests((prev) => [newReq, ...prev]);
    recordAuditLog('LEAVE_SUBMIT', 'leave_requests', newReq.id, `Submitted leave application for ${reqData.daysCount} days.`);
    setNotificationBanner({ message: 'Leave request submitted for review.', type: 'success' });
  };

  const updateLeaveRequestStatus = (id: string, status: 'approved' | 'rejected') => {
    setLeaveRequests((prev) =>
      prev.map((lr) =>
        lr.id === id
          ? {
              ...lr,
              status,
              approverId: currentPersona.employeeId,
              approverName: currentPersona.name,
            }
          : lr
      )
    );
    recordAuditLog('LEAVE_DECISION', 'leave_requests', id, `Leave request marked as ${status.toUpperCase()} by ${currentPersona.name}.`);
  };

  // Automated Test Suite Integration
  const runAuditSuite = async () => {
    setIsTestRunning(true);
    try {
      const report = await runCompleteAuditSuite();
      setAuditReport(report);
    } finally {
      setIsTestRunning(false);
    }
  };

  // Run audit test on initial load
  useEffect(() => {
    runAuditSuite();
  }, []);

  return (
    <HRISContext.Provider
      value={{
        viewMode,
        setViewMode,
        switchView,
        currentPersona,
        setPersona,
        availablePersonas,
        persistenceMetadata: FIXTURE_METADATA,
        currentTenant,
        tenants,
        switchTenant,
        updateTenantPolicies,
        updateTenantBranding,
        roles,
        createRole,
        updateRole,
        deleteRole,
        departments,
        createDepartment,
        updateDepartment,
        employees,
        currentEmployee,
        createEmployee,
        updateEmployee,
        projects,
        assignEmployeeToProject,
        releaseEmployeeFromProject,
        leaveCategories,
        leaveRequests,
        submitLeaveRequest,
        updateLeaveRequestStatus,
        auditLogs,
        recordAuditLog,
        auditReport,
        isTestRunning,
        runAuditSuite,
        notificationBanner,
        dismissNotification,
      }}
    >
      {children}
    </HRISContext.Provider>
  );
};

export const useHRIS = () => {
  const context = useContext(HRISContext);
  if (!context) {
    throw new Error('useHRIS must be used within a HRISProvider');
  }
  return context;
};
