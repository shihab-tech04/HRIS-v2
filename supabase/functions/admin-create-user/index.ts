// Single-auth owner policy: existing SQL-backed Super Admin is the only
// identity permitted. This fail-closed policy is not a runtime toggle.
function additionalAuthProvisioningDisabled(): boolean {
  return true;
}

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

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function isCompromisedPassword(password: string) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    method: "GET",
    headers: {
      "Accept": "text/plain",
      "Add-Padding": "true",
      "User-Agent": "Synesis-HRIS-Admin-Password-Safety/1.0",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("PASSWORD_REPUTATION_UNAVAILABLE");
  const body = await response.text();
  return body.split(/\r?\n/).some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
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

  // SINGLE_SUPER_ADMIN_LOGIN_ONLY: do not create an Auth identity, nor
  // call a provisioning RPC that could create one indirectly.
  if (additionalAuthProvisioningDisabled()) {
    return new Response(JSON.stringify({
      error: "Additional authentication accounts are disabled for this HRIS.",
    }), {
      status: 403,
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

  const { data: provisioning, error: provisioningError } =
    await userClient.rpc("admin_get_my_provisioning_context");

  if (provisioningError || !provisioning?.can_manage) {
    return new Response(
      JSON.stringify({
        error: "Administrator management permission required.",
        code: "ADMIN_MANAGE_REQUIRED",
      }),
      {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const roleId = String(body.roleId || "").trim();
  const employeeId = String(body.employeeId || "").trim();

  if (!email || !password || !roleId || !employeeId) {
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

  try {
    if (await isCompromisedPassword(password)) {
      return new Response(JSON.stringify({ error: "This password has appeared in a known data breach. Choose a different password." }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      error: "Password safety verification is temporarily unavailable. Please try again.",
      code: error instanceof Error ? error.message : "PASSWORD_REPUTATION_UNAVAILABLE",
    }), {
      status: 503,
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

  const employee = Array.isArray(provisioning.available_employees)
    ? provisioning.available_employees.find((item: { id?: string }) => item.id === employeeId)
    : null;

  if (!employee) {
    return new Response(JSON.stringify({ error: "Selected employee is unavailable or already has a user account." }), {
      status: 409,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const displayName = String(employee.full_name || "").trim();
  if (!displayName) {
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
    "admin_finalize_system_user",
    {
      p_actor_id: userData.user.id,
      p_user_id: created.user.id,
      p_email: email,
      p_employee_id: employeeId,
      p_role_id: roleId,
    }
  );

  if (finalizeError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({ error: finalizeError.message || "User provisioning could not be finalized." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, user: { id: created.user.id, email }, registry: finalized }), {
    status: 201,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
