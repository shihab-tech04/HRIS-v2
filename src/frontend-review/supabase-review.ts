import type { SupabaseClient } from '@supabase/supabase-js';

// Offline-only adapter. Never initializes Supabase, sends HTTP requests, or changes records.
const readonlyValue = () => ({ data: [], error: null, count: 0 });
const deniedValue = () => ({ data: null, error: { message: 'Offline review is read-only.', code: 'OFFLINE_READ_ONLY' } });
function query(write = false, single = false): any {
  const response = Promise.resolve(write ? deniedValue() : single ? { data: null, error: null, count: 0 } : readonlyValue());
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return response.then.bind(response);
      if (property === 'catch') return response.catch.bind(response);
      if (property === 'finally') return response.finally.bind(response);
      if (property === 'single' || property === 'maybeSingle') return () => query(write, true);
      if (['insert', 'upsert', 'update', 'delete'].includes(String(property))) return () => query(true);
      return () => query(write, single);
    },
  });
}
const blocked = { message: 'Offline frontend review has no authentication or storage connection.' };
export const supabaseUrl = 'offline-review';
export const supabasePublicKey = 'offline-no-key';
export const supabase = {
  from: () => query(),
  rpc: (name: string, args?: { p_report?: boolean }) => {
    if (name === 'hris_get_tenant_attendance_data') {
      const reviewEmployees = Array.from({ length: 6 }, (_, index) => ({
        employee_id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
        employee_number: `REVIEW-${String(index + 1).padStart(3, '0')}`,
        full_name: `Review Employee ${String.fromCharCode(65 + index)}`,
        designation_title: index === 0 ? 'Design Reviewer' : 'Review Associate',
        team_name: index < 3 ? 'Design Review' : 'Review Operations',
        department_name: 'Review Department',
        attendance_date: '2026-10-22', work_mode: index % 2 ? 'home' : 'office',
        check_in: '09:00', check_out: '17:30', status: 'present',
        office_hours: 8, working_hours: 8.5, deviation: 0.5,
      }));
      const reviewCorrections = Array.from({ length: 8 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(2101 + index).padStart(12, '0')}`,
        employee_id: `00000000-0000-4000-8000-${String(10 + index).padStart(12, '0')}`,
        employee_number: `REVIEW-${String(index + 1).padStart(3, '0')}`,
        full_name: `Review Employee ${String.fromCharCode(65 + index)}`,
        attendance_date: '2026-10-20',
        requested_check_in: '09:00', requested_check_out: '18:00',
        requested_work_mode: null,
        requested_at: '2026-10-21T09:30:00Z',
        reason: ['Forgot to punch', 'Working from home', 'Clock-in correction', 'Client meeting',
          'Time adjustment', 'Remote work', 'Office visit', 'Client visit'][index],
        status: 'pending', resolution_note: null,
      })).concat(['approved', 'rejected'].map((status, index) => ({
        id: `00000000-0000-4000-8000-${String(2109 + index).padStart(12, '0')}`,
        employee_id: `00000000-0000-4000-8000-${String(18 + index).padStart(12, '0')}`,
        employee_number: `REVIEW-${String(index + 9).padStart(3, '0')}`,
        full_name: `Review Employee ${String.fromCharCode(73 + index)}`,
        attendance_date: '2026-10-20', requested_check_in: '09:00', requested_check_out: '18:00',
        requested_work_mode: null, requested_at: '2026-10-21T09:30:00Z',
        reason: index ? 'Rejected time request' : 'Approved time request',
        status, resolution_note: 'Synthetic decision note',
      })));
      return Promise.resolve({ data: args?.p_report
        ? reviewEmployees : { records: reviewEmployees, corrections: reviewCorrections }, error: null });
    }
    if (name === 'hris_get_tenant_leave_data') {
      const reviewRequests = [
        { id: '00000000-0000-4000-8000-000000001101',
          employee_id: '00000000-0000-4000-8000-000000000010',
          employee_number: 'REVIEW-001', full_name: 'Review Employee A',
          leave_type_name: 'Annual Leave', leave_type_code: 'AL',
          from_date: '2026-10-23', to_date: '2026-10-24',
          reason: 'Review-only fixture', submitted_at: '2026-10-21T09:30:00Z', requested_days: 2, status: 'pending', attachment_url: null },
        ...['C', 'D', 'E', 'F', 'G', 'H', 'I'].map((letter, index) => ({
          id: `00000000-0000-4000-8000-${String(1103 + index).padStart(12, '0')}`,
          employee_id: `00000000-0000-4000-8000-${String(12 + index).padStart(12, '0')}`,
          employee_number: `REVIEW-${String(index + 3).padStart(3, '0')}`,
          full_name: `Review Employee ${letter}`,
          leave_type_name: index % 2 ? 'Sick Leave' : 'Annual Leave',
          leave_type_code: index % 2 ? 'SL' : 'AL',
          from_date: '2026-10-23', to_date: '2026-10-24',
          reason: ['Personal appointment', 'Family support', 'Routine medical visit', 'Personal work', 'Health appointment', 'Family occasion', 'Personal leave'][index],
          submitted_at: '2026-10-21T09:30:00Z', requested_days: 2, status: 'pending',
          attachment_url: null,
        })),
        { id: '00000000-0000-4000-8000-000000001102',
          employee_id: '00000000-0000-4000-8000-000000000011',
          employee_number: 'REVIEW-002', full_name: 'Review Employee B',
          leave_type_name: 'Sick Leave', leave_type_code: 'SL',
          from_date: '2026-10-19', to_date: '2026-10-20',
          reason: 'Review-only fixture', submitted_at: '2026-10-15T09:30:00Z', requested_days: 2, status: 'approved', attachment_url: null },
      ];
      return Promise.resolve({ data: { requests: reviewRequests,
        leave_types: [{ id: '00000000-0000-4000-8000-000000002001', name: 'Annual Leave' },
          { id: '00000000-0000-4000-8000-000000002002', name: 'Sick Leave' }],
        holidays: [] }, error: null });
    }
    if (name === 'hris_get_my_project_tasks') {
      return Promise.resolve({ data: { tasks: [] }, error: null });
    }
    if (name === 'hris_get_my_learning_context') {
      return Promise.resolve({ data: {
        tenant_id: '00000000-0000-4000-8000-000000000001',
        programs: [], enrollments: [],
      }, error: null });
    }
    if (name === 'hris_get_my_appraisal_work') {
      return Promise.resolve({ data: { appraisals: [] }, error: null });
    }
    if (name === 'hris_get_my_pending_requests') {
      return Promise.resolve({ data: {
        tenant_id: '00000000-0000-4000-8000-000000000001',
        employee_id: '00000000-0000-4000-8000-000000000003',
        requests: [],
      }, error: null });
    }
    if (name === 'hris_get_my_dashboard_data') {
      return Promise.resolve({ data: {
        dashboard_date: '2026-10-22', balance_year: 2026,
        employee: {
          id: '00000000-0000-4000-8000-000000000003',
          full_name: 'Review Employee', employee_number: 'REVIEW-001',
          designation_title: 'Design Review', department_name: 'Review Department',
          team_name: 'Design Review', official_email: 'review@example.invalid',
        },
        attendance: {
          records: [{ attendance_date: '2026-10-22', check_in: '09:00',
            check_out: '17:30', work_hours: 8.5, work_mode: 'office',
            status: 'present' }],
        },
        balances: [], requests: [], holidays: [], unavailable_leave_types: [],
      }, error: null });
    }
    if (name === 'hris_get_my_attendance_period') {
      return Promise.resolve({ data: {
        tenant_id: '00000000-0000-4000-8000-000000000001',
        month_start: '2026-10-01',
        records: [{ attendance_date: '2026-10-22', check_in: '09:00',
          check_out: '17:30', work_hours: 8.5, work_mode: 'office' }],
      }, error: null });
    }
    if (name === 'hris_get_tenant_dashboard_summary') {
      return Promise.resolve({ data: {
        dashboard_date: '2026-10-22', employees: 42, team_members: 18,
        present_today: 15, absent_today: 2, wfo_today: 9, wfh_today: 5,
        client_meeting_today: 1, on_leave_today: 1, late_today: 2,
        attendance_corrections_pending: 3, leave_pending: 4,
        attendance_last_7_days: [
          { date: '2026-10-16', records: 11 }, { date: '2026-10-17', records: 13 },
          { date: '2026-10-18', records: 15 }, { date: '2026-10-19', records: 12 },
          { date: '2026-10-20', records: 16 }, { date: '2026-10-21', records: 14 },
          { date: '2026-10-22', records: 15 },
        ],
      }, error: null });
    }
    if (name === 'hris_get_tenant_dashboard_team_report') {
      return Promise.resolve({ data: {
        dashboard_date: '2026-10-22',
        teams: [{ team_id: 'offline-review-team', team_name: 'Design Review',
          present_members: 15, absent_members: 2, total_members: 18,
          work_from_office: 9, work_from_home: 5, client_meeting: 1 }],
      }, error: null });
    }
    if (name === 'hris_get_tenant_dashboard_team_details') {
      return Promise.resolve({ data: { report_date: '2026-10-22', details: [] }, error: null });
    }
    return query(!/^(hris_get_|get_|employee_get_|admin_get_|admin_list_|candidate_get_|candidate_public_|platform_hris_list_|has_|is_)/.test(name));
  },
  auth: {
    getUser: async () => ({ data: { user: null }, error: blocked }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: null, error: blocked }),
    resetPasswordForEmail: async () => ({ data: null, error: blocked }),
    updateUser: async () => ({ data: null, error: blocked }),
  },
  storage: { from: () => ({
    download: async () => ({ data: null, error: blocked }),
    upload: async () => deniedValue(),
    remove: async () => deniedValue(),
    createSignedUrl: async () => ({ data: null, error: blocked }),
    list: async () => readonlyValue(),
  }) },
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }), subscribe: () => ({ unsubscribe: () => {} }) }),
  removeChannel: async () => 'ok',
  functions: { invoke: async () => deniedValue() },
} as unknown as SupabaseClient;
