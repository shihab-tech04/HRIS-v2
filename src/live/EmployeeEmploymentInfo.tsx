import { projectText, type Locale } from './project-locale';

/** Read-only employee-owned fields from the approved E02-09 employment information contract. */
export type EmployeeEmploymentInfo = {
  employment_type: string | null;
  department_name: string | null;
  department_code: string | null;
  designation_title: string | null;
  designation_code: string | null;
  manager_name: string | null;
  work_location_name: string | null;
  grade_name: string | null;
  grade_code: string | null;
};

function present(value: string | null | undefined): string {
  return value?.trim() || '—';
}

function nameAndCode(name: string | null, code: string | null): string {
  const label = name?.trim();
  const suffix = code?.trim();
  if (!label) return suffix || '—';
  return suffix ? `${label} (${suffix})` : label;
}

/** Presentational only: mount after the server-checked tenant RPC and actual Auth tests pass. */
export function EmployeeEmploymentInfoDetails({ info, locale }: {
  info: EmployeeEmploymentInfo;
  locale: Locale;
}) {
  const tx = (label: string) => projectText(locale, label);
  const fields = [
    { label: 'Designation', value: nameAndCode(info.designation_title, info.designation_code) },
    { label: 'Department', value: nameAndCode(info.department_name, info.department_code) },
    { label: 'Manager', value: present(info.manager_name) },
    { label: 'Work location', value: present(info.work_location_name) },
    { label: 'Grade', value: nameAndCode(info.grade_name, info.grade_code) },
    { label: 'Employment type', value: present(info.employment_type) },
  ];

  return <section aria-labelledby="employee-employment-info-heading"
    data-employee-profile="employment-information" className="mt-4 border-t border-slate-100 pt-4 text-left">
    <h4 id="employee-employment-info-heading" className="text-sm font-semibold text-[#08263D]">
      {tx('Employment information')}
    </h4>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
      {fields.map(field => <div key={field.label} className="min-w-0">
        <dt className="text-xs text-slate-500">{tx(field.label)}</dt>
        <dd className="mt-0.5 break-words font-medium text-[#08263D]">{field.value}</dd>
      </div>)}
    </dl>
  </section>;
}
