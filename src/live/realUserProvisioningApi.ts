import { supabase } from '../lib/supabase';

// Authorized SQL-backed user management. Never use synthetic preview data for writes.
// This creates a password-based account linked to an eligible existing employee.
export type ProvisionableRole = { id: string; name: string; description: string };
export type UnlinkedEmployee = {
  id: string; employee_number: string; full_name: string; official_email: string;
};
export type RealProvisioningReadiness = {
  tenantId: string; isSuperAdmin: boolean;
  assignableRoles: ProvisionableRole[]; availableEmployees: UnlinkedEmployee[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The server returned an invalid provisioning response.');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The server returned incomplete provisioning details.');
  }
  return value.trim();
}

function parseRoles(input: unknown): ProvisionableRole[] {
  if (!Array.isArray(input)) throw new Error('Assignable roles could not be verified.');
  return input.map(value => {
    const item = record(value);
    return {
      id: requiredString(item.id),
      name: requiredString(item.name),
      description: typeof item.description === 'string' ? item.description : '',
    };
  });
}

function parseEmployees(input: unknown): UnlinkedEmployee[] {
  if (!Array.isArray(input)) throw new Error('Eligible employees could not be verified.');
  return input.map(value => {
    const item = record(value);
    const id = requiredString(item.id);
    if (!uuidPattern.test(id)) throw new Error('The server returned an invalid employee identity.');
    return {
      id,
      employee_number: requiredString(item.employee_number),
      full_name: requiredString(item.full_name),
      official_email: requiredString(item.official_email),
    };
  });
}

export async function loadRealProvisioningReadiness(tenantId: string): Promise<RealProvisioningReadiness> {
  if (!uuidPattern.test(tenantId)) throw new Error('Select a valid organization.');
  // The explicit tenant check must not be substituted with an unscoped UI role.
  const access = await supabase.rpc('has_tenant_permission', {
    p_tenant_id: tenantId,
    p_permission_id: 'admin_users.manage',
  });
  if (access.error) throw new Error('Administrative access could not be verified. Retry.');
  if (access.data !== true) throw new Error('You are not authorized to manage users in this organization.');

  // This legacy RPC uses an implicit tenant context; refuse multi-tenant ambiguity.
  const scope = await supabase.rpc('synesis_tenant_id');
  if (scope.error || scope.data !== tenantId) {
    throw new Error('Selected organization cannot be matched to the server session. No user data was loaded.');
  }

  const response = await supabase.rpc('admin_get_my_provisioning_context');
  if (response.error) throw new Error('Provisioning context is unavailable or access was revoked. Retry.');
  const context = record(response.data);
  if (context.can_manage !== true || typeof context.is_super_admin !== 'boolean') {
    throw new Error('The server did not confirm user-management permission.');
  }
  return {
    tenantId,
    isSuperAdmin: context.is_super_admin,
    assignableRoles: parseRoles(context.assignable_roles),
    availableEmployees: parseEmployees(context.available_employees),
  };
}

export type CreatedUser = { id: string; email: string };

export async function createRealUserAccount(input: {
  tenantId: string; employeeId: string; roleId: string; email: string; password: string;
}): Promise<CreatedUser> {
  const email = input.email.trim().toLowerCase();
  if (!uuidPattern.test(input.tenantId) || !uuidPattern.test(input.employeeId)) {
    throw new Error('Select a valid organization and employee.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (input.password.length < 12) {
    throw new Error('Initial password must contain at least 12 characters.');
  }

  // Revalidate the selected tenant and the permitted employee/role immediately
  // before submission. The Edge Function independently repeats these checks.
  const context = await loadRealProvisioningReadiness(input.tenantId);
  if (!context.assignableRoles.some(role => role.id === input.roleId)) {
    throw new Error('The selected role is no longer assignable.');
  }
  if (!context.availableEmployees.some(employee => employee.id === input.employeeId)) {
    throw new Error('The selected employee is no longer eligible for an account.');
  }

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      roleId: input.roleId,
      email,
      password: input.password,
    },
  });
  if (error) {
    let message = 'Account creation could not be confirmed. Refresh the employee list before retrying.';
    const response = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (response && typeof response.json === 'function') {
      const details = await response.json().catch(() => null);
      if (details && typeof details === 'object' && !Array.isArray(details)) {
        const serverMessage = (details as Record<string, unknown>).error;
        if (typeof serverMessage === 'string' && serverMessage.trim()) message = serverMessage;
      }
    }
    throw new Error(message);
  }
  const result = record(data);
  if (result.success !== true) {
    throw new Error('Server did not confirm account creation. Refresh before retrying.');
  }
  const user = record(result.user);
  return { id: requiredString(user.id), email: requiredString(user.email) };
}
