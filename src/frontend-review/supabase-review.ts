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
  rpc: (name: string) => {
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
