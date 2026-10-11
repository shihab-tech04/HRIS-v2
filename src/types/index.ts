export type ViewMode = 'employee' | 'admin';

export type UserRole = 
  | 'PLATFORM_SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'HEAD_OF_DEPARTMENT'
  | 'PROJECT_LEAD'
  | 'PEOPLE_OPERATIONS'
  | 'EMPLOYEE';

export interface TenantBranding {
  primaryColor: string;
  accentColor: string;
  logoText: string;
  density: 'compact' | 'standard' | 'spacious';
}

export interface TenantPolicyConfig {
  defaultWorkWeekDays: number;
  standardWorkHoursPerDay: number;
  probationPeriodDays: number;
  overtimeEligibleByDefault: boolean;
  leaveEncashmentAllowed: boolean;
  fiscalYearStartMonth: number; // 1 = January, 4 = April
  currency: string;
  timezone: string;
  dateFormat: string;
}

export interface DynamicOrgRole {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string;
  isAdministrative: boolean;
  permissions: string[];
  isCustom: boolean;
}

export interface Department {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  headOfDepartmentId?: string;
  costCenterCode: string;
  parentDepartmentId?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalEntityName: string;
  country: string;
  industry: string;
  employeeCount: number;
  branding: TenantBranding;
  policies: TenantPolicyConfig;
  status: 'active' | 'trial' | 'suspended';
  createdAt: string;
}

export interface ProjectAllocation {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  projectLeadId: string;
  projectLeadName: string;
  allocationPercentage: number; // e.g. 50%
  assignedDate: string;
  releaseDate?: string;
  status: 'active' | 'released' | 'upcoming';
  roleOnProject: string;
}

export interface Employee {
  id: string;
  tenantId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail?: string;
  avatarUrl?: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
  departmentName: string;
  
  // Matrix Organization / Reporting:
  primaryManagerId: string; // Organizational reporting manager
  primaryManagerName: string;
  
  // Dynamic Roles & Permissions:
  assignedRoleIds: string[];
  assignedRoleNames: string[];
  
  // Multi-Project Allocations (Project reporting differs from Org reporting):
  projectAllocations: ProjectAllocation[];
  
  employmentType: 'full_time' | 'part_time' | 'contractor' | 'intern';
  employmentStatus: 'active' | 'on_leave' | 'notice_period' | 'terminated';
  joinDate: string;
  terminationDate?: string;
  location: string;
  salaryTier?: string;
}

export interface Project {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string;
  clientName: string;
  projectLeadId: string;
  projectLeadName: string;
  startDate: string;
  targetEndDate: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  allocatedMemberIds: string[];
  totalAllocatedFte: number;
}

export interface LeaveCategory {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  annualQuotaDays: number;
  isPaid: boolean;
  accrualCadence: 'monthly' | 'annual' | 'quarterly';
  carryForwardLimitDays: number;
}

export interface LeaveRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  leaveCategoryId: string;
  leaveCategoryName: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approverId?: string;
  approverName?: string;
  submittedAt: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  ipAddress: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaProfile {
  id: string;
  name: string;
  roleDescription: string;
  email: string;
  avatarText: string;
  canAccessAdminView: boolean;
  employeeId: string;
  isPlatformAdmin: boolean;
}

export interface SQLContractModule {
  id: string;
  moduleNumber: number;
  name: string;
  domain: string;
  tableName: string;
  rlsPolicyDescription: string;
  phaseIntroduced: string;
  status: 'MAPPED' | 'IN_CONTRACT' | 'ACTIVE_SCHEMA';
}
