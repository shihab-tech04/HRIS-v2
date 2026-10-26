import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const hiringPort = migration('20261024230001_hris_candidate_hiring_rpc_forward_port.sql');
const attendancePort = migration('20261024231001_hris_attendance_shift_rpc_forward_port.sql');
const peoplePort = migration('20261024232001_hris_employee_payroll_learning_rpc_forward_port.sql');

const sources = {
  activation: migration('20261020121500_hris_candidate_activation_employee_id.sql'),
  assessment: migration('20261013170556_hris_candidate_assessment_journey.sql'),
  interview: migration('20261013221500_hris_candidate_interview_journey.sql'),
  interviewCompletion: migration('20261016081154_hris_candidate_interview_completion.sql'),
  offer: migration('20261013132335_hris_recruitment_offer_issue.sql'),
  stage: migration('20261014012249_recruiter_application_stage_transition.sql'),
  roster: migration('20261012111928_hris_tenant_shift_roster_read.sql'),
  shift: migration('20261012113020_hris_tenant_shift_assignment_manage.sql'),
  attendance: migration('20261012115907_hris_employee_web_attendance_event.sql'),
  attendancePeriod: migration('20261013215431_employee_dashboard_attendance_period_read.sql'),
  employment: migration('20261024082000_employee_employment_details_e02_09.sql'),
  referral: migration('20261013175151_employee_referral_workflow.sql'),
  payroll: migration('20261014120000_hris_tenant_payroll_register_read.sql'),
  dashboard: migration('20261015120000_hris_dashboard_team_report_date_filter.sql'),
  learning: migration('20261013174500_hris_learning_program_management.sql'),
  learningRoster: migration('20261013190000_hris_learning_session_roster.sql'),
};

function functionBlock(source, schema, name) {
  const start = source.search(new RegExp(`CREATE OR REPLACE FUNCTION\\s+${schema}\\.${name}\\b`, 'i'));
  assert.notEqual(start, -1, `canonical ${schema}.${name} definition exists`);
  const rest = source.slice(start);
  const bodyTag = rest.match(/\bAS\s+(\$[A-Za-z_0-9]*\$)/i)?.[1];
  assert.ok(bodyTag, `canonical ${schema}.${name} has a dollar-quoted body`);
  const end = rest.indexOf(`${bodyTag};`, rest.indexOf(bodyTag) + bodyTag.length);
  assert.notEqual(end, -1, `canonical ${schema}.${name} body terminates`);
  return rest.slice(0, end + bodyTag.length + 1).trim();
}

test('all 24 non-timesheet RPCs retain their newest Main function bodies', () => {
  const expected = [
    [hiringPort, 'activation', 'public', 'hris_activate_candidate_employee'],
    [hiringPort, 'assessment', 'public', 'hris_assign_candidate_assessment'],
    [hiringPort, 'assessment', 'public', 'hris_get_candidate_assessments'],
    [hiringPort, 'assessment', 'public', 'hris_review_candidate_assessment'],
    [hiringPort, 'interview', 'public', 'hris_schedule_candidate_interview'],
    [hiringPort, 'interviewCompletion', 'public', 'hris_complete_candidate_interview'],
    [hiringPort, 'interviewCompletion', 'public', 'hris_get_candidate_interview_responses'],
    [hiringPort, 'interviewCompletion', 'public', 'hris_save_candidate_interview_panel_notes'],
    [hiringPort, 'offer', 'public', 'hris_issue_candidate_offer'],
    [hiringPort, 'stage', 'public', 'hris_update_candidate_application_stage'],
    [attendancePort, 'roster', 'public', 'hris_get_tenant_shift_roster_data'],
    [attendancePort, 'shift', 'public', 'hris_get_tenant_shift_roster_options'],
    [attendancePort, 'shift', 'public', 'hris_assign_tenant_employee_shift'],
    [attendancePort, 'attendance', 'public', 'hris_employee_record_attendance_event'],
    [attendancePort, 'attendancePeriod', 'public', 'hris_get_my_attendance_period'],
    [peoplePort, 'employment', 'public', 'employee_get_my_employment_info_v1'],
    [peoplePort, 'referral', 'public', 'hris_get_employee_referral_workspace'],
    [peoplePort, 'referral', 'public', 'hris_submit_employee_referral'],
    [peoplePort, 'referral', 'public', 'hris_mark_employee_referral_in_review'],
    [peoplePort, 'payroll', 'public', 'hris_get_tenant_payroll_register'],
    [peoplePort, 'dashboard', 'public', 'hris_get_tenant_dashboard_team_report'],
    [peoplePort, 'dashboard', 'public', 'hris_get_tenant_dashboard_team_details'],
    [peoplePort, 'learning', 'public', 'hris_save_learning_session'],
    [peoplePort, 'learningRoster', 'public', 'hris_get_learning_session_roster'],
  ];

  assert.equal(expected.length, 24);
  for (const [port, sourceKey, schema, name] of expected) {
    assert.ok(port.includes(functionBlock(sources[sourceKey], schema, name)), `${name} matches the tracked canonical definition`);
    assert.match(port, new RegExp(`REVOKE ALL ON FUNCTION ${schema}\\.${name}\\(`), `${name} revokes default and anonymous execute`);
    assert.match(port, new RegExp(`GRANT EXECUTE ON FUNCTION ${schema}\\.${name}\\(`), `${name} grants its tracked authenticated contract`);
  }
  assert.ok(peoplePort.includes(functionBlock(sources.learningRoster, 'private', 'hris_get_learning_session_roster')),
    'private roster projection remains source-identical');
});

test('forward ports preserve authorization guards, the extended stage constraint, and table write denial', () => {
  for (const [name, port] of [
    ['hris_activate_candidate_employee', hiringPort],
    ['hris_assign_candidate_assessment', hiringPort],
    ['hris_complete_candidate_interview', hiringPort],
    ['hris_issue_candidate_offer', hiringPort],
    ['hris_update_candidate_application_stage', hiringPort],
    ['hris_employee_record_attendance_event', attendancePort],
    ['hris_assign_tenant_employee_shift', attendancePort],
    ['hris_submit_employee_referral', peoplePort],
    ['hris_mark_employee_referral_in_review', peoplePort],
    ['hris_save_learning_session', peoplePort],
  ]) {
    const block = port.slice(port.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`));
    assert.match(block, /SECURITY DEFINER/i, `${name} stays security definer`);
    assert.match(block, /SET search_path\s*=\s*''/i, `${name} has an empty search path`);
    assert.match(block, /is_live_session|has_tenant_permission/i, `${name} retains its live-session or tenant permission guard`);
  }

  assert.match(hiringPort, /candidate_application_stage_history[\s\S]*?VALIDATE CONSTRAINT candidate_application_stage_history_stage_check/);
  assert.match(hiringPort, /REVOKE ALL PRIVILEGES ON TABLE public\.interviews FROM PUBLIC,anon,authenticated/);
  assert.match(hiringPort, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.job_offers FROM PUBLIC, anon, authenticated/);
  for (const column of ['preferred_department_id', 'candidate_profile_url', 'referral_reason', 'resume_storage_path', 'resume_file_name', 'resume_content_type', 'resume_file_size', 'status_updated_by']) {
    assert.match(peoplePort, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  }
  assert.match(peoplePort, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*?ON public\.employee_referrals FROM PUBLIC, anon, authenticated/);
  assert.match(peoplePort, /employee_referral_files_scoped_read/);
  for (const port of [hiringPort, attendancePort, peoplePort]) {
    assert.match(port, /\nBEGIN;/);
    assert.match(port.trimEnd(), /COMMIT;$/);
    assert.match(port, /Target: replacement Supabase xfuxnljfrgvusbrpvxpa only/);
    assert.doesNotMatch(port, /DROP TABLE|TRUNCATE TABLE|DELETE FROM public\./i);
  }
});

test('isolated release acceptance applies the reviewed timesheet port and all new RPC ports in order', () => {
  const acceptance = readFileSync(new URL('../sql/isolated-auth/hris-release-rpc-acceptance.mjs', import.meta.url), 'utf8');
  const paths = [
    '20261024190002_hris_project_timesheet_review_forward_port.sql',
    '20261024191001_hris_candidate_application_document_forward_port.sql',
    '20261024200001_hris_preboarding_missing_rpcs_forward_port.sql',
    '20261024210001_hris_recruitment_pipeline_forward_port.sql',
    '20261024230001_hris_candidate_hiring_rpc_forward_port.sql',
    '20261024231001_hris_attendance_shift_rpc_forward_port.sql',
    '20261024232001_hris_employee_payroll_learning_rpc_forward_port.sql',
    '20261024220001_platform_tenant_invitations.sql',
  ];
  let previous = -1;
  for (const path of paths) {
    const next = acceptance.indexOf(`applySql('supabase/migrations/${path}')`);
    assert.ok(next > previous, `${path} is applied in release order`);
    previous = next;
  }
  assert.match(acceptance, /All 40 client-executable public RPC signatures/);
  assert.match(acceptance, /anonymous_execute/);
  assert.match(acceptance, /authenticated_missing/);
});
