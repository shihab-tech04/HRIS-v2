import React from 'react';
import { useHRIS } from '../../context/HRISContext';
import { X, Building2 } from 'lucide-react';
import { Sidebar } from './Sidebar';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: string;
  onSelectTab: (tabId: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
}) => {
  const { currentTenant, tenants, switchTenant } = useHRIS();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-900 text-white z-10 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center text-xs font-bold font-mono">
              S
            </div>
            <span className="font-bold text-sm tracking-tight">Synesis HRIS 360°</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tenant selector on mobile */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/30">
          <label className="text-[10px] text-slate-400 font-medium block mb-1 uppercase tracking-wider">
            Active Tenant
          </label>
          <select
            value={currentTenant.id}
            onChange={(e) => switchTenant(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-md py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.country})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Sidebar
            currentTab={currentTab}
            onSelectTab={(tabId) => {
              onSelectTab(tabId);
              onClose();
            }}
            className="w-full border-r-0 h-full"
          />
        </div>
      </div>
    </div>
  );
};
