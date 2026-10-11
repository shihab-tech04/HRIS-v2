import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Breadcrumbs, BreadcrumbItem } from '../ui/Breadcrumbs';
import { Button } from '../ui/Button';
import {
  Building2,
  User,
  ShieldCheck,
  ChevronDown,
  Layers,
  FileCheck2,
  Sparkles,
} from 'lucide-react';

interface TopBarProps {
  breadcrumbs: BreadcrumbItem[];
  onOpenAuditModal: () => void;
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  breadcrumbs,
  onOpenAuditModal,
  onToggleMobileMenu,
}) => {
  const {
    viewMode,
    switchView,
    currentTenant,
    tenants,
    switchTenant,
    currentPersona,
    setPersona,
    availablePersonas,
  } = useHRIS();

  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isPersonaDropdownOpen, setIsPersonaDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-4 lg:px-8 h-16 bg-white border-b border-slate-200">
      {/* Zone 1: Brand & Tenant Context */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Layers className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <a
            href="/"
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <div className="w-6 h-6 rounded-md bg-[#085587] text-white flex items-center justify-center text-xs font-bold font-mono shadow-xs">
              S
            </div>
            <span>Synesis HRIS</span>
          </a>

          <span className="text-slate-300 font-light mx-1 hidden sm:inline" aria-hidden="true">/</span>

          {/* Tenant Selector Dropdown */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setIsTenantDropdownOpen(!isTenantDropdownOpen);
                setIsPersonaDropdownOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="max-w-[130px] truncate">{currentTenant.name}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isTenantDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 z-50">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100 uppercase tracking-wider">
                  Select Tenant Workspace
                </div>
                {tenants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      switchTenant(t.id);
                      setIsTenantDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      t.id === currentTenant.id ? 'bg-[#F0F7FB] font-semibold text-[#085587]' : 'text-slate-700'
                    }`}
                  >
                    <div className="truncate">
                      <p className="truncate">{t.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{t.country} · {t.policies.currency}</p>
                    </div>
                    {t.id === currentTenant.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#085587] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transparent Persistence Mode Badge */}
          <span className="hidden xl:inline text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Persistence: Dev Fixtures
          </span>
        </div>
      </div>

      {/* Zone 2: Navigation Breadcrumbs Trail */}
      <div className="hidden md:flex items-center flex-1 max-w-xl">
        <Breadcrumbs items={breadcrumbs} />
      </div>

      {/* Zone 3: Compact Two-View Switcher, Persona & Audit Trigger */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Compact Two-View Switcher (Figma pattern) */}
        <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg shadow-2xs">
          <button
            type="button"
            onClick={() => switchView('employee')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer select-none ${
              viewMode === 'employee'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Employee View
          </button>
          <button
            type="button"
            onClick={() => switchView('admin')}
            title={
              !currentPersona.canAccessAdminView
                ? 'Admin View requires administrative role privileges'
                : 'Switch to Administration & Configuration Console'
            }
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer select-none flex items-center gap-1 ${
              viewMode === 'admin'
                ? 'bg-[#085587] text-white shadow-2xs font-semibold'
                : currentPersona.canAccessAdminView
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 opacity-60 cursor-not-allowed'
            }`}
          >
            <span>Admin View</span>
            {!currentPersona.canAccessAdminView && (
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1 rounded">Lock</span>
            )}
          </button>
        </div>

        {/* Persona Role Switcher for Testing RBAC */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsPersonaDropdownOpen(!isPersonaDropdownOpen);
              setIsTenantDropdownOpen(false);
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 rounded-full bg-[#085587] text-white flex items-center justify-center text-[10px] font-semibold">
              {currentPersona.avatarText}
            </div>
            <span className="hidden xl:inline max-w-[100px] truncate">{currentPersona.name}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isPersonaDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100 uppercase tracking-wider flex items-center justify-between">
                <span>Switch Active Identity</span>
                <span className="text-[10px] text-slate-400 font-normal">RBAC Test</span>
              </div>
              {availablePersonas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPersona(p.id);
                    setIsPersonaDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-slate-50 transition-colors ${
                    p.id === currentPersona.id ? 'bg-[#F0F7FB] font-semibold text-slate-900' : 'text-slate-700'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-[#085587] text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {p.avatarText}
                  </div>
                  <div className="truncate flex-1">
                    <p className="truncate text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{p.roleDescription}</p>
                  </div>
                  {p.canAccessAdminView && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                      Admin
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phase 1 Independent Audit Evidence Trigger */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onOpenAuditModal}
          icon={<FileCheck2 className="w-3.5 h-3.5 text-[#085587]" />}
        >
          <span className="hidden sm:inline">Phase 1 Audit Report</span>
          <span className="sm:hidden">Audit</span>
        </Button>
      </div>
    </header>
  );
};
