import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ALLOWED_ORIGINS = new Set([
  "https://shihabshajib01-cell.github.io",
  "https://shihab-tech04.github.io",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const tenantId = String(body.tenantId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return new Response(JSON.stringify({ error: "Select a valid organization." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // The current provisioning RPC is tied to Synesis. Do not authorize the
  // chosen organization from browser state or a global role alone.
  const { data: tenantAllowed, error: tenantAccessError } = await userClient.rpc(
    "has_tenant_permission",
    { p_tenant_id: tenantId, p_permission_id: "admin_users.manage" },
  );
  if (tenantAccessError || tenantAllowed !== true) {
    return new Response(JSON.stringify({ error: "User management permission required for this organization." }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const { data: canonicalTenantId, error: tenantScopeError } = await userClient.rpc("synesis_tenant_id");
  if (tenantScopeError || canonicalTenantId !== tenantId) {
    return new Response(JSON.stringify({ error: "This organization is not supported by the current provisioning contract." }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { data: provisioning, error: provisioningError } =
    await userClient.rpc("admin_get_my_provisioning_context");
  if (provisioningError || provisioning?.can_manage !== true) {
    return new Response(JSON.stringify({
      error: "Administrator management permission required.",
      code: "ADMIN_MANAGE_REQUIRED",
    }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const roleId = String(body.roleId || "").trim();
  const createNewEmployee = body.createNewEmployee === true;
  const employeeId = String(body.employeeId || "").trim().toLowerCase();
  const enteredName = String(body.displayName || "").trim();

  if (!email || !password || !roleId || (!createNewEmployee && !employeeId)) {
    return new Response(JSON.stringify({ error: "Employee, email, password, and role are required." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "A valid email address is required." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (password.length < 12) {
    return new Response(JSON.stringify({ error: "Initial password must be at least 12 characters." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const assignable = Array.isArray(provisioning.assignable_roles)
    ? provisioning.assignable_roles.some((role: { id?: string }) => role.id === roleId)
    : false;

  if (!assignable) {
    return new Response(JSON.stringify({ error: "Selected role is not assignable by this administrator." }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const employee = !createNewEmployee && Array.isArray(provisioning.available_employees)
    ? provisioning.available_employees.find((item: { id?: string }) => item.id === employeeId)
    : null;

  if (!createNewEmployee && !employee) {
    return new Response(JSON.stringify({ error: "Selected employee is unavailable or already has a user account." }), {
      status: 409,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const displayName = createNewEmployee ? enteredName : String(employee?.full_name || "").trim();
  if (displayName.length < 2 || displayName.length > 200) {
    return new Response(JSON.stringify({ error: "Selected employee does not have a valid name." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { account_type: "workforce" },
  });

  if (createError || !created.user) {
    const message = createError?.message || "Could not create user account.";
    const duplicate = /already|duplicate|registered/i.test(message);
    return new Response(JSON.stringify({
      error: duplicate ? "An account with this email already exists." : message,
    }), {
      status: duplicate ? 409 : 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { data: finalized, error: finalizeError } = await adminClient.rpc(
    createNewEmployee ? "admin_finalize_new_workforce_user" : "admin_finalize_system_user",
    createNewEmployee
      ? {
          p_actor_id: userData.user.id,
          p_user_id: created.user.id,
          p_tenant_id: tenantId,
          p_email: email,
          p_display_name: displayName,
          p_role_id: roleId,
        }
      : {
          p_actor_id: userData.user.id,
          p_user_id: created.user.id,
          p_email: email,
          p_employee_id: employeeId,
          p_role_id: roleId,
        }
  );

  if (
    finalizeError ||
    finalized?.success !== true ||
    finalized?.tenant_id !== tenantId ||
    (!createNewEmployee && finalized?.employee_id !== employeeId) ||
    (createNewEmployee && !finalized?.employee_id) ||
    finalized?.role_id !== roleId
  ) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (rollbackError) {
      console.error("HRIS user provisioning cleanup failed", { userId: created.user.id, code: rollbackError.code });
      return new Response(JSON.stringify({
        error: "User creation did not finish and automatic cleanup failed. Contact the administrator before retrying.",
        code: "USER_PROVISIONING_ROLLBACK_FAILED",
      }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: finalizeError?.message || "User provisioning could not be finalized." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, user: { id: created.user.id, email }, registry: finalized }), {
    status: 201,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
