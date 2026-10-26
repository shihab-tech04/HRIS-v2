import { supabase } from '../lib/supabase';

export type CreateEmployeeInvitationInput = {
  tenantId: string;
  requestId: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  joiningDate: string;
};

export type AcceptedEmployeeInvitation = {
  accepted: true;
  tenant_id: string;
  tenant_name: string;
  employee_id: string;
  idempotent: boolean;
};

export async function createEmployeeInvitation(input: CreateEmployeeInvitationInput): Promise<{
  invitationId: string;
  alreadySent: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('hris-employee-invite', {
    body: {
      tenant_id: input.tenantId,
      request_id: input.requestId,
      employee_number: input.employeeNumber.trim(),
      full_name: input.fullName.trim(),
      email: input.email.trim(),
      joining_date: input.joiningDate,
    },
  });
  if (error) throw error;
  if (!data || data.success !== true || typeof data.invitation_id !== 'string'
    || (data.already_sent !== true && data.already_sent !== false)) {
    throw new Error(typeof data?.error === 'string'
      ? data.error
      : 'The employee invitation could not be sent.');
  }
  return { invitationId: data.invitation_id, alreadySent: data.already_sent };
}


export type ReissueEmployeeInvitationInput = {
  tenantId: string;
  employeeId: string;
  requestId: string;
};

export async function reissueEmployeeInvitation(input: ReissueEmployeeInvitationInput): Promise<{
  invitationId: string;
  alreadySent: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('hris-employee-invite', {
    body: {
      mode: 'resend',
      tenant_id: input.tenantId,
      employee_id: input.employeeId,
      request_id: input.requestId,
    },
  });
  if (error) throw error;
  if (!data || data.success !== true || typeof data.invitation_id !== 'string'
    || (data.already_sent !== true && data.already_sent !== false)) {
    throw new Error('The employee invitation could not be reissued.');
  }
  return { invitationId: data.invitation_id, alreadySent: data.already_sent };
}


export type ResumeEmployeeInvitationInput = {
  tenantId: string;
  invitationId: string;
};

export async function resumeEmployeeInvitation(input: ResumeEmployeeInvitationInput): Promise<{
  invitationId: string;
  alreadySent: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('hris-employee-invite', {
    body: {
      mode: 'resume',
      tenant_id: input.tenantId,
      invitation_id: input.invitationId,
    },
  });
  if (error) throw error;
  if (!data || data.success !== true || typeof data.invitation_id !== 'string'
    || (data.already_sent !== true && data.already_sent !== false)) {
    throw new Error(typeof data?.error === 'string'
      ? data.error
      : 'The employee invitation could not be resumed.');
  }
  return { invitationId: data.invitation_id, alreadySent: data.already_sent };
}

export async function acceptEmployeeInvitation(
  invitationId: string,
): Promise<AcceptedEmployeeInvitation> {
  const { data, error } = await supabase.rpc('hris_accept_employee_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object'
    || data.accepted !== true
    || typeof data.tenant_id !== 'string'
    || typeof data.tenant_name !== 'string'
    || typeof data.employee_id !== 'string'
    || typeof data.idempotent !== 'boolean') {
    throw new Error('The employee invitation response was incomplete.');
  }
  return data as AcceptedEmployeeInvitation;
}
