import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, Pencil, RefreshCw, Save, Search, UserPlus, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createEmployeeInvitation, reissueEmployeeInvitation, resumeEmployeeInvitation } from './employeeInvitationApi';
import { downloadCsv } from './csv';
import { projectText, type Locale } from './project-locale';
import { activateModalFocusTrap } from './modal-focus';

type EmployeeRow = {
  employee_id: string;
  employee_number: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  designation_title: string | null;
  team_name: string | null;
  employment_status: string;
  invitation?: { id: string; status: string; expires_at: string } | null;
};
type DirectoryPayload = {
  employees?: EmployeeRow[];
  departments?: { id: string; name: string }[];
  teams?: { id: string; name: string; department_id: string | null }[];
  available_statuses?: string[];
  total_count?: number;
};
type EmployeeContactDetails = {
  employee_id: string;
  official_email: string;
  personal_email: string | null;
  phone: string | null;
  official_phone: string | null;
  address: string | null;
  mailing_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
};
type ContactDraft = Omit<EmployeeContactDetails, 'employee_id'>;
type ContactMode = 'idle' | 'loading' | 'view' | 'editing';

const EMPTY_CONTACT_DRAFT: ContactDraft = {
  official_email: '', personal_email: '', phone: '', official_phone: '', address: '',
  mailing_address: '', emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relation: '',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type EmployeeInvitationDraft = {
  request_id: string;
  employee_number: string;
  full_name: string;
  email: string;
  joining_date: string;
};
function newEmployeeInvitationDraft(): EmployeeInvitationDraft {
  return {
    request_id: crypto.randomUUID(),
    employee_number: '', full_name: '', email: '',
    joining_date: new Date().toISOString().slice(0, 10),
  };
}

function contactDraftFrom(details: EmployeeContactDetails): ContactDraft {
  return {
    official_email: details.official_email || '',
    personal_email: details.personal_email || '',
    phone: details.phone || '',
    official_phone: details.official_phone || '',
    address: details.address || '',
    mailing_address: details.mailing_address || '',
    emergency_contact_name: details.emergency_contact_name || '',
    emergency_contact_phone: details.emergency_contact_phone || '',
    emergency_contact_relation: details.emergency_contact_relation || '',
  };
}

function contactValidationError(draft: ContactDraft): string {
  const officialEmail = draft.official_email.trim();
  const personalEmail = draft.personal_email?.trim() || '';
  if (!EMAIL_PATTERN.test(officialEmail) || (personalEmail && !EMAIL_PATTERN.test(personalEmail))) {
    return 'Enter a valid official email and a valid personal email when provided.';
  }
  if (officialEmail.length > 320 || personalEmail.length > 320
    || (draft.phone || '').trim().length > 80 || (draft.official_phone || '').trim().length > 80
    || (draft.address || '').trim().length > 500 || (draft.mailing_address || '').trim().length > 500
    || (draft.emergency_contact_name || '').trim().length > 160
    || (draft.emergency_contact_phone || '').trim().length > 80
    || (draft.emergency_contact_relation || '').trim().length > 120) {
    return 'One or more contact fields exceed the allowed length.';
  }
  return '';
}

function isContactApiUnavailable(cause: unknown): boolean {
  return cause !== null && typeof cause === 'object' && 'code' in cause
    && String(cause.code) === 'PGRST202';
}

const PAGE_SIZE = 50;

function statusLabel(value: string, locale: Locale) {
  const label = value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return projectText(locale, label);
}

export function OrganizationEmployeeDirectory({ tenantId, locale, employeesManage = false }: { tenantId: string; locale: Locale; employeesManage?: boolean }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; department_id: string | null }[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [status, setStatus] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedDepartmentId, setAppliedDepartmentId] = useState('');
  const [appliedTeamId, setAppliedTeamId] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [contactMode, setContactMode] = useState<ContactMode>('idle');
  const [contactDetails, setContactDetails] = useState<EmployeeContactDetails | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(EMPTY_CONTACT_DRAFT);
  const [contactError, setContactError] = useState('');
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [employeeInvitationDraft, setEmployeeInvitationDraft] = useState<EmployeeInvitationDraft>(newEmployeeInvitationDraft);
  const [employeeInvitationBusy, setEmployeeInvitationBusy] = useState(false);
  const [employeeInvitationAttempted, setEmployeeInvitationAttempted] = useState(false);
  const [employeeInvitationError, setEmployeeInvitationError] = useState('');
  const [employeeInvitationSuccess, setEmployeeInvitationSuccess] = useState('');
  const [employeeReissueError, setEmployeeReissueError] = useState('');
  const [employeeReissueSuccess, setEmployeeReissueSuccess] = useState('');
  const [reissuingEmployeeId, setReissuingEmployeeId] = useState('');
  const reissueRequestIds = useRef(new Map<string, string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const contactRequestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const directoryHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);
  const detailReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const closeDetailsHandlerRef = useRef<() => void>(() => undefined);
  activeTenantId.current = tenantId;
  const tx = (english: string) => projectText(locale, english);

  useEffect(() => {
    setSearch('');
    setDepartmentId('');
    setTeamId('');
    setStatus('');
    setAppliedSearch('');
    setAppliedDepartmentId('');
    setAppliedTeamId('');
    setAppliedStatus('');
    setOffset(0);
    setSelectedEmployee(null);
    setContactMode('idle');
    setContactDetails(null);
    setContactDraft(EMPTY_CONTACT_DRAFT);
    setContactError('');
    setContactSuccess(false);
    setAddEmployeeOpen(false);
    setEmployeeInvitationDraft(newEmployeeInvitationDraft());
    setEmployeeInvitationBusy(false);
    setEmployeeInvitationAttempted(false);
    setEmployeeInvitationError('');
    setEmployeeInvitationSuccess('');
    setEmployeeReissueError('');
    setEmployeeReissueSuccess('');
    setReissuingEmployeeId('');
    reissueRequestIds.current.clear();
  }, [tenantId]);

  useEffect(() => {
    contactRequestSequence.current += 1;
    setContactMode('idle');
    setContactSaving(false);
    setContactDetails(null);
    setContactDraft(EMPTY_CONTACT_DRAFT);
    setContactError('');
    setContactSuccess(false);
  }, [tenantId, selectedEmployee?.employee_id]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestTenant = tenantId;
    setEmployees([]);
    setDepartments([]);
    setTeams([]);
    setStatuses([]);
    setTotalCount(0);
    setSelectedEmployee(null);
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_tenant_employee_directory_v2', {
          p_tenant_id: requestTenant,
          p_search: appliedSearch || null,
          p_department_id: appliedDepartmentId || null,
          p_team_id: appliedTeamId || null,
          p_status: appliedStatus || null,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });
        if (requestId !== requestSequence.current || activeTenantId.current !== requestTenant) return;
        if (result.error) throw result.error;
        const payload = result.data as DirectoryPayload | null;
        if (!payload || !Array.isArray(payload.employees) || !Array.isArray(payload.departments)
          || !Array.isArray(payload.teams)
          || !Array.isArray(payload.available_statuses) || typeof payload.total_count !== 'number') {
          throw new Error('Employee directory returned an invalid response.');
        }
        setEmployees(payload.employees);
        setDepartments(payload.departments);
        setTeams(payload.teams);
        setStatuses(payload.available_statuses);
        setTotalCount(payload.total_count);
      } catch {
        if (requestId !== requestSequence.current || activeTenantId.current !== requestTenant) return;
        setEmployees([]);
        setDepartments([]);
        setTeams([]);
        setStatuses([]);
        setTotalCount(0);
        setError('Unable to load employees for this organization. Check your employee-directory access and try again.');
      } finally {
        if (requestId === requestSequence.current && activeTenantId.current === requestTenant) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, appliedSearch, appliedDepartmentId, appliedTeamId, appliedStatus, offset, revision]);

  useEffect(() => {
    if (!selectedEmployee) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const restoreFocus = activateModalFocusTrap(detailDialogRef.current, {
      initialFocus: detailCloseButtonRef.current,
      returnFocus: () => detailReturnFocusRef.current,
      fallbackFocus: directoryHeadingRef.current,
      onEscape: () => closeDetailsHandlerRef.current(),
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocus();
    };
  }, [selectedEmployee]);

  const first = totalCount === 0 ? 0 : offset + 1;
  const last = Math.min(offset + employees.length, totalCount);
  const visibleDepartmentName = useMemo(() => new Map(departments.map(item => [item.id, item.name])), [departments]);
  const visibleTeams = useMemo(() => teams.filter(item => !departmentId || item.department_id === departmentId), [teams, departmentId]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setAppliedSearch(search.trim());
    setAppliedDepartmentId(departmentId);
    setAppliedTeamId(teamId);
    setAppliedStatus(status);
  }

  async function submitEmployeeInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeesManage || employeeInvitationBusy) return;
    const draft = employeeInvitationDraft;
    const employeeNumber = draft.employee_number.trim();
    const fullName = draft.full_name.trim();
    const email = draft.email.trim();
    if (!employeeNumber || employeeNumber.length > 32 || !fullName || fullName.length > 160
      || !EMAIL_PATTERN.test(email) || !draft.joining_date) {
      setEmployeeInvitationError('Enter a valid employee number, name, email, and joining date.');
      return;
    }
    setEmployeeInvitationBusy(true);
    setEmployeeInvitationAttempted(true);
    setEmployeeInvitationError('');
    setEmployeeInvitationSuccess('');
    const requestTenant = tenantId;
    try {
      const result = await createEmployeeInvitation({
        tenantId: requestTenant,
        requestId: draft.request_id,
        employeeNumber,
        fullName,
        email,
        joiningDate: draft.joining_date,
      });
      if (activeTenantId.current !== requestTenant) return;
      setEmployeeInvitationSuccess(result.alreadySent
        ? 'The employee invitation was already sent.'
        : 'Employee record saved and invitation email sent.');
      setAddEmployeeOpen(false);
      setEmployeeInvitationDraft(newEmployeeInvitationDraft());
      setEmployeeInvitationAttempted(false);
      setRevision(value => value + 1);
    } catch (cause) {
      if (activeTenantId.current !== requestTenant) return;
      const message = cause instanceof Error ? cause.message : '';
      setEmployeeInvitationError(/already uses this email/i.test(message)
        ? 'An employee record already uses this email in this organization.'
        : /management access|authorized/i.test(message)
          ? 'Employee-management access for this organization is required.'
          : /valid employee|employee number/i.test(message)
            ? 'Enter a valid employee number, name, email, and joining date.'
            : /15 minutes/i.test(message)
              ? 'Wait 15 minutes before retrying the invitation.'
              : /retry limit/i.test(message)
                ? 'This invitation reached its delivery retry limit. Contact your platform administrator.'
                : 'Employee invitation could not be completed. Retry with the same employee details or refresh the directory.');
    } finally {
      if (activeTenantId.current === requestTenant) setEmployeeInvitationBusy(false);
    }
  }


  async function resendEmployeeInvitation(employee: EmployeeRow) {
    if (!employeesManage || !employee.invitation
      || !['expired', 'failed', 'pending'].includes(employee.invitation.status)
      || reissuingEmployeeId) return;
    const requestTenant = tenantId;
    const isPending = employee.invitation.status === 'pending';
    const requestId = isPending
      ? ''
      : reissueRequestIds.current.get(employee.employee_id) || crypto.randomUUID();
    if (!isPending) reissueRequestIds.current.set(employee.employee_id, requestId);
    setReissuingEmployeeId(employee.employee_id);
    setEmployeeReissueError('');
    setEmployeeReissueSuccess('');
    try {
      const result = isPending
        ? await resumeEmployeeInvitation({
          tenantId: requestTenant,
          invitationId: employee.invitation.id,
        })
        : await reissueEmployeeInvitation({
          tenantId: requestTenant,
          employeeId: employee.employee_id,
          requestId,
        });
      if (activeTenantId.current !== requestTenant) return;
      if (!isPending) reissueRequestIds.current.delete(employee.employee_id);
      setEmployeeReissueSuccess(result.alreadySent
        ? 'Employee invitation was already sent.'
        : isPending ? 'Employee invitation delivery resumed and email sent.' : 'Employee invitation reissued and email sent.');
      setRevision(value => value + 1);
    } catch (cause) {
      if (activeTenantId.current !== requestTenant) return;
      const message = cause instanceof Error ? cause.message : '';
      setEmployeeReissueError(/15 minutes/i.test(message)
        ? 'Wait 15 minutes before retrying the invitation.'
        : /retry limit/i.test(message)
          ? 'This invitation reached its delivery retry limit. Contact your platform administrator.'
          : isPending
            ? 'The employee invitation could not be resumed. Refresh the directory and try again.'
            : 'The employee invitation could not be reissued. Refresh the directory and try again.');
      setRevision(value => value + 1);
    } finally {
      if (activeTenantId.current === requestTenant) setReissuingEmployeeId('');
    }
  }

  function exportPage() {
    downloadCsv(`employee-directory-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Employee', 'Employee number', 'Department', 'Designation', 'Team', 'Employment status'].map(tx),
      employees.map(employee => [employee.full_name, employee.employee_number,
        employee.department_name || '', employee.designation_title || '', employee.team_name || '',
        statusLabel(employee.employment_status, locale)]));
  }

  function openEmployeeDetails(employee: EmployeeRow, trigger: HTMLButtonElement) {
    detailReturnFocusRef.current = trigger;
    setSelectedEmployee(employee);
  }

  const contactDirty = contactMode === 'editing' && contactDetails !== null
    && JSON.stringify(contactDraftFrom(contactDetails)) !== JSON.stringify(contactDraft);

  async function loadContactDetails() {
    if (!employeesManage || !selectedEmployee) return;
    const requestId = ++contactRequestSequence.current;
    const requestTenant = tenantId;
    const requestEmployeeId = selectedEmployee.employee_id;
    setContactMode('loading');
    setContactError('');
    setContactSuccess(false);
    try {
      const result = await supabase.rpc('hris_get_tenant_employee_contact_details', {
        p_tenant_id: requestTenant,
        p_employee_id: requestEmployeeId,
      });
      if (requestId !== contactRequestSequence.current || activeTenantId.current !== requestTenant) return;
      if (result.error) throw result.error;
      const value = result.data as Partial<EmployeeContactDetails> | null;
      if (!value || value.employee_id !== requestEmployeeId || typeof value.official_email !== 'string') {
        throw new Error('Employee contact details returned an invalid response.');
      }
      const details: EmployeeContactDetails = {
        employee_id: value.employee_id,
        official_email: value.official_email,
        personal_email: typeof value.personal_email === 'string' ? value.personal_email : null,
        phone: typeof value.phone === 'string' ? value.phone : null,
        official_phone: typeof value.official_phone === 'string' ? value.official_phone : null,
        address: typeof value.address === 'string' ? value.address : null,
        mailing_address: typeof value.mailing_address === 'string' ? value.mailing_address : null,
        emergency_contact_name: typeof value.emergency_contact_name === 'string' ? value.emergency_contact_name : null,
        emergency_contact_phone: typeof value.emergency_contact_phone === 'string' ? value.emergency_contact_phone : null,
        emergency_contact_relation: typeof value.emergency_contact_relation === 'string' ? value.emergency_contact_relation : null,
      };
      setContactDetails(details);
      setContactDraft(contactDraftFrom(details));
      setContactMode('view');
    } catch (cause) {
      if (requestId !== contactRequestSequence.current || activeTenantId.current !== requestTenant) return;
      setContactMode('idle');
      setContactError(isContactApiUnavailable(cause)
        ? 'Contact editing is currently unavailable. Contact your administrator.'
        : 'Unable to load contact details. Check your employee-management access and retry.');
    }
  }

  function beginContactEditing() {
    if (!employeesManage || !contactDetails) return;
    setContactDraft(contactDraftFrom(contactDetails));
    setContactError('');
    setContactSuccess(false);
    setContactMode('editing');
  }

  function cancelContactEditing() {
    if (contactDirty && !window.confirm(tx('Discard unsaved contact changes?'))) return;
    if (contactDetails) setContactDraft(contactDraftFrom(contactDetails));
    setContactError('');
    setContactMode('view');
  }

  function closeEmployeeDetails() {
    if (contactDirty && !window.confirm(tx('Discard unsaved contact changes?'))) return;
    setSelectedEmployee(null);
  }
  closeDetailsHandlerRef.current = closeEmployeeDetails;

  async function saveContactDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeesManage || !selectedEmployee || !contactDetails) return;
    const validationError = contactValidationError(contactDraft);
    if (validationError) {
      setContactError(validationError);
      return;
    }
    const requestTenant = tenantId;
    const requestEmployeeId = selectedEmployee.employee_id;
    const requestId = ++contactRequestSequence.current;
    setContactSaving(true);
    setContactError('');
    setContactSuccess(false);
    try {
      const result = await supabase.rpc('hris_update_tenant_employee_contact_details', {
        p_tenant_id: requestTenant,
        p_employee_id: requestEmployeeId,
        p_contact_details: contactDraft,
      });
      if (requestId !== contactRequestSequence.current || activeTenantId.current !== requestTenant
        || selectedEmployee?.employee_id !== requestEmployeeId) return;
      if (result.error) throw result.error;
      const value = result.data as Partial<EmployeeContactDetails> | null;
      if (!value || value.employee_id !== requestEmployeeId || typeof value.official_email !== 'string') {
        throw new Error('Saved employee contact details returned an invalid response.');
      }
      const details: EmployeeContactDetails = {
        employee_id: value.employee_id,
        official_email: value.official_email,
        personal_email: typeof value.personal_email === 'string' ? value.personal_email : null,
        phone: typeof value.phone === 'string' ? value.phone : null,
        official_phone: typeof value.official_phone === 'string' ? value.official_phone : null,
        address: typeof value.address === 'string' ? value.address : null,
        mailing_address: typeof value.mailing_address === 'string' ? value.mailing_address : null,
        emergency_contact_name: typeof value.emergency_contact_name === 'string' ? value.emergency_contact_name : null,
        emergency_contact_phone: typeof value.emergency_contact_phone === 'string' ? value.emergency_contact_phone : null,
        emergency_contact_relation: typeof value.emergency_contact_relation === 'string' ? value.emergency_contact_relation : null,
      };
      setContactDetails(details);
      setContactDraft(contactDraftFrom(details));
      setContactMode('view');
      setContactSuccess(true);
    } catch (cause) {
      if (requestId !== contactRequestSequence.current || activeTenantId.current !== requestTenant
        || selectedEmployee?.employee_id !== requestEmployeeId) return;
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      setContactError(code === '23505'
        ? 'That official email is already used in this organization.'
        : code === '55000' && String(cause instanceof Error ? cause.message : '').includes('invitation')
          ? 'The official email cannot change while this employee invitation is pending.'
        : code === '22023'
          ? 'Enter a valid official email and a valid personal email when provided.'
          : isContactApiUnavailable(cause)
            ? 'Contact editing is currently unavailable. Contact your administrator.'
            : 'Contact update failed. Check your employee-management access and retry.');
    } finally {
      if (requestId === contactRequestSequence.current && activeTenantId.current === requestTenant) setContactSaving(false);
    }
  }

  return <section aria-labelledby="employee-directory-heading" className="space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="employee-directory-heading" ref={directoryHeadingRef} tabIndex={-1} className="text-2xl font-medium text-[#49454F]">{tx('Employee directory')}</h2>
        <p className="mt-1 text-sm text-slate-500">{tx('Authorized employee records for your current organization.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {employeesManage && <button type="button" aria-expanded={addEmployeeOpen}
          aria-controls="employee-invitation-form" onClick={() => {
            setAddEmployeeOpen(current => !current);
            setEmployeeInvitationError('');
            setEmployeeInvitationSuccess('');
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-semibold text-white">
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {tx(addEmployeeOpen ? 'Close employee form' : 'Add employee')}
        </button>}
        <button type="button" disabled={loading || employees.length === 0} onClick={exportPage}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> {tx('Export current page')}
        </button>
        <button type="button" aria-label={tx('Refresh employee directory')} disabled={loading} onClick={() => setRevision(value => value + 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {tx('Refresh')}
        </button>
      </div>
    </header>

    {employeeInvitationSuccess && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tx(employeeInvitationSuccess)}</p>}
    {employeeReissueSuccess && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tx(employeeReissueSuccess)}</p>}
    {employeeReissueError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{tx(employeeReissueError)}</p>}
    {addEmployeeOpen && employeesManage && <form id="employee-invitation-form" onSubmit={event => void submitEmployeeInvitation(event)}
      aria-labelledby="employee-invitation-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h3 id="employee-invitation-heading" className="text-lg font-semibold text-[#08263D]">{tx('Add employee and send invitation')}</h3>
        <p className="mt-1 text-sm text-slate-600">{tx('The employee record is saved in this organization. Access starts after the invitee confirms their email and accepts the invitation.')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700">{tx('Employee number')}
          <input required maxLength={32} autoComplete="off" disabled={employeeInvitationAttempted || employeeInvitationBusy} value={employeeInvitationDraft.employee_number}
            onChange={event => setEmployeeInvitationDraft(current => ({ ...current, employee_number: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">{tx('Full name')}
          <input required maxLength={160} autoComplete="name" disabled={employeeInvitationAttempted || employeeInvitationBusy} value={employeeInvitationDraft.full_name}
            onChange={event => setEmployeeInvitationDraft(current => ({ ...current, full_name: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">{tx('Official email')}
          <input required maxLength={320} type="email" autoComplete="email" disabled={employeeInvitationAttempted || employeeInvitationBusy} value={employeeInvitationDraft.email}
            onChange={event => setEmployeeInvitationDraft(current => ({ ...current, email: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">{tx('Joining date')}
          <input required type="date" disabled={employeeInvitationAttempted || employeeInvitationBusy} value={employeeInvitationDraft.joining_date}
            onChange={event => setEmployeeInvitationDraft(current => ({ ...current, joining_date: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" />
        </label>
      </div>
      {employeeInvitationError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{tx(employeeInvitationError)}</p>}
      {employeeInvitationAttempted && employeeInvitationError && <p className="text-sm text-slate-600">{tx('This invitation may already be saved. Retry without changing these details.')}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={employeeInvitationBusy} onClick={() => setAddEmployeeOpen(false)}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button>
        <button type="submit" disabled={employeeInvitationBusy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {tx(employeeInvitationBusy ? 'Saving and sending…' : 'Save employee and send invitation')}
        </button>
      </div>
    </form>}

    <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_220px_200px_auto]">
      <label className="relative block text-xs font-medium text-slate-600">
        {tx('Search employees')}
        <Search className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label={tx('Search employees')} placeholder={tx('Name, employee number, team or role')}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {tx('Department')}
        <select aria-label={tx('Filter employees by department')} value={departmentId} onChange={event => {
          const nextDepartmentId = event.target.value;
          setDepartmentId(nextDepartmentId);
          const selectedTeam = teams.find(item => item.id === teamId);
          if (selectedTeam && nextDepartmentId && selectedTeam.department_id !== nextDepartmentId) setTeamId('');
        }}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">{tx('All departments')}</option>
          {departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {tx('Team')}
        <select aria-label={tx('Filter employees by team')} value={teamId} onChange={event => setTeamId(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">{tx('All teams')}</option>
          {visibleTeams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        {tx('Employment status')}
        <select aria-label={tx('Filter employees by employment status')} value={status} onChange={event => setStatus(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">{tx('All statuses')}</option>
          {statuses.map(value => <option key={value} value={value}>{statusLabel(value, locale)}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button type="submit" disabled={loading}
        className="min-h-11 w-full rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">{tx('Apply filters')}</button></div>
    </form>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{tx(error)}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button>
    </div>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
        <h3 className="inline-flex items-center gap-2 font-medium text-slate-800"><Users className="h-4 w-4 text-[#08558B]" aria-hidden="true" />{tx('Employees')}</h3>
        <p aria-live="polite" className="text-slate-500">{first}–{last} {tx('of')} {totalCount}</p>
      </div>
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">{tx('Loading authorized employees…')}</p>
        : error ? <p className="p-5 text-sm text-slate-600">{tx('Employee data is unavailable until the connection recovers.')}</p>
          : employees.length === 0 ? <div className="p-6 text-center">
            <p className="font-medium text-slate-800">{tx(totalCount ? 'No employees on this page' : 'No employees found')}</p>
            <p className="mt-1 text-sm text-slate-600">{tx('Adjust the filters or refresh to check the current organization again.')}</p>
          </div> : <>
            <ul className="divide-y divide-slate-100 md:hidden">{employees.map(employee => <li key={employee.employee_id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-slate-900">{employee.full_name}</p><p className="mt-1 text-xs text-slate-500">{employee.employee_number}</p></div>
                <span className="w-fit shrink-0 rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium text-[#085587]">{statusLabel(employee.employment_status, locale)}</span></div>
              <p className="break-words text-sm text-slate-700">{employee.designation_title || tx('Designation unavailable')}</p>
              <p className="break-words text-xs text-slate-500">{employee.department_name || tx('No department')} · {employee.team_name || tx('No team')}</p>
              {employeesManage && employee.invitation && ['expired', 'failed', 'pending'].includes(employee.invitation.status) && <>
                <p className="text-xs font-medium text-amber-800">{tx(employee.invitation.status === 'expired'
                  ? 'Invitation expired'
                  : employee.invitation.status === 'failed'
                    ? 'Invitation delivery failed'
                    : 'Invitation delivery pending')}</p>
                <button type="button" disabled={reissuingEmployeeId === employee.employee_id || Boolean(reissuingEmployeeId)}
                  onClick={() => void resendEmployeeInvitation(employee)}
                  className="min-h-10 rounded-md border border-[#085587] px-3 text-sm font-semibold text-[#085587] disabled:opacity-50">
                  {tx(reissuingEmployeeId === employee.employee_id ? 'Sending…'
                    : employee.invitation.status === 'pending' ? 'Resume invitation' : 'Resend invitation')}
                </button>
              </>}
              <button type="button" onClick={event => openEmployeeDetails(employee, event.currentTarget)}
                aria-label={`${tx('View details for')} ${employee.full_name}`}
                className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-[#085587]">{tx('View details')}</button>
            </li>)}</ul>
            <div role="region" aria-label={tx('Scrollable employee directory table')} tabIndex={0} className="hidden overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#08558B] md:block">
              <table aria-label={tx('Organization employee directory')} className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
                  {['Employee', 'Employee number', 'Department', 'Designation', 'Team', 'Employment status', 'Actions'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{tx(label)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{employees.map(employee => <tr key={employee.employee_id}>
                  <td className="px-4 py-3 font-medium text-[#08263D]">{employee.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.employee_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{visibleDepartmentName.get(employee.department_id || '') || employee.department_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.designation_title || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.team_name || '—'}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium text-[#085587]">{statusLabel(employee.employment_status, locale)}</span></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                    <button type="button" onClick={event => openEmployeeDetails(employee, event.currentTarget)}
                      aria-label={`${tx('View details for')} ${employee.full_name}`}
                      className="min-h-9 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-[#085587]">{tx('View details')}</button>
                    {employeesManage && employee.invitation && ['expired', 'failed', 'pending'].includes(employee.invitation.status) && <button type="button"
                      disabled={Boolean(reissuingEmployeeId)}
                      onClick={() => void resendEmployeeInvitation(employee)}
                      className="min-h-9 rounded-md border border-[#085587] px-2.5 text-xs font-semibold text-[#085587] disabled:opacity-50">
                      {tx(reissuingEmployeeId === employee.employee_id ? 'Sending…'
                        : employee.invitation.status === 'pending' ? 'Resume invitation' : 'Resend invitation')}
                    </button>}
                  </div></td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
      {!loading && !error && <footer className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
        <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Previous')}</button>
        <p className="text-xs text-slate-500">{tx('Page size')} {PAGE_SIZE}</p>
        <button type="button" disabled={loading || offset + PAGE_SIZE >= totalCount} onClick={() => setOffset(value => value + PAGE_SIZE)}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Next')}</button>
      </footer>}
    </div>
    {selectedEmployee && <div role="dialog" aria-modal="true" aria-labelledby="employee-record-heading"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4"
      onMouseDown={event => { if (event.target === event.currentTarget) closeEmployeeDetails(); }}>
      <div ref={detailDialogRef} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{tx('Employee record')}</p>
            <h3 id="employee-record-heading" className="mt-1 break-words text-xl font-semibold text-[#08263D]">{selectedEmployee.full_name}</h3>
          </div>
          <button ref={detailCloseButtonRef} type="button" aria-label={tx('Close employee record')} onClick={closeEmployeeDetails}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="p-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-slate-500">{tx('Employee number')}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{selectedEmployee.employee_number || '—'}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{tx('Employment status')}</dt><dd className="mt-1"><span className="inline-flex rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium text-[#085587]">{statusLabel(selectedEmployee.employment_status, locale)}</span></dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{tx('Department')}</dt><dd className="mt-1 break-words text-sm text-slate-900">{visibleDepartmentName.get(selectedEmployee.department_id || '') || selectedEmployee.department_name || tx('No department')}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{tx('Designation')}</dt><dd className="mt-1 break-words text-sm text-slate-900">{selectedEmployee.designation_title || tx('Designation unavailable')}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">{tx('Team')}</dt><dd className="mt-1 break-words text-sm text-slate-900">{selectedEmployee.team_name || tx('No team')}</dd></div>
          </dl>
          {employeesManage && <section aria-labelledby="employee-contact-heading" className="mt-6 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 id="employee-contact-heading" className="text-base font-semibold text-[#08263D]">{tx('Contact details')}</h4>
              {contactMode === 'idle' && <button type="button" onClick={() => void loadContactDetails()}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-[#085587]">
                <Pencil className="h-4 w-4" aria-hidden="true" />{tx('View contact details')}
              </button>}
              {contactMode === 'view' && <button type="button" onClick={beginContactEditing}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-[#085587]">
                <Pencil className="h-4 w-4" aria-hidden="true" />{tx('Edit contact details')}
              </button>}
            </div>
            {contactMode === 'loading' && <p role="status" className="mt-3 text-sm text-slate-600">{tx('Loading contact details…')}</p>}
            {contactError && contactMode !== 'editing' && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>{tx(contactError)}</p>
              {contactMode === 'idle' && <button type="button" onClick={() => void loadContactDetails()}
                className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry contact details')}</button>}
            </div>}
            {contactSuccess && contactMode === 'view' && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tx('Contact details updated.')}</p>}
            {contactMode === 'view' && contactDetails && <>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {([
                  ['Official email', contactDetails.official_email], ['Personal email', contactDetails.personal_email],
                  ['Phone', contactDetails.phone], ['Official phone', contactDetails.official_phone],
                  ['Home address', contactDetails.address], ['Mailing address', contactDetails.mailing_address],
                  ['Emergency contact name', contactDetails.emergency_contact_name],
                  ['Emergency contact phone', contactDetails.emergency_contact_phone],
                  ['Emergency contact relationship', contactDetails.emergency_contact_relation],
                ] as const).map(([label, value]) => <div key={label}>
                  <dt className="text-xs font-medium text-slate-500">{tx(label)}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-900">{value || '—'}</dd>
                </div>)}
              </dl>
              <p className="mt-4 text-xs text-slate-500">{tx('These changes update the employee contact record only. Sign-in email is unchanged.')}</p>
            </>}
            {contactMode === 'editing' && <form noValidate onSubmit={event => void saveContactDetails(event)}
              aria-describedby={contactError ? 'contact-form-error' : undefined} className="mt-4 space-y-4">
              <p className="text-xs text-slate-500">{tx('These changes update the employee contact record only. Sign-in email is unchanged.')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">{tx('Official email')}
                  <input autoComplete="off" type="email" required maxLength={320} value={contactDraft.official_email}
                    onChange={event => setContactDraft(current => ({ ...current, official_email: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-medium text-slate-700">{tx('Personal email')}
                  <input autoComplete="off" type="email" maxLength={320} value={contactDraft.personal_email || ''}
                    onChange={event => setContactDraft(current => ({ ...current, personal_email: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-medium text-slate-700">{tx('Phone')}
                  <input autoComplete="off" type="tel" maxLength={80} value={contactDraft.phone || ''}
                    onChange={event => setContactDraft(current => ({ ...current, phone: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-medium text-slate-700">{tx('Official phone')}
                  <input autoComplete="off" type="tel" maxLength={80} value={contactDraft.official_phone || ''}
                    onChange={event => setContactDraft(current => ({ ...current, official_phone: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <div className="block text-sm font-medium text-slate-700">
                  <label htmlFor="employee-contact-home-address">{tx('Home address')}</label>
                  <textarea id="employee-contact-home-address" maxLength={500} rows={3} value={contactDraft.address || ''}
                    onChange={event => setContactDraft(current => ({ ...current, address: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </div>
                <div className="block text-sm font-medium text-slate-700">
                  <label htmlFor="employee-contact-mailing-address">{tx('Mailing address')}</label>
                  <textarea id="employee-contact-mailing-address" maxLength={500} rows={3} value={contactDraft.mailing_address || ''}
                    onChange={event => setContactDraft(current => ({ ...current, mailing_address: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </div>
                <label className="block text-sm font-medium text-slate-700">{tx('Emergency contact name')}
                  <input autoComplete="off" maxLength={160} value={contactDraft.emergency_contact_name || ''}
                    onChange={event => setContactDraft(current => ({ ...current, emergency_contact_name: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-medium text-slate-700">{tx('Emergency contact phone')}
                  <input autoComplete="off" type="tel" maxLength={80} value={contactDraft.emergency_contact_phone || ''}
                    onChange={event => setContactDraft(current => ({ ...current, emergency_contact_phone: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
                <label className="block text-sm font-medium text-slate-700">{tx('Emergency contact relationship')}
                  <input autoComplete="off" maxLength={120} value={contactDraft.emergency_contact_relation || ''}
                    onChange={event => setContactDraft(current => ({ ...current, emergency_contact_relation: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
                </label>
              </div>
              {contactError && <p id="contact-form-error" role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{tx(contactError)}</p>}
              <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" disabled={contactSaving} onClick={cancelContactEditing}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50">{tx('Cancel')}</button>
                <button type="submit" disabled={contactSaving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {contactSaving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {tx(contactSaving ? 'Saving contact details…' : 'Save contact details')}
                </button>
              </footer>
            </form>}
          </section>}
        </div>
        <footer className="flex justify-end border-t border-slate-100 p-4">
          <button type="button" onClick={closeEmployeeDetails} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700">{tx('Close')}</button>
        </footer>
      </div>
    </div>}
  </section>;
}
