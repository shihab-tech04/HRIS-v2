export interface SyntheticPreviewUser {
  userId: string;
  employeeId: string;
  fullName: string;
  email: string;
  roleId: string;
  department: string;
  designation: string;
  tenantId: string;
  status: 'active' | 'inactive';
  persistence: 'preview';
}
export const PREVIEW_EMAIL_DOMAIN: 'example.com';
export function generateSyntheticPreviewUser(options: {
  tenantId: string;
  roleId: string;
  department: string;
  designation: string;
  existingUsers?: Array<Pick<SyntheticPreviewUser, 'userId' | 'employeeId' | 'email'>>;
  makeCode?: () => string;
  name?: string;
}): SyntheticPreviewUser;
