export const PREVIEW_USER_ROLES = [
  'Administrator / HR Administrator',
  'Employee',
  'Manager',
  'HOD',
  'CEO',
  'Recruitment / HR Operations',
] as const;

export type PreviewUserRole = typeof PREVIEW_USER_ROLES[number];
export type PreviewUserStatus = 'active' | 'inactive';
export type SyntheticPreviewLeaveDraft = {
  fromDate: string;
  toDate: string;
  reason: string;
  savedAt: string;
  status: 'draft';
};

export type SyntheticPreviewUser = {
  recordKey: string;
  tenantId: string;
  tenantName: string;
  fullName: string;
  email: string;
  userId: string;
  employeeNumber: string;
  role: PreviewUserRole;
  /** Optional for backwards compatibility with preview records created before reference IDs were stored. */
  departmentId?: string | null;
  designationId?: string | null;
  department: string;
  designation: string;
  status: PreviewUserStatus;
  createdAt: string;
  completedPreviewActions: string[];
  previewLeaveDraft?: SyntheticPreviewLeaveDraft | null;
};

export type SyntheticPreviewUserDraft = Omit<SyntheticPreviewUser, 'createdAt' | 'completedPreviewActions' | 'previewLeaveDraft'>;

const STORAGE_PREFIX = 'synesis-hris-preview-users:v1:';
const firstNames = ['Rahim', 'Nabila', 'Arif', 'Farhana', 'Tariq', 'Maliha', 'Sadia', 'Imran', 'Nusrat', 'Hasan'];
const lastNames = ['Ahmed', 'Hossain', 'Chowdhury', 'Rahman', 'Khan', 'Akter', 'Islam', 'Karim', 'Sultana', 'Uddin'];

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
}

function recordKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `preview-${Date.now()}-${randomHex(12)}`;
}

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(tenantId)}`;
}

function isPreviewUser(value: unknown, tenantId: string): value is SyntheticPreviewUser {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SyntheticPreviewUser>;
  return row.tenantId === tenantId
    && typeof row.recordKey === 'string'
    && typeof row.fullName === 'string'
    && typeof row.email === 'string'
    && typeof row.userId === 'string'
    && typeof row.employeeNumber === 'string'
    && (row.departmentId == null || typeof row.departmentId === 'string')
    && (row.designationId == null || typeof row.designationId === 'string')
    && PREVIEW_USER_ROLES.includes(row.role as PreviewUserRole)
    && (row.status === 'active' || row.status === 'inactive')
    && typeof row.createdAt === 'string'
    && (row.previewLeaveDraft == null || isSyntheticPreviewLeaveDraft(row.previewLeaveDraft));
}

function isSyntheticPreviewLeaveDraft(value: unknown): value is SyntheticPreviewLeaveDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<SyntheticPreviewLeaveDraft>;
  return typeof draft.fromDate === 'string'
    && typeof draft.toDate === 'string'
    && typeof draft.reason === 'string'
    && typeof draft.savedAt === 'string'
    && draft.status === 'draft';
}

export function readSyntheticPreviewUsers(tenantId: string): SyntheticPreviewUser[] {
  if (typeof window === 'undefined' || !tenantId) return [];
  const serialized = window.localStorage.getItem(storageKey(tenantId));
  if (!serialized) return [];
  const decoded: unknown = JSON.parse(serialized);
  if (!Array.isArray(decoded)) throw new Error('Preview records could not be read. Clear the browser preview storage and retry.');
  return decoded.filter((value): value is SyntheticPreviewUser => isPreviewUser(value, tenantId));
}

export function readAllSyntheticPreviewUsers(): SyntheticPreviewUser[] {
  if (typeof window === 'undefined') return [];
  const result: SyntheticPreviewUser[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    let tenantId = '';
    try { tenantId = decodeURIComponent(key.slice(STORAGE_PREFIX.length)); } catch { continue; }
    result.push(...readSyntheticPreviewUsers(tenantId));
  }
  return result;
}

export function writeSyntheticPreviewUsers(tenantId: string, users: SyntheticPreviewUser[]): void {
  if (typeof window === 'undefined' || !tenantId) throw new Error('Select an organization before saving preview users.');
  window.localStorage.setItem(storageKey(tenantId), JSON.stringify(users));
}

export function createSyntheticPreviewDraft(
  tenantId: string,
  tenantName: string,
  existing: SyntheticPreviewUser[],
  role: PreviewUserRole = 'Employee',
): SyntheticPreviewUserDraft {
  const occupiedUserIds = new Set(existing.map(user => user.userId.toUpperCase()));
  const occupiedEmails = new Set(existing.map(user => user.email.toLowerCase()));
  const fullName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  const emailName = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
  let userId = '';
  let email = '';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = randomHex(8);
    userId = `USR-${code}`;
    email = `${emailName}.${code.slice(0, 6).toLowerCase()}@example.com`;
    if (!occupiedUserIds.has(userId.toUpperCase()) && !occupiedEmails.has(email.toLowerCase())) break;
  }

  const year = new Date().getFullYear();
  const occupiedEmployeeNumbers = new Set(existing.map(user => user.employeeNumber));
  let sequence = 1;
  while (occupiedEmployeeNumbers.has(`EMP-${year}-${String(sequence).padStart(4, '0')}`)) sequence += 1;

  return {
    recordKey: recordKey(),
    tenantId,
    tenantName,
    fullName,
    email,
    userId,
    employeeNumber: `EMP-${year}-${String(sequence).padStart(4, '0')}`,
    role,
    departmentId: null,
    designationId: null,
    department: '',
    designation: '',
    status: 'active',
  };
}

export function createManualSyntheticPreviewDraft(
  tenantId: string,
  tenantName: string,
  existing: SyntheticPreviewUser[],
): SyntheticPreviewUserDraft {
  const generated = createSyntheticPreviewDraft(tenantId, tenantName, existing);
  return { ...generated, fullName: '', email: '' };
}

export function validateSyntheticPreviewDraft(
  draft: SyntheticPreviewUserDraft,
  existing: SyntheticPreviewUser[],
): string | null {
  const fullName = draft.fullName.trim();
  const email = draft.email.trim().toLowerCase();
  const userId = draft.userId.trim().toUpperCase();
  const employeeNumber = draft.employeeNumber.trim().toUpperCase();
  if (fullName.length < 2 || fullName.length > 100) return 'Enter a name between 2 and 100 characters.';
  if (!/^[^\s@]+@example\.com$/i.test(email)) return 'Use a reserved synthetic address ending in @example.com.';
  if (!/^USR-[A-Z0-9-]{6,32}$/.test(userId)) return 'Use a user ID in the format USR-XXXXXXXX.';
  if (!/^EMP-\d{4}-\d{4,}$/.test(employeeNumber)) return 'Use an employee number in the format EMP-YYYY-0001.';
  if (!PREVIEW_USER_ROLES.includes(draft.role)) return 'Select a preview role.';
  if (!draft.department.trim()) return 'Choose a department from this organization.';
  if (!draft.designation.trim()) return 'Enter a designation label for this organization.';
  const collision = existing.find(user => user.recordKey !== draft.recordKey && (
    user.userId.toUpperCase() === userId
    || user.email.toLowerCase() === email
    || user.employeeNumber.toUpperCase() === employeeNumber
  ));
  if (collision) return 'That email, user ID, or employee number is already in use for this organization.';
  return null;
}

export function materializeSyntheticPreviewUser(draft: SyntheticPreviewUserDraft): SyntheticPreviewUser {
  return {
    ...draft,
    fullName: draft.fullName.trim(),
    email: draft.email.trim().toLowerCase(),
    userId: draft.userId.trim().toUpperCase(),
    employeeNumber: draft.employeeNumber.trim().toUpperCase(),
    department: draft.department.trim(),
    designation: draft.designation.trim(),
    createdAt: new Date().toISOString(),
    completedPreviewActions: [],
    previewLeaveDraft: null,
  };
}
