/**
 * WS07: preview-only identities for Admin-controlled UX testing.
 * These records are NOT Supabase Auth users or permission grants.
 */
export const PREVIEW_EMAIL_DOMAIN = 'example.com';

const GIVEN_NAMES = ['Rahim', 'Nusrat', 'Ayesha', 'Farhan', 'Mim', 'Tanvir', 'Sadia', 'Imran'];
const FAMILY_NAMES = ['Ahmed', 'Rahman', 'Islam', 'Chowdhury', 'Hossain', 'Akter', 'Karim', 'Sultana'];

function defaultCode() {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function slug(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}

/**
 * @param {{tenantId: string, roleId: string, department: string, designation: string,
 *  existingUsers?: Array<{userId: string, employeeId: string, email: string}>,
 *  makeCode?: () => string, name?: string}} options
 */
export function generateSyntheticPreviewUser(options) {
  const { tenantId, roleId, department, designation, existingUsers = [], makeCode = defaultCode } = options ?? {};
  if (![tenantId, roleId, department, designation].every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Tenant, role, department and designation are required.');
  }
  if (!Array.isArray(existingUsers)) throw new Error('Invalid preview user list.');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(makeCode()).toUpperCase();
    if (!/^[A-F0-9]{6,12}$/.test(code)) throw new Error('Invalid generated preview identifier.');
    const userId = `USR-${code}`;
    const employeeId = `EMP-${code}`;
    const given = GIVEN_NAMES[parseInt(code.slice(0, 2), 16) % GIVEN_NAMES.length];
    const family = FAMILY_NAMES[parseInt(code.slice(2, 4), 16) % FAMILY_NAMES.length];
    const fullName = typeof options.name === 'string' && options.name.trim()
      ? options.name.trim() : `${given} ${family}`;
    const emailSlug = slug(fullName);
    if (!emailSlug) throw new Error('Name must contain Latin letters or digits for a preview email.');
    const email = `${emailSlug}.${code.toLowerCase()}@${PREVIEW_EMAIL_DOMAIN}`;
    const collides = existingUsers.some(user =>
      user.userId?.toLowerCase() === userId.toLowerCase()
      || user.employeeId?.toLowerCase() === employeeId.toLowerCase()
      || user.email?.toLowerCase() === email.toLowerCase());
    if (collides) continue;

    return {
      userId, employeeId, fullName, email,
      roleId: roleId.trim(), department: department.trim(), designation: designation.trim(),
      tenantId: tenantId.trim(), status: 'active', persistence: 'preview',
    };
  }
  throw new Error('Could not generate a unique preview identity. Retry.');
}
