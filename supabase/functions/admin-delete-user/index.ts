// Current HRIS owner rule: exactly one existing SQL-backed Super Admin login.
// Removing Auth identities is disabled, and is not a runtime toggle.
function authDeletionDisabled(): boolean {
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

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // SINGLE_SUPER_ADMIN_LOGIN_ONLY: preserve the sole Auth identity.
  if (authDeletionDisabled()) {
    return new Response(JSON.stringify({
      error: "Removing HRIS authentication accounts is disabled.",
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
    return new Response(JSON.stringify({
      error: "Administrator management permission required.",
      code: "ADMIN_MANAGE_REQUIRED",
    }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const targetUserId = String(body.userId || "").trim();

  if (!targetUserId) {
    return new Response(JSON.stringify({ error: "Administrator user ID is required." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  if (targetUserId === userData.user.id) {
    return new Response(JSON.stringify({ error: "You cannot remove your own administrative account." }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: registryError } = await adminClient.rpc("admin_remove_provisioned_user", {
    p_actor_id: userData.user.id,
    p_user_id: targetUserId,
  });

  if (registryError) {
    return new Response(JSON.stringify({ error: registryError.message }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    return new Response(JSON.stringify({
      error: "Administrative access was removed, but the Auth record could not be deleted. Contact the Super Administrator to retry cleanup.",
      detail: deleteError.message,
    }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, userId: targetUserId }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
});
