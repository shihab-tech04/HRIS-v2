import { supabase } from '../lib/supabase';

// Browser-only client for platform tenant administration; writes are authorized by protected RPCs.
export const platformTenantFeatureAvailable =
  import.meta.env.VITE_ENABLE_PLATFORM_TENANTS === 'true';
export type PlatformTenant = {
  id: string; code: string; slug: string; name: string;
  is_active: boolean; timezone: string;
  default_locale: 'en' | 'bn' | null; active_admin_count: number;
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
