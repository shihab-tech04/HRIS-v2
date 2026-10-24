import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

type InviteBody = {
  code?: unknown;
  slug?: unknown;
  name?: unknown;
  timezone?: unknown;
  defaultLocale?: unknown;
  email?: unknown;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = new Set([
  "https://shihab-tech04.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function reply(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." }, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return reply(500, { error: "Invitation service is not configured." }, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length < 32) {
    return reply(401, { error: "A signed-in Super Admin session is required." }, origin);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) {
    return reply(401, { error: "A signed-in Super Admin session is required." }, origin);
  }
  const { data: isSuperAdmin, error: accessError } = await caller.rpc("platform_hris_is_super_admin");
  if (accessError || isSuperAdmin !== true) {
    return reply(403, { error: "Active platform Super Admin access is required." }, origin);
  }

  let body: InviteBody;
  try {
    body = await request.json() as InviteBody;
  } catch {
    return reply(400, { error: "A valid JSON invitation request is required." }, origin);
  }
  if (!isText(body.code, 24) || !isText(body.slug, 80) || !isText(body.name, 180)
    || !isText(body.timezone, 120) || !isText(body.email, 320)
    || (body.defaultLocale !== "en" && body.defaultLocale !== "bn")) {
    return reply(400, { error: "Complete the tenant and administrator details before sending the invitation." }, origin);
  }

  const { data: invitation, error: createError } = await caller.rpc("platform_hris_create_tenant_invitation", {
    p_code: body.code,
    p_slug: body.slug,
    p_name: body.name,
    p_timezone: body.timezone,
    p_default_locale: body.defaultLocale,
    p_admin_email: body.email,
  });
  if (createError) {
    const status = createError.code === "42501" ? 403 : 400;
    return reply(status, { error: createError.message }, origin);
  }
  const invitationId = invitation?.invitation_id;
  const inviteEmail = invitation?.email;
  if (typeof invitationId !== "string" || typeof inviteEmail !== "string") {
    return reply(500, { error: "The invitation request could not be finalized." }, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectTo = new URL("https://shihab-tech04.github.io/HRIS-v2/");
  redirectTo.searchParams.set("platform_invitation", invitationId);
  const { data: sent, error: sendError } = await admin.auth.admin.inviteUserByEmail(inviteEmail, {
    redirectTo: redirectTo.toString(),
  });
  if (sendError || !sent.user?.id) {
    await admin.rpc("platform_hris_mark_tenant_invitation_failed", {
      p_invitation_id: invitationId,
    });
    return reply(502, {
      error: "The invitation email could not be sent. Check Auth email delivery before retrying.",
    }, origin);
  }

  const { error: markError } = await admin.rpc("platform_hris_mark_tenant_invitation_sent", {
    p_invitation_id: invitationId,
    p_auth_user_id: sent.user.id,
  });
  if (markError) {
    return reply(502, {
      error: "The invitation email was submitted, but provisioning could not be finalized. Contact platform support before retrying.",
    }, origin);
  }

  return reply(200, {
    success: true,
    invitation_id: invitationId,
    expires_at: invitation.expires_at,
  }, origin);
});
