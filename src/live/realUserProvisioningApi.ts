import { supabase } from '../lib/supabase';

// WS08 REAL_AUTH_SQL read-only adapter. Do not import syntheticUserPreview here.
// The existing password-based admin-create-user is NOT an invitation API.
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
