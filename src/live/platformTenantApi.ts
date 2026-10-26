import { supabase } from '../lib/supabase';

// Protected platform tenant administration RPC contract.
export const platformTenantFeatureAvailable =
  import.meta.env.VITE_ENABLE_PLATFORM_TENANTS === 'true';
export type PlatformTenant = {
  id: string; code: string; slug: string; name: string;
  is_active: boolean; timezone: string;
  default_locale: 'en' | 'bn' | null; active_admin_count: number;
};
export type PlatformTenantCertification = {
  tenant_id: string;
  tenant_name: string;
  is_active: boolean;
  certification_status: 'pending' | 'certified' | 'not_required';
  evidence_reference: string | null;
  certified_at: string | null;
  can_certify: boolean;
};
export type TenantOptionalModuleKey = 'travel' | 'expenses' | 'learning';
export type TenantOptionalModule = {
  module_key: TenantOptionalModuleKey;
  enabled: boolean;
  updated_at: string | null;
};
export type ProvisionTenantInput = {
  code: string; slug: string; name: string; timezone: string;
  defaultLocale: 'en' | 'bn'; existingAdminUserId: string;
};
export type ProvisionTenantByEmailInput = {
  code: string; slug: string; name: string; timezone: string;
  defaultLocale: 'en' | 'bn'; existingAdminEmail: string;
};
export type PlatformTenantInvitationInput = {
  code: string; slug: string; name: string; timezone: string;
  defaultLocale: 'en' | 'bn'; email: string;
};
export type AcceptedPlatformTenantInvitation = {
  tenant_id: string;
  tenant_name: string;
  is_active: boolean;
  accepted: true;
};
function requireStagingFeature() {
  if (!platformTenantFeatureAvailable) throw new Error('Platform tenant administration is not activated for this deployment.');
}
export async function isPlatformSuperAdmin(): Promise<boolean> {
  if (!platformTenantFeatureAvailable) return false;
  const {data,error} = await supabase.rpc('platform_hris_is_super_admin');
  if (error) throw error;
  return data === true;
}
export async function listPlatformTenants(): Promise<PlatformTenant[]> {
  requireStagingFeature();
  const {data,error} = await supabase.rpc('platform_hris_list_tenants');
  if (error) throw error;
  return (data ?? []) as PlatformTenant[];
}
export async function listPlatformTenantCertifications(): Promise<PlatformTenantCertification[]> {
  requireStagingFeature();
  const { data, error } = await supabase.rpc('platform_hris_list_tenant_certifications');
  if (error) throw error;
  if (!Array.isArray(data) || data.some(record =>
    typeof record.tenant_id !== 'string' || typeof record.tenant_name !== 'string'
    || typeof record.is_active !== 'boolean'
    || !['pending', 'certified', 'not_required'].includes(record.certification_status)
    || (record.evidence_reference !== null && typeof record.evidence_reference !== 'string')
    || (record.certified_at !== null && typeof record.certified_at !== 'string')
    || typeof record.can_certify !== 'boolean')) {
    throw new Error('Tenant security certification status returned an invalid response.');
  }
  return data as PlatformTenantCertification[];
}
export async function certifyAndActivatePlatformTenant(
  tenantId: string, evidenceReference: string, securitySignoffComplete: boolean,
): Promise<void> {
  requireStagingFeature();
  const { data, error } = await supabase.rpc('platform_hris_certify_and_activate_tenant', {
    p_tenant_id: tenantId,
    p_security_signoff_complete: securitySignoffComplete,
    p_evidence_reference: evidenceReference.trim(),
  });
  if (error) throw error;
  if (!data || typeof data !== 'object'
    || data.tenant_id !== tenantId || data.is_active !== true
    || typeof data.certified_at !== 'string') {
    throw new Error('Tenant activation returned an invalid certification response.');
  }
}

export async function provisionPlatformTenant(input: ProvisionTenantInput): Promise<string> {
  requireStagingFeature();
  const {data,error} = await supabase.rpc('platform_hris_provision_tenant', {
    p_code: input.code, p_slug: input.slug, p_name: input.name,
    p_timezone: input.timezone, p_default_locale: input.defaultLocale,
    p_admin_user_id: input.existingAdminUserId,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Tenant creation did not return a tenant ID.');
  return data;
}
export async function provisionPlatformTenantByEmail(input: ProvisionTenantByEmailInput): Promise<string> {
  requireStagingFeature();
  const {data,error} = await supabase.rpc('platform_hris_provision_tenant_by_email', {
    p_code: input.code, p_slug: input.slug, p_name: input.name,
    p_timezone: input.timezone, p_default_locale: input.defaultLocale,
    p_admin_email: input.existingAdminEmail.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Tenant creation did not return a tenant ID.');
  return data;
}
export async function invitePlatformTenantAdministrator(input: PlatformTenantInvitationInput): Promise<void> {
  requireStagingFeature();
  const { data, error } = await supabase.functions.invoke('platform-tenant-invite', {
    body: {
      code: input.code,
      slug: input.slug,
      name: input.name,
      timezone: input.timezone,
      defaultLocale: input.defaultLocale,
      email: input.email.trim(),
    },
  });
  if (error) throw error;
  if (!data || data.success !== true || typeof data.invitation_id !== 'string') {
    throw new Error(typeof data?.error === 'string'
      ? data.error
      : 'The administrator invitation could not be sent.');
  }
}
export async function acceptPlatformTenantInvitation(
  invitationId: string,
): Promise<AcceptedPlatformTenantInvitation> {
  const { data, error } = await supabase.rpc('platform_hris_accept_tenant_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object'
    || typeof data.tenant_id !== 'string'
    || typeof data.tenant_name !== 'string'
    || typeof data.is_active !== 'boolean'
    || data.accepted !== true) {
    throw new Error('The invitation response was incomplete.');
  }
  return data as AcceptedPlatformTenantInvitation;
}
export async function updatePlatformTenantMetadata(
 id: string, name: string, timezone: string, defaultLocale: 'en'|'bn'
): Promise<void> {
  requireStagingFeature();
  const {error} = await supabase.rpc('platform_hris_update_tenant_metadata', {
    p_tenant_id:id,p_name:name,p_timezone:timezone,p_default_locale:defaultLocale,
  });
  if(error) throw error;
}
export async function setPlatformTenantAdministrator(
 tenantId:string,existingUserId:string,enabled:boolean
):Promise<void> {
  requireStagingFeature();
  const {error}=await supabase.rpc('platform_hris_set_tenant_admin',{
    p_tenant_id:tenantId,p_user_id:existingUserId,p_enabled:enabled,
  });
  if(error) throw error;
}
export async function setPlatformTenantAdministratorByEmail(
 tenantId:string,adminEmail:string,enabled:boolean
):Promise<void> {
  requireStagingFeature();
  const {error}=await supabase.rpc('platform_hris_set_tenant_admin_by_email',{
    p_tenant_id:tenantId,p_admin_email:adminEmail.trim(),p_enabled:enabled,
  });
  if(error) throw error;
}

export async function listPlatformTenantModules(tenantId: string): Promise<TenantOptionalModule[]> {
  requireStagingFeature();
  const { data, error } = await supabase.rpc('platform_hris_list_tenant_modules', {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 3 || data.some(module =>
    !['travel', 'expenses', 'learning'].includes(module.module_key) ||
    typeof module.enabled !== 'boolean')) {
    throw new Error('Tenant module configuration returned an invalid response.');
  }
  return data as TenantOptionalModule[];
}

export async function setPlatformTenantModule(
  tenantId: string, moduleKey: TenantOptionalModuleKey, enabled: boolean,
): Promise<void> {
  requireStagingFeature();
  const { error } = await supabase.rpc('platform_hris_set_tenant_module', {
    p_tenant_id: tenantId, p_module_key: moduleKey, p_enabled: enabled,
  });
  if (error) throw error;
}
