import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Toggle } from '../../components/ui/Toggle';
import { Building, Save, Download, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const TenantSettings: React.FC = () => {
  const { currentTenant, updateTenantPolicies, updateTenantBranding, recordAuditLog } = useHRIS();

  const [workDays, setWorkDays] = useState(String(currentTenant.policies.defaultWorkWeekDays));
  const [workHours, setWorkHours] = useState(String(currentTenant.policies.standardWorkHoursPerDay));
  const [probationDays, setProbationDays] = useState(String(currentTenant.policies.probationPeriodDays));
  const [fiscalMonth, setFiscalMonth] = useState(String(currentTenant.policies.fiscalYearStartMonth));
  const [currency, setCurrency] = useState(currentTenant.policies.currency);
  const [timezone, setTimezone] = useState(currentTenant.policies.timezone);
  const [overtimeEligible, setOvertimeEligible] = useState(currentTenant.policies.overtimeEligibleByDefault);
  const [leaveEncashment, setLeaveEncashment] = useState(currentTenant.policies.leaveEncashmentAllowed);

  const [density, setDensity] = useState(currentTenant.branding.density);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSavePolicies = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantPolicies({
      defaultWorkWeekDays: parseInt(workDays, 10),
      standardWorkHoursPerDay: parseFloat(workHours),
      probationPeriodDays: parseInt(probationDays, 10),
      fiscalYearStartMonth: parseInt(fiscalMonth, 10),
      currency,
      timezone,
      overtimeEligibleByDefault: overtimeEligible,
      leaveEncashmentAllowed: leaveEncashment,
    });

    updateTenantBranding({ density });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleExportConfig = () => {
    const configBlob = new Blob([JSON.stringify(currentTenant, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(configBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `synesis-tenant-config-${currentTenant.slug}.json`;
    link.click();
    recordAuditLog(
      'TENANT_CONFIG_EXPORT',
      'tenants',
      currentTenant.id,
      `Exported tenant JSON configuration profile for ${currentTenant.name}.`
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Tenant Configuration Engine
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Governs organizational policies, fiscal calendars, and operating rules without hardcoding.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportConfig}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export Tenant Profile (JSON)
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Tenant configuration updated and broadcast across all active session contexts.</span>
        </div>
      )}

      <form onSubmit={handleSavePolicies} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policy Configuration Card */}
        <Card
          title="Operating Rules & Calendar"
          subtitle="Define legal working parameters and accrual baselines"
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Standard Work Week (Days)"
                type="number"
                min="4"
                max="7"
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value)}
                required
              />
              <Input
                label="Standard Work Hours / Day"
                type="number"
                min="4"
                max="12"
                step="0.5"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Probation Period (Days)"
                type="number"
                min="30"
                max="365"
                value={probationDays}
                onChange={(e) => setProbationDays(e.target.value)}
                required
              />
              <Select
                label="Fiscal Year Anchor Month"
                value={fiscalMonth}
                onChange={(e) => setFiscalMonth(e.target.value)}
                options={[
                  { value: '1', label: 'January (Calendar Year)' },
                  { value: '4', label: 'April (Standard Q1)' },
                  { value: '7', label: 'July' },
                  { value: '10', label: 'October' },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Primary Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={[
                  { value: 'USD', label: 'USD ($) — US Dollar' },
                  { value: 'EUR', label: 'EUR (€) — Euro' },
                  { value: 'GBP', label: 'GBP (£) — British Pound' },
                  { value: 'SGD', label: 'SGD ($) — Singapore Dollar' },
                  { value: 'JPY', label: 'JPY (¥) — Japanese Yen' },
                ]}
              />
              <Select
                label="Primary Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={[
                  { value: 'America/New_York', label: 'America/New_York (EST)' },
                  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
                  { value: 'Europe/London', label: 'Europe/London (GMT)' },
                  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
                  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
                  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
                ]}
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
              <Toggle
                label="Overtime Eligibility by Default"
                description="Staff members automatically inherit overtime compensation rate multipliers."
                checked={overtimeEligible}
                onChange={setOvertimeEligible}
              />
              <Toggle
                label="Leave Encashment Permitted"
                description="Allow staff to encash unused annual leave balance upon fiscal year closure."
                checked={leaveEncashment}
                onChange={setLeaveEncashment}
              />
            </div>
          </div>
        </Card>

        {/* Workspace Details & Branding */}
        <div className="flex flex-col gap-4">
          <Card
            title="Legal Entity & Identity"
            subtitle="Tenant legal details registered for employment contracts"
          >
            <div className="flex flex-col gap-3 text-xs text-slate-700">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Legal Entity Name:</span>
                <span className="font-semibold text-slate-900">{currentTenant.legalEntityName}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Registered Country:</span>
                <span className="font-medium text-slate-800">{currentTenant.country}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Industry Classification:</span>
                <span className="font-medium text-slate-800">{currentTenant.industry}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tenant Slug Identifier:</span>
                <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{currentTenant.slug}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Tenant UUID:</span>
                <span className="font-mono text-[11px] text-slate-600">{currentTenant.id}</span>
              </div>
            </div>
          </Card>

          <Card
            title="Interface Density & Layout"
            subtitle="Configurable viewport display parameters"
          >
            <div className="flex flex-col gap-4">
              <Select
                label="Grid Density"
                value={density}
                onChange={(e) => setDensity(e.target.value as 'compact' | 'standard' | 'spacious')}
                options={[
                  { value: 'compact', label: 'Compact (36px high-density tables)' },
                  { value: 'standard', label: 'Standard (44px baseline)' },
                  { value: 'spacious', label: 'Spacious (52px airy layout)' },
                ]}
              />

              <Button
                type="submit"
                variant="primary"
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Save Configuration
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
};
