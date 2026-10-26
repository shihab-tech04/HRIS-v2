import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

type InviteBody = {
  tenant_id?: unknown;
  request_id?: unknown;
  employee_number?: unknown;
  full_name?: unknown;
  email?: unknown;
  joining_date?: unknown;
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

function reply(status: number, body: Record<string, unknown>, origin: string | null): Response {
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
    return reply(401, { error: "A signed-in HRIS session is required." }, origin);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) {
    return reply(401, { error: "A signed-in HRIS session is required." }, origin);
  }

  let body: InviteBody;
  try {
    body = await request.json() as InviteBody;
  } catch {
    return reply(400, { error: "A valid employee invitation request is required." }, origin);
  }
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const employeeNumber = typeof body.employee_number === "string" ? body.employee_number.trim() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const joiningDate = typeof body.joining_date === "string" ? body.joining_date : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    || !isText(employeeNumber, 32)
    || !isText(fullName, 160) || fullName.length < 2
    || !isText(email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
    return reply(400, { error: "Enter a valid employee number, name, email, and joining date." }, origin);
  }

  const { data: invitation, error: createError } = await caller.rpc("hris_create_employee_invitation", {
    p_tenant_id: tenantId,
    p_request_id: requestId,
    p_employee_number: employeeNumber,
    p_full_name: fullName,
    p_email: email,
    p_joining_date: joiningDate,
  });
  if (createError) {
    const status = createError.code === "42501" ? 403 : 400;
    return reply(status, {
      error: status === 403
        ? "Employee-management access for this organization is required."
        : createError.message,
    }, origin);
  }

  const invitationId = invitation?.invitation_id;
  const invitedEmail = invitation?.email;
  const invitationStatus = invitation?.status;
  if (typeof invitationId !== "string" || typeof invitedEmail !== "string"
    || typeof invitationStatus !== "string") {
    return reply(500, { error: "The employee record was saved, but the invitation could not be finalized." }, origin);
  }
  if (invitationStatus === "sent" || invitationStatus === "accepted") {
    return reply(200, { success: true, invitation_id: invitationId, already_sent: true }, origin);
  }
  if (invitationStatus !== "pending" && invitationStatus !== "failed") {
    return reply(409, { error: "This invitation cannot be sent in its current state." }, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectTo = new URL("https://shihab-tech04.github.io/HRIS-v2/");
  redirectTo.searchParams.set("employee_invitation", invitationId);
  const { data: sent, error: sendError } = await admin.auth.admin.inviteUserByEmail(invitedEmail, {
    redirectTo: redirectTo.toString(),
  });
  if (sendError || !sent.user?.id) {
    await admin.rpc("hris_mark_employee_invitation_failed", { p_invitation_id: invitationId });
    return reply(502, {
      error: "The employee record was saved, but the invitation email could not be sent. Check Auth email delivery before retrying.",
    }, origin);
  }

  const { error: markError } = await admin.rpc("hris_mark_employee_invitation_sent", {
    p_invitation_id: invitationId,
    p_auth_user_id: sent.user.id,
  });
  if (markError) {
    return reply(502, {
      error: "The invitation email was submitted, but employee activation could not be finalized. Contact HRIS support before retrying.",
    }, origin);
  }

  return reply(200, { success: true, invitation_id: invitationId, already_sent: false }, origin);
});
