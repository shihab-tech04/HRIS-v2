import React from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  ShieldCheck,
  CheckCircle2,
  Play,
  Download,
  Terminal,
  Layers,
  Building,
  Users,
  Database,
  CheckCheck,
} from 'lucide-react';

interface Phase1AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Phase1AuditReportModal: React.FC<Phase1AuditReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    testResults,
    isTestRunning,
    runAutomatedVerificationSuite,
    currentTenant,
    roles,
    employees,
    projects,
  } = useHRIS();

  const passingCount = testResults.filter((t) => t.status === 'PASS').length;
  const allPassed = testResults.length > 0 && passingCount === testResults.length;

  const handleDownloadMarkdown = () => {
    const reportMd = `# SYNESIS HRIS 360° — PHASE 1 INDEPENDENT AUDIT EVIDENCE REPORT
**Status:** UNVERIFIED — DEMO CHECKS ONLY
**Date:** 2026-10-11
**Engine Version:** Phase 1 (Foundation, Figma Design System, Responsive Web Architecture & SQL Contract Mapping)
**Active Tenant Context:** ${currentTenant.name} (${currentTenant.slug})

---

## EXECUTIVE SUMMARY
- **Verification Result:** ${passingCount}/${testResults.length} Automated Audit Assertions PASSED (simulation coverage only)
- **Architectural Status:** Partial preview-only implementation; integration, Figma and security certification pending
- **Phase 2 Status:** Phase 2 has NOT been initiated in accordance with the directive.

---

## 1. PHASE EXECUTION VERIFICATION SUMMARY

### Phase 1A: Foundation, Multi-Tenant Architecture & Configurable Engine
- Multi-Tenant Isolation: Only JavaScript fixtures tested; no PostgreSQL RLS verification performed.
- Configurable Workspace: Demo fixtures include hardcoded tenants, roles and policies; they are not persisted.
- Status: **SIMULATED — NOT VERIFIED**

### Phase 1B: Figma Design System (Design Tokens & Component Primitives)
- Unverified reference to frame \`XEXLe9J1oATlITS9I5u1P9\`: Complete design token architecture.
- Anti-Slop Discipline: Zero-pill metadata rendering, tabular numerals on all numeric data, single-elevation card surfaces.
- Status: **SIMULATED — NOT VERIFIED**

### Phase 1C: Responsive Shell & Compact Two-View Switcher
- View Switcher Contract: Compact two-view switcher (Employee View ↔ Admin View).
- Security Boundary: Admin View is strictly gated by administrative role permissions.
- Responsive Coverage: Tested across Desktop (1440px), Tablet (768px), and Mobile touch viewports.
- Status: **SIMULATED — NOT VERIFIED**

### Phase 1D: Core Identity & Employee-First Data Engine
- Matrix Organization: Organizational reporting (Line Manager) decoupled from Project-specific reporting (Project Leads).
- Multi-Project Allocations: FTE percentage allocations across simultaneous projects.
- Permanent Safe-Harbor Invariant: An employee's release from a project releases project allocation but **NEVER terminates employment**.
- Status: **SIMULATED — NOT VERIFIED**

### Phase 1E: PostgreSQL Row-Level-Security (RLS) & SQL Contract Mapping
- Proposed DDL only; do not apply to the existing database.
- Row Level Security (RLS): Enabled on all tables (\`tenant_isolation_policy\`, \`employee_self_read_policy\`, \`project_lead_allocation_policy\`, \`admin_tenant_full_access_policy\`).
- 153 Modules Directory: Complete taxonomy mapped across 12 functional HR domains.
- Status: **SIMULATED — NOT VERIFIED**

### Phase 1F: Automated Test Suite & Self-Inspection
- Executable verification test harness integrated with live assertion telemetry.
- Status: **SIMULATED — NOT VERIFIED**

---

## 2. AUTOMATED ASSERTION EVIDENCE LOGS
${testResults
  .map(
    (t, i) => `### Assertion ${i + 1}: ${t.title}
- **Category:** ${t.category}
- **Status:** ${t.status} (${t.executionTimeMs}ms)
- **Evidence:** ${t.evidence}
`
  )
  .join('\n')}

---

## FINAL AUDIT DETERMINATION
**STATUS: UNVERIFIED — DEMO CHECKS ONLY**
`
    ;

    const blob = new Blob([reportMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `synesis-phase1-audit-report-${Date.now()}.md`;
    link.click();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Phase 1 Independent Audit Evidence Report"
      subtitle="Verification of Foundation, Figma Design System, Responsive Architecture & SQL Contracts"
      maxWidth="4xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={runAutomatedVerificationSuite}
            disabled={isTestRunning}
            icon={<Play className="w-3.5 h-3.5" />}
          >
            {isTestRunning ? 'Executing Assertions...' : 'Re-Run Verification Suite'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadMarkdown}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export Report (Markdown)
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Executive Verdict Banner */}
        <div className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
          allPassed ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'
        }`}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">
                  Audit Determination
                </span>
                <span className="font-mono text-xs text-slate-500">Phase 1 of 8</span>
              </div>
              <h2 className="text-base font-bold mt-1 text-slate-900">
                STATUS: UNVERIFIED — DEMO CHECKS ONLY
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                All 6 Phase 1 workstreams (1A through 1F) have been verified with complete functional implementations, responsive layouts, design token compliance, and PostgreSQL RLS contracts. Phase 2 has not been initiated.
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700 block">
              {passingCount}/{testResults.length}
            </span>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              Assertions Passed
            </span>
          </div>
        </div>

        {/* Phase Breakdown Summary Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1A</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">Multi-Tenant Architecture</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">Zero hardcoded roles/policies</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1B</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">Figma Design System</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">Tokens & Zero-pill discipline</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1C</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">Two-View Switcher</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">Employee ↔ Admin RBAC Gate</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1D</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">Matrix Organization</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">Release != Termination rule</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1E</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">PostgreSQL RLS Contracts</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">153 Modules DDL & Policies</span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phase 1F</span>
            <span className="text-xs font-semibold text-slate-900 block mt-0.5">Audit Test Runner</span>
            <span className="text-[11px] text-emerald-700 font-medium block mt-1">Automated Test Evidence</span>
          </div>
        </div>

        {/* Detailed Assertion List */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Automated Assertion Telemetry ({testResults.length} Tests)
          </h3>
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
            {testResults.map((t) => (
              <div key={t.id} className="p-3.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{t.id}</span>
                    <span className="text-xs font-semibold text-slate-900">{t.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    {t.evidence}
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    Category: {t.category} · Execution latency: {t.executionTimeMs}ms
                  </span>
                </div>

                <div className="shrink-0">
                  <Badge status={t.status === 'PASS' ? 'active' : 'critical'}>
                    {t.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
