#!/usr/bin/env python3
"""Resolve only the pinned WS07-vs-WS08 UI conflicts without discarding either role path."""
import re
import subprocess
from pathlib import Path

WS08 = "bafda05579a3144f455620e635bec6e093b160c1"
WS07 = "9d7cf862e060babc259d94bbbbf5daa13536b015"
UI = "src/live/LiveHrisWorkspace.tsx"
BROWSER = "tests/browser/attendance-information.spec.ts"
CONTRACT = "tests/contracts/attendance-report.test.mjs"

def git_source(commit: str, path: str) -> str:
    return subprocess.run(["git", "show", f"{commit}:{path}"], check=True,
                          capture_output=True, text=True).stdout

def component(source: str, name: str, following: str) -> str:
    start = source.index("\nfunction " + name + "(") + 1
    end = source.index("\nfunction " + following + "(", start) + 1
    return source[start:end]

def replace_exact(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise AssertionError(f"expected one occurrence, got {source.count(before)}: {before[:100]}")
    return source.replace(before, after, 1)

pending = set(subprocess.run(["git", "diff", "--name-only", "--diff-filter=U"],
                             check=True, capture_output=True, text=True).stdout.splitlines())
assert pending == {UI, BROWSER, CONTRACT}, f"Unexpected source conflicts: {pending}"

ws08 = git_source(WS08, UI)
ws07 = git_source(WS07, UI)
merged = Path(UI).read_text()
imports = re.search(r"<<<<<<< HEAD\n(  Activity,[^\n]+)\n=======\n(  Activity,[^\n]+)\n>>>>>>> [^\n]+\n", merged)
assert imports is not None, "Icon import conflict shape changed"
new_imports = "  Activity, ArrowLeft, ArrowUpRight, Bell, BookOpen, BookOpenCheck, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2, FileText, Info, Megaphone,\n"
merged = merged[:imports.start()] + new_imports + merged[imports.end():]

attendance_manager = component(ws08, "AttendanceReport", "ShiftRoster")
attendance_hr = component(ws07, "AttendanceReport", "ShiftRoster")
old_header = "function AttendanceReport({ tenantId, canView, canReport, canManage, locale }: { tenantId: string; canView: boolean; canReport: boolean; canManage: boolean; locale: Locale }) {"
new_header = "function HrAttendanceReport({ tenantId, canView, canReport, canManage, locale, view }: { tenantId: string; canView: boolean; canReport: boolean; canManage: boolean; locale: Locale; view: 'information' | 'requests' }) {"
attendance_hr = replace_exact(attendance_hr, old_header, new_header)
status_line = "  const [correctionRequestsPage, setCorrectionRequestsPage] = useState(() => typeof window !== 'undefined' && window.location.hash === '#attendance-correction-requests');"
attendance_hr = replace_exact(attendance_hr, status_line, "  const correctionRequestsPage = view === 'requests';")
effect_start = attendance_hr.index("  useEffect(() => {\n    const syncAttendanceView = () => {")
effect_end = attendance_hr.index("  }, []);\n", effect_start) + len("  }, []);\n")
attendance_hr = attendance_hr[:effect_start] + attendance_hr[effect_end:]
assert "setCorrectionRequestsPage" not in attendance_hr
attendance_hr = replace_exact(attendance_hr,
    " style={{ maxWidth: `min(${correctionRequestsPage ? 1376 : 1386}px, calc(100vw - 2rem))` }}",
    "")
attendance_hr = replace_exact(attendance_hr,
    " style={{ contain: 'paint' }} className=\"",
    " className=\"[contain:paint] ")
assert "style={{" not in attendance_hr, "Inline styles are prohibited"

att_start = merged.index("<<<<<<< HEAD\nfunction AttendanceReport(")
att_end = merged.index("\nfunction ShiftRoster(", att_start) + 1
merged = merged[:att_start] + attendance_manager + "\n" + attendance_hr + merged[att_end:]

leave_manager = component(ws08, "LeaveWorkspace", "PersonalLeaveRequests")
leave_hr = component(ws07, "LeaveWorkspace", "PersonalLeaveRequests")
leave_hr = replace_exact(leave_hr, "function LeaveWorkspace(", "function HrLeaveWorkspace(")
leave_start = merged.index("\nfunction LeaveWorkspace(") + 1
leave_end = merged.index("\nfunction PersonalLeaveRequests(", leave_start) + 1
merged = merged[:leave_start] + leave_manager + "\n" + leave_hr + merged[leave_end:]

old_att_call = """{page === 'attendance' && permissions.attendance && <AttendanceReport
            tenantId={tenantId} tenantTimeZone={tenantTimeZone} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale} view={attendanceView}
          />}"""
new_att_call = """{page === 'attendance' && permissions.attendance && (permissions.attendanceManage
            ? <HrAttendanceReport tenantId={tenantId} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale} view={attendanceView} />
            : <AttendanceReport tenantId={tenantId} tenantTimeZone={tenantTimeZone} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale} view={attendanceView} />
          )}"""
merged = replace_exact(merged, old_att_call, new_att_call)
old_leave_call = "{page === 'leave' && permissions.leave && <LeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} locale={locale} />}"
new_leave_call = "{page === 'leave' && permissions.leave && (permissions.leaveManage ? <HrLeaveWorkspace tenantId={tenantId} canManage={true} locale={locale} /> : <LeaveWorkspace tenantId={tenantId} canManage={false} locale={locale} />)}"
merged = replace_exact(merged, old_leave_call, new_leave_call)
assert "<<<<<<<" not in merged and ">>>>>>>" not in merged and "=======" not in merged, "Unresolved conflict"
assert "function HrAttendanceReport(" in merged and "function HrLeaveWorkspace(" in merged
Path(UI).write_text(merged)

# Preserve both exact-source acceptance suites under distinct test names.
Path(BROWSER).write_text(git_source(WS08, BROWSER))
Path("tests/browser/ws07-attendance-information.spec.ts").write_text(git_source(WS07, BROWSER))
Path(CONTRACT).write_text(git_source(WS08, CONTRACT))
Path("tests/contracts/ws07-attendance-report.test.mjs").write_text(git_source(WS07, CONTRACT))
live_contract_path = Path("tests/contracts/live-workspace.test.mjs")
live_contract = live_contract_path.read_text()
live_contract = replace_exact(
    live_contract,
    "workspace.indexOf('function PersonalLeaveRequests(')",
    "workspace.indexOf('function HrLeaveWorkspace(')"
)
live_contract_path.write_text(live_contract)
print("Resolved the three known merge conflicts, preserved manager and HR role-specific paths and both test suites.")
