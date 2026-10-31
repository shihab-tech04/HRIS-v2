import { supabase } from '../lib/supabase';
import { loadRealProvisioningReadiness } from './realUserProvisioningApi';

// Legacy v3 API candidate ONLY: password-based pre-confirmed account creation.
// Not an invitation. This module is not in production navigation. WS02 must
// explicitly approve this flow before a release controller can enable its UI.
export type LegacyProvisionInput = {
  tenantId: string;
  employeeId: string;
  roleId: string;
  initialPassword: string;
};
export type CreatedRealAccount = {
  userId: string;
  email: string;
  employeeId: string;
  roleId: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProvisioningError extends Error {
  constructor(
    public readonly code: 'INVALID_INPUT' | 'NOT_AUTHORIZED' | 'UNAVAILABLE' | 'DUPLICATE' | 'UNCONFIRMED',
    message: string,
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

function requireUuid(input: string, label: string) {
  if (!uuidPattern.test(input)) {
    throw new ProvisioningError('INVALID_INPUT', 'Select a valid ' + label + '.');
  }
}
function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function cleanErrorMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Do not echo password-like input, JWTs or server traces through the UI.
  return value.slice(0, 300).replace(/Bearer\s+\S+/gi, '[redacted credential]');
}

/**
 * Execute only from a separately approved, opted-in production UI.
 * Caller authentication is enforced a second time by the hosted Edge Function.
 * Network/unknown responses are NEVER retried automatically: the server may
 * have created Auth identity even if the browser lost the response.
 */
export async function provisionLegacyPasswordAccount(input: LegacyProvisionInput): Promise<CreatedRealAccount> {
  requireUuid(input.tenantId, 'organization');
  requireUuid(input.employeeId, 'existing employee');
  const roleId = input.roleId.trim();
  if (!roleId || roleId.length > 128) {
    throw new ProvisioningError('INVALID_INPUT', 'Select a valid permitted role.');
  }
  if (input.initialPassword.length < 12 || input.initialPassword.length > 1024) {
    throw new ProvisioningError('INVALID_INPUT', 'Initial password must contain at least 12 characters.');
  }

  let context;
  try {
    // Re-read authenticated, selected-tenant policy just before submitting.
    context = await loadRealProvisioningReadiness(input.tenantId);
  } catch {
    throw new ProvisioningError('NOT_AUTHORIZED', 'User management authorization could not be verified.');
  }
  if (!context.assignableRoles.some(role => role.id === roleId)) {
    throw new ProvisioningError('NOT_AUTHORIZED', 'This role cannot be assigned by your account.');
  }
  const employee = context.availableEmployees.find(item => item.id === input.employeeId);
  if (!employee) {
    throw new ProvisioningError('DUPLICATE', 'The employee is unavailable or already linked to an account. Refresh the directory.');
  }
  const email = employee.official_email.trim().toLowerCase();
  if (!validEmail(email)) {
    throw new ProvisioningError('INVALID_INPUT', 'The existing employee has no valid official email address.');
  }
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke('admin-create-user', {
      body: {
        email,
        password: input.initialPassword,
        employeeId: input.employeeId,
        roleId,
      },
    });
  } catch {
    throw new ProvisioningError('UNCONFIRMED',
      'Provisioning response was interrupted. Check the real directory before submitting again.');
  }

  if (result.error) {
    const body = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null;
    const message = cleanErrorMessage(body?.error) || cleanErrorMessage(result.error.message);
    if (/already exists|duplicate|registered|already has/i.test(message)) {
      throw new ProvisioningError('DUPLICATE',
        'An account with this email or employee already exists. Refresh the real directory.');
    }
    if (/not authorized|unauthorized|permission|assignable/i.test(message)) {
      throw new ProvisioningError('NOT_AUTHORIZED', 'You are not authorized to provision this account.');
    }
    if (/compromised|breach|password/i.test(message) && !/unavailable/i.test(message)) {
      throw new ProvisioningError('INVALID_INPUT',
        'The server rejected this password. Choose a new, unique password.');
    }
    throw new ProvisioningError('UNCONFIRMED',
      'The account request was not confirmed. Check its status before submitting again.');
  }
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null;
  const user = data?.user && typeof data.user === 'object' ? data.user as Record<string, unknown> : null;
  if (data?.success !== true || !user || !uuidPattern.test(String(user.id ?? ''))
    || String(user.email ?? '').trim().toLowerCase() !== email) {
    throw new ProvisioningError('UNCONFIRMED',
      'The server returned an incomplete result. Check the real directory before submitting again.');
  }
  return { userId: String(user.id), email, employeeId: employee.id, roleId };
}
