import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { Table, Column } from '../../components/ui/Table';
import {
  SQL_PRODUCTION_DDL,
  ALL_153_MODULES,
  simulatePostgresRlsCheck,
  RlsTestResult,
} from '../../sql/contracts';
import { SQLContractModule } from '../../types';
import {
  Database,
  Copy,
  Check,
  Search,
  ShieldCheck,
  Play,
  Layers,
  Terminal,
} from 'lucide-react';

export const SQLContractExplorer: React.FC = () => {
  const { currentTenant } = useHRIS();

  const [activeTab, setActiveTab] = useState('modules');
  const [copiedDdl, setCopiedDdl] = useState(false);

  // Module filter state
  const [moduleSearch, setModuleSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('ALL');

  // Interactive RLS Sandbox State
  const [simRole, setSimRole] = useState<'EMPLOYEE' | 'PROJECT_LEAD' | 'TENANT_ADMIN' | 'PLATFORM_SUPER_ADMIN'>('EMPLOYEE');
  const [simTargetTenant, setSimTargetTenant] = useState<'SAME_TENANT' | 'DIFFERENT_TENANT'>('SAME_TENANT');
  const [simTable, setSimTable] = useState('employees');
  const [rlsResult, setRlsResult] = useState<RlsTestResult | null>(null);

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(SQL_PRODUCTION_DDL);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2500);
  };

  const handleRunRlsSimulation = () => {
    const isPlatform = simRole === 'PLATFORM_SUPER_ADMIN';
    const targetTenantId = simTargetTenant === 'SAME_TENANT' ? 't-101-acme' : 't-202-apex';
    const userTenantId = isPlatform ? 'platform-root' : 't-101-acme';

    const result = simulatePostgresRlsCheck(
      't-101-acme',
      {
        userId: 'emp-001',
        tenantId: userTenantId,
        roles: [simRole],
        isPlatformAdmin: isPlatform,
      },
      {
        table: simTable,
        targetTenantId,
        targetEmployeeId: simRole === 'EMPLOYEE' ? 'emp-001' : undefined,
        targetProjectLeadId: simRole === 'PROJECT_LEAD' ? 'emp-001' : undefined,
      }
    );

    setRlsResult(result);
  };

  const domains = Array.from(new Set(ALL_153_MODULES.map((m) => m.domain)));

  const filteredModules = ALL_153_MODULES.filter((mod) => {
    const matchesSearch =
      mod.name.toLowerCase().includes(moduleSearch.toLowerCase()) ||
      mod.tableName.toLowerCase().includes(moduleSearch.toLowerCase()) ||
      mod.id.toLowerCase().includes(moduleSearch.toLowerCase());
    const matchesDomain = selectedDomain === 'ALL' || mod.domain === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  const moduleColumns: Column<SQLContractModule>[] = [
    {
      key: 'id',
      header: 'Module ID',
      width: '110px',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {r.id}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Module Specification',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block">{r.name}</span>
          <span className="text-[11px] text-slate-500 font-mono">
            Table: <strong className="text-slate-700">{r.tableName}</strong> · Introduced in {r.phaseIntroduced}
          </span>
        </div>
      ),
    },
    {
      key: 'domain',
      header: 'Functional Domain',
      width: '180px',
      render: (r) => (
        <span className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {r.domain}
        </span>
      ),
    },
    {
      key: 'rlsPolicyDescription',
      header: 'PostgreSQL RLS Policy Contract',
      render: (r) => (
        <span className="text-xs text-slate-600 font-mono text-[11px]">
          {r.rlsPolicyDescription}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Contract Status',
      width: '130px',
      render: (r) => {
        const statusType =
          r.status === 'ACTIVE_SCHEMA'
            ? 'active'
            : r.status === 'IN_CONTRACT'
            ? 'info'
            : 'neutral';
        return <Badge status={statusType}>{r.status}</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                PostgreSQL Contract Engine
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-mono text-slate-500">153 Modules Taxonomy</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1">
              Database Contracts & PostgreSQL Row Level Security (RLS)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Proposed schema example only — not the active Supabase schema. RLS checks here are simulated.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyDdl}
              icon={copiedDdl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedDdl ? 'DDL Copied to Clipboard' : 'Copy proposed DDL (do not apply)'}
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <Tabs
            tabs={[
              { id: 'modules', label: '153 Modules Taxonomy', count: ALL_153_MODULES.length },
              { id: 'ddl', label: 'PostgreSQL DDL & Schema' },
              { id: 'simulator', label: 'Interactive RLS Simulator' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </div>

      {/* Tab 1: 153 Modules Explorer */}
      {activeTab === 'modules' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <Input
                placeholder="Search modules by name, table, or ID..."
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                icon={<Search className="w-4 h-4 text-slate-400" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Filter Domain:</span>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="text-xs text-slate-800 bg-white border border-slate-300 rounded-md py-1.5 px-2.5 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="ALL">All 12 Domains ({ALL_153_MODULES.length})</option>
                {domains.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <Card
            title={`Modules Catalog (${filteredModules.length} Modules)`}
            subtitle="Each module defines a clear database contract and tenant-isolated RLS policy"
            noPadding
          >
            <Table
              columns={moduleColumns}
              data={filteredModules}
              keyExtractor={(r) => r.id}
            />
          </Card>
        </div>
      )}

      {/* Tab 2: PostgreSQL DDL Script */}
      {activeTab === 'ddl' && (
        <Card
          title="Unverified proposed DDL — not the live schema"
          subtitle="Executable SQL schema definitions with RLS policies and table constraints"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyDdl}
              icon={copiedDdl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedDdl ? 'Copied' : 'Copy SQL'}
            </Button>
          }
        >
          <div className="relative">
            <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed max-h-[600px] border border-slate-800">
              <code>{SQL_PRODUCTION_DDL}</code>
            </pre>
          </div>
        </Card>
      )}

      {/* Tab 3: Interactive RLS Sandbox Simulator */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card
            title="PostgreSQL RLS Policy Simulation Engine"
            subtitle="Verify row filtering behavior against simulated JWT contexts"
            className="lg:col-span-1"
          >
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Actor Execution Role
                </label>
                <select
                  value={simRole}
                  onChange={(e) => setSimRole(e.target.value as any)}
                  className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="EMPLOYEE">EMPLOYEE (Standard Staff)</option>
                  <option value="PROJECT_LEAD">PROJECT_LEAD (Operational Lead)</option>
                  <option value="TENANT_ADMIN">TENANT_ADMIN (Tenant Administrator)</option>
                  <option value="PLATFORM_SUPER_ADMIN">PLATFORM_SUPER_ADMIN (Platform Scope)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Target Tenant Boundary
                </label>
                <select
                  value={simTargetTenant}
                  onChange={(e) => setSimTargetTenant(e.target.value as any)}
                  className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="SAME_TENANT">Same Tenant Workspace (Acme Global)</option>
                  <option value="DIFFERENT_TENANT">Foreign Tenant Workspace (Apex BioTech)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 block mb-1">
                  Target PostgreSQL Table
                </label>
                <select
                  value={simTable}
                  onChange={(e) => setSimTable(e.target.value)}
                  className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="employees">employees (Master Directory)</option>
                  <option value="project_allocations">project_allocations (Matrix Engine)</option>
                  <option value="audit_logs">audit_logs (Tamper Evident)</option>
                  <option value="dynamic_org_roles">dynamic_org_roles (RBAC)</option>
                </select>
              </div>

              <Button
                variant="primary"
                onClick={handleRunRlsSimulation}
                icon={<Play className="w-3.5 h-3.5" />}
              >
                Execute RLS Policy Check
              </Button>
            </div>
          </Card>

          {/* Simulation Output Card */}
          <div className="lg:col-span-2">
            <Card
              title="PostgreSQL Execution & Policy Evaluation"
              subtitle="Output from simulatePostgresRlsCheck contract assertion"
            >
              {rlsResult ? (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Policy Evaluated: <code className="font-mono text-blue-700">{rlsResult.policyName}</code>
                        </span>
                        <Badge status={rlsResult.status === 'PASS' ? 'active' : 'critical'}>
                          {rlsResult.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                        {rlsResult.details}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono text-xs font-bold text-slate-900 block">
                        Result: {rlsResult.actualOutcome}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Expected: {rlsResult.expectedOutcome}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 text-slate-100 rounded-lg font-mono text-xs leading-relaxed border border-slate-800">
                    <div className="text-slate-400 mb-2">-- Evaluated PostgreSQL RLS Logic:</div>
                    <code>
                      SET LOCAL app.current_tenant_id = '{simTargetTenant === 'SAME_TENANT' ? 't-101-acme' : 't-202-apex'}';<br />
                      SELECT * FROM {simTable} WHERE tenant_id = current_setting('app.current_tenant_id')::uuid;<br />
                      -- Decision: {rlsResult.actualOutcome} (Policy: {rlsResult.policyName})
                    </code>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-500">
                  Select parameters on the left and click "Execute RLS Policy Check" to evaluate PostgreSQL security rules.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
