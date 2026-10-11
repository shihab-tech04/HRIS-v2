import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Toggle } from '../../components/ui/Toggle';
import { Table, Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { DynamicOrgRole, Department } from '../../types';
import { Plus, Shield, Building, Trash2, Edit2, CheckCircle2 } from 'lucide-react';

export const OrgStructureAndRoles: React.FC = () => {
  const {
    roles,
    createRole,
    deleteRole,
    departments,
    createDepartment,
    currentTenant,
  } = useHRIS();

  const [activeTab, setActiveTab] = useState('roles');

  // Role Creation Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [isAdministrative, setIsAdministrative] = useState(false);
  const [permissionInput, setPermissionInput] = useState('timesheets_view, leaves_review');

  // Department Creation Modal State
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptCostCenter, setDeptCostCenter] = useState('');

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim() || !roleCode.trim()) return;

    const permissions = permissionInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    createRole({
      name: roleName.trim(),
      code: roleCode.trim().toUpperCase(),
      description: roleDesc.trim() || 'Custom configurable role',
      isAdministrative,
      permissions,
      isCustom: true,
    });

    setIsRoleModalOpen(false);
    setRoleName('');
    setRoleCode('');
    setRoleDesc('');
    setIsAdministrative(false);
  };

  const handleCreateDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim()) return;

    createDepartment({
      name: deptName.trim(),
      code: deptCode.trim().toUpperCase(),
      costCenterCode: deptCostCenter.trim() || 'CC-GENERAL',
    });

    setIsDeptModalOpen(false);
    setDeptName('');
    setDeptCode('');
    setDeptCostCenter('');
  };

  const roleColumns: Column<DynamicOrgRole>[] = [
    {
      key: 'name',
      header: 'Role Name',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block">{r.name}</span>
          <span className="text-[11px] text-slate-500 line-clamp-1">{r.description}</span>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'System Code',
      width: '140px',
      render: (r) => (
        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {r.code}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Authorization Scope',
      width: '160px',
      render: (r) => (
        <Badge status={r.isAdministrative ? 'active' : 'neutral'}>
          {r.isAdministrative ? 'Administrative' : 'Operational'}
        </Badge>
      ),
    },
    {
      key: 'permissions',
      header: 'Dynamic Permissions',
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-sm">
          {r.permissions.map((perm) => (
            <span
              key={perm}
              className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded"
            >
              {perm}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '90px',
      align: 'right',
      render: (r) =>
        r.isCustom ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteRole(r.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <span className="text-[10px] text-slate-400 font-mono">System</span>
        ),
    },
  ];

  const deptColumns: Column<Department>[] = [
    {
      key: 'name',
      header: 'Department Name',
      render: (r) => <span className="font-semibold text-slate-900">{r.name}</span>,
    },
    {
      key: 'code',
      header: 'Dept Code',
      width: '120px',
      render: (r) => (
        <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {r.code}
        </span>
      ),
    },
    {
      key: 'costCenterCode',
      header: 'Cost Center',
      width: '140px',
      render: (r) => (
        <span className="font-mono text-xs text-slate-600">{r.costCenterCode}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header and Rule Explanation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Organizational Structure & Dynamic Role Engine
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict Invariant: No organizational roles, permissions, or departments are permanently hardcoded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'roles' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsRoleModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Dynamic Role
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsDeptModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Department
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <Tabs
            tabs={[
              { id: 'roles', label: 'Configurable Roles', count: roles.length },
              { id: 'depts', label: 'Departments & Cost Centers', count: departments.length },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </div>

      {/* Main Table Content */}
      {activeTab === 'roles' ? (
        <Card
          title="Tenant Dynamic Roles"
          subtitle="Roles can be attached to employees without changing account credentials"
          noPadding
        >
          <Table
            columns={roleColumns}
            data={roles}
            keyExtractor={(r) => r.id}
          />
        </Card>
      ) : (
        <Card
          title="Configured Departments"
          subtitle="Cost centers and organizational reporting divisions"
          noPadding
        >
          <Table
            columns={deptColumns}
            data={departments}
            keyExtractor={(r) => r.id}
          />
        </Card>
      )}

      {/* Role Creation Modal */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        title="Create New Dynamic Organization Role"
        subtitle={`Will be scoped to ${currentTenant.name} workspace`}
      >
        <form onSubmit={handleCreateRole} className="flex flex-col gap-4">
          <Input
            label="Role Name"
            placeholder="e.g. Principal Systems Architect, VP Strategy"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            required
          />

          <Input
            label="Role Identifier Code"
            placeholder="e.g. PRINCIPAL_ARCH, VP_STRAT"
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="role-description-input" className="text-xs font-medium text-slate-700">
              Role Description & Purpose
            </label>
            <textarea
              id="role-description-input"
              rows={2}
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              placeholder="State key responsibility boundaries..."
              className="w-full text-xs text-slate-900 bg-white border border-slate-300 rounded-md p-2.5 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none"
            />
          </div>

          <Toggle
            label="Administrative Level Authorization"
            description="Grant ability to access Admin View and tenant configuration console."
            checked={isAdministrative}
            onChange={setIsAdministrative}
          />

          <Input
            label="Permissions (Comma-separated tokens)"
            placeholder="e.g. timesheets_approve, projects_manage, leaves_signoff"
            value={permissionInput}
            onChange={(e) => setPermissionInput(e.target.value)}
            helperText="Custom RBAC claims enforced by application and PostgreSQL RLS contracts."
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsRoleModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!roleName.trim() || !roleCode.trim()}
            >
              Save Dynamic Role
            </Button>
          </div>
        </form>
      </Modal>

      {/* Department Creation Modal */}
      <Modal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        title="Add Organizational Department"
        subtitle="Configurable organizational division"
      >
        <form onSubmit={handleCreateDept} className="flex flex-col gap-4">
          <Input
            label="Department Name"
            placeholder="e.g. Global Research & Development"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            required
          />
          <Input
            label="Department Code"
            placeholder="e.g. RND, SEC, MKTG"
            value={deptCode}
            onChange={(e) => setDeptCode(e.target.value)}
            required
          />
          <Input
            label="Cost Center Code"
            placeholder="e.g. CC-3040"
            value={deptCostCenter}
            onChange={(e) => setDeptCostCenter(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeptModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!deptName.trim() || !deptCode.trim()}
            >
              Save Department
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
