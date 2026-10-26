import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

type InviteBody = {
  mode?: unknown;
  tenant_id?: unknown;
  request_id?: unknown;
  employee_id?: unknown;
  invitation_id?: unknown;
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
  const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
  const resumeInvitationId = typeof body.invitation_id === "string" ? body.invitation_id : "";
  const employeeNumber = typeof body.employee_number === "string" ? body.employee_number.trim() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const joiningDate = typeof body.joining_date === "string" ? body.joining_date : "";
  const isResend = body.mode === "resend";
  const isResume = body.mode === "resume";
  const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if ((body.mode !== undefined && body.mode !== "create" && !isResend && !isResume)
    || !validUuid(tenantId)
    || (!isResume && !validUuid(requestId))
    || (isResend && !validUuid(employeeId))
    || (isResume && !validUuid(resumeInvitationId))
    || (!isResend && !isResume
      && (!isText(employeeNumber, 32)
        || !isText(fullName, 160) || fullName.length < 2
        || !isText(email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)))) {
    return reply(400, {
      error: isResend || isResume
        ? "A valid employee invitation request is required."
        : "Enter a valid employee number, name, email, and joining date.",
    }, origin);
  }

  const { data: invitation, error: createError } = isResume
    ? await caller.rpc("hris_resume_employee_invitation", {
      p_tenant_id: tenantId,
      p_invitation_id: resumeInvitationId,
    })
    : isResend
      ? await caller.rpc("hris_reissue_employee_invitation", {
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
        p_request_id: requestId,
      })
      : await caller.rpc("hris_create_employee_invitation", {
        p_tenant_id: tenantId,
        p_request_id: requestId,
        p_employee_number: employeeNumber,
        p_full_name: fullName,
        p_email: email,
        p_joining_date: joiningDate,
      });
  if (createError) {
    const status = createError.code === "42501" ? 403 : 400;
    const retryMessage = createError.message || "";
    const safeRetryError = /15 minutes/i.test(retryMessage)
      ? "This invitation cannot be retried yet. Wait 15 minutes before trying again."
      : /retry limit/i.test(retryMessage)
        ? "This invitation reached its delivery retry limit. Contact your platform administrator."
        : isResume
          ? "This invitation is no longer available to resume. Refresh the directory or contact your organization administrator."
          : isResend
            ? "This invitation cannot be reissued yet. Refresh the directory or wait before trying again."
            : createError.message;
    return reply(status, {
      error: status === 403 && !isResume
        ? "Employee-management access for this organization is required."
        : safeRetryError,
    }, origin);
  }

  const invitationId = invitation?.invitation_id;
  const invitedEmail = invitation?.email;
  const invitationStatus = invitation?.status;
  const effectiveRequestId = isResume ? invitation?.request_id : requestId;
  if (typeof invitationId !== "string" || typeof invitedEmail !== "string"
    || typeof invitationStatus !== "string"
    || typeof effectiveRequestId !== "string" || !validUuid(effectiveRequestId)) {
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
  const { data: recoveredAuthUserId, error: recoveryError } = await admin.rpc(
    "hris_recover_employee_invitation_auth_user_id",
    { p_invitation_id: invitationId },
  );
  if (recoveryError) {
    return reply(502, {
      error: "Invitation delivery status could not be checked. Retry this same invitation; do not create a new request.",
    }, origin);
  }
  if (typeof recoveredAuthUserId === "string") {
    const { error: recoveryMarkError } = await admin.rpc("hris_mark_employee_invitation_sent", {
      p_invitation_id: invitationId,
      p_auth_user_id: recoveredAuthUserId,
    });
    if (recoveryMarkError) {
      return reply(502, {
        error: "The invitation email was already submitted, but activation could not be finalized. Retry this same invitation.",
      }, origin);
    }
    return reply(200, { success: true, invitation_id: invitationId, already_sent: true }, origin);
  }

  const redirectTo = new URL("https://shihab-tech04.github.io/HRIS-v2/");
  redirectTo.searchParams.set("employee_invitation", invitationId);

  let authUserId: string | null = null;
  const { data: sent, error: sendError } = await admin.auth.admin.inviteUserByEmail(invitedEmail, {
    redirectTo: redirectTo.toString(),
  });
  if (!sendError && sent.user?.id) {
    authUserId = sent.user.id;
  } else {
    const duplicateConfirmedEmail = Boolean(sendError)
      && (sendError.code === "email_exists"
        || /already registered|email address.*exists/i.test(sendError.message || ""));
    if (duplicateConfirmedEmail) {
      // A previously invited employee may have confirmed the email but not
      // completed membership activation. Auth no longer sends another invite to
      // a confirmed identity, so send a passwordless sign-in link instead.
      const linkSender = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const emailLink = await linkSender.auth.signInWithOtp({
        email: invitedEmail,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo.toString() },
      });
      if (!emailLink.error) {
        const resolved = await admin.rpc(
          "hris_resolve_employee_invitation_auth_user_id",
          { p_invitation_id: invitationId },
        );
        if (!resolved.error && typeof resolved.data === "string") authUserId = resolved.data;
      }
    }
    if (!authUserId) {
      await admin.rpc("hris_mark_employee_invitation_failed", { p_invitation_id: invitationId });
      return reply(502, {
        error: "The employee record was saved, but the invitation email could not be sent. Check Auth email delivery before retrying.",
      }, origin);
    }
  }

  const authUser = await admin.auth.admin.getUserById(authUserId);
  if (authUser.error || authUser.data.user?.id !== authUserId) {
    return reply(502, {
      error: "The invitation email was submitted, but its delivery could not be safely finalized. Retry this same invitation.",
    }, origin);
  }
  const taggedUser = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      ...(authUser.data.user.app_metadata || {}),
      hris_employee_invitation_request_id: effectiveRequestId,
    },
  });
  if (taggedUser.error || taggedUser.data.user?.id !== authUserId) {
    return reply(502, {
      error: "The invitation email was submitted, but its delivery could not be safely finalized. Retry this same invitation.",
    }, origin);
  }

  let { error: markError } = await admin.rpc("hris_mark_employee_invitation_sent", {
    p_invitation_id: invitationId,
    p_auth_user_id: authUserId,
  });
  if (markError) {
    // Auth and Postgres cannot commit atomically. Retry the idempotent ledger
    // write so a transient response/database error does not strand the invite.
    const retryMark = await admin.rpc("hris_mark_employee_invitation_sent", {
      p_invitation_id: invitationId,
      p_auth_user_id: authUserId,
    });
    markError = retryMark.error;
  }
  if (markError) {
    return reply(502, {
      error: "The invitation email was submitted, but activation could not be finalized. Retry this same invitation; the service can recover the Auth identity safely.",
    }, origin);
  }

  return reply(200, { success: true, invitation_id: invitationId, already_sent: false }, origin);
});
