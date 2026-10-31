/**
 * Build only the exact arguments supported by the verified deployed
 * admin_save_department / admin_save_team RPCs. Tenant identity is resolved
 * by the server, never supplied in an editable payload.
 *
 * @param {{name:string,code:string,description:string,locationId:string,active:boolean}} draft
 */
export function departmentSavePayload(draft) {
  const name = draft.name.trim();
  const code = draft.code.trim().toUpperCase();
  if (!name || !code) throw new Error('Department name and code are required.');
  return {
    name, code,
    description: draft.description.trim() || null,
    location_id: draft.locationId || null,
    active: draft.active === true,
  };
}

/**
 * @param {{name:string,code:string,departmentId:string,active:boolean}} draft
 */
export function teamSavePayload(draft) {
  const name = draft.name.trim();
  const code = draft.code.trim().toUpperCase();
  if (!name || !code || !draft.departmentId) {
    throw new Error('Team name, code, and department are required.');
  }
  return { name, code, department_id: draft.departmentId, active: draft.active === true };
}

/** The existing RPCs accept only the one unambiguous auth-derived tenant. */
export function mayWriteSelectedTenant(permission, resolvedTenantId, selectedTenantId) {
  return permission === true && typeof resolvedTenantId === 'string'
    && resolvedTenantId.length > 0 && resolvedTenantId === selectedTenantId;
}
