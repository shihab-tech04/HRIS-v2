import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table, type Column } from '../../components/ui/Table';
import { useHRIS } from '../../context/HRISContext';
import { generateSyntheticPreviewUser } from './synthetic-user-generator.mjs';
import type { SyntheticPreviewUser } from './synthetic-user-generator.mjs';

const STORAGE_KEY = 'synesis-hris-ws07-preview-users-v1';

function readPreviewUsers(): SyntheticPreviewUser[] {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((record): record is SyntheticPreviewUser =>
      record !== null && typeof record === 'object'
      && record.persistence === 'preview' && typeof record.tenantId === 'string'
      && typeof record.userId === 'string' && typeof record.employeeId === 'string'
      && typeof record.email === 'string' && record.email.endsWith('@example.com')
      && typeof record.fullName === 'string' && typeof record.roleId === 'string'
      && typeof record.department === 'string' && typeof record.designation === 'string'
      && (record.status === 'active' || record.status === 'inactive')).slice(0, 200);
  } catch {
    return [];
  }
}

export const PreviewUserManagement: React.FC = () => {
  const { currentTenant, roles, departments } = useHRIS();
  const [users, setUsers] = useState<SyntheticPreviewUser[]>(readPreviewUsers);
  const [roleId, setRoleId] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [fullName, setFullName] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const tenantRoles = useMemo(() => roles.filter(role =>
    role.tenantId === currentTenant.id && !/platform.?super.?admin/i.test(role.code + ' ' + role.name)),
    [roles, currentTenant.id]);
  const tenantDepartments = useMemo(() => departments.filter(item =>
    item.tenantId === currentTenant.id), [departments, currentTenant.id]);
  const tenantUsers = users.filter(item => item.tenantId === currentTenant.id);
  const selected = tenantUsers.find(item => item.userId === selectedId) || null;
  const changing = tenantUsers.find(item => item.userId === confirmId) || null;

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch {
      // Browser storage may be unavailable; in-memory preview still works.
    }
  }, [users]);

  const visibleUsers = tenantUsers.filter(item => {
    const matchesText = [item.fullName, item.email, item.userId, item.employeeId]
      .some(value => value.toLowerCase().includes(query.trim().toLowerCase()));
    return matchesText && (!roleFilter || item.roleId === roleFilter)
      && (!statusFilter || item.status === statusFilter);
  });

  const generate = () => {
    setNotice('');
    setError('');
    try {
      if (users.length >= 200) throw new Error('This browser preview supports up to 200 users.');
      const newUser = generateSyntheticPreviewUser({
        tenantId: currentTenant.id, roleId, department, designation, existingUsers: users,
        ...(fullName.trim() ? { name: fullName.trim() } : {}),
      });
      setUsers(previous => [...previous, newUser]);
      setSelectedId(newUser.userId);
      setEditing(false);
      setNotice('Preview user generated. No production account was created.');
      setFullName('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate preview user.');
    }
  };

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setError('');
    if (!fullName.trim() || !roleId || !department.trim() || !designation.trim()) {
      setError('Name, role, department and designation are required.');
      return;
    }
    if (!tenantRoles.some(role => role.id === roleId)) {
      setError('Select a role configured for this tenant.');
      return;
    }
    const nextName = fullName.trim();
    setUsers(previous => previous.map(item => item.userId === selected.userId
      ? { ...item, fullName: nextName, roleId, department: department.trim(), designation: designation.trim() }
      : item));
    setEditing(false);
    setNotice('Preview record updated. Email and identifiers are preserved.');
  };

  const openEdit = () => {
    if (!selected) return;
    setFullName(selected.fullName);
    setRoleId(selected.roleId);
    setDepartment(selected.department);
    setDesignation(selected.designation);
    setError('');
    setEditing(true);
  };

  const updateStatus = () => {
    if (!changing) return;
    setUsers(previous => previous.map(item => item.userId === changing.userId
      ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' }
      : item));
    setNotice('Preview status updated. Real account access is unchanged.');
    setConfirmId('');
  };

  const columns: Column<SyntheticPreviewUser>[] = [
    { key: 'fullName', header: 'User', render: item => (
      <div><p className="font-semibold text-slate-900">{item.fullName}</p>
        <p className="text-slate-500">{item.email}</p></div>
    ) },
    { key: 'userId', header: 'User ID', render: item => <p className="font-mono">{item.userId}</p> },
    { key: 'roleId', header: 'Role', render: item =>
      <p>{tenantRoles.find(role => role.id === item.roleId)?.name || 'Role not available'}</p> },
    { key: 'department', header: 'Department' },
    { key: 'status', header: 'Preview status', render: item =>
      <Badge status={item.status === 'active' ? 'active' : 'neutral'}>{item.status}</Badge> },
    { key: 'actions', header: 'Actions', align: 'right', render: item => (
      <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedId(item.userId); setEditing(false); }}>
        Details
      </Button>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-slate-900">Admin-controlled preview users</h3>
        <p className="mt-1 text-sm text-slate-600">Synthetic identities only. Stored in this browser session; not Supabase Auth accounts or SQL records.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Full name (optional)" placeholder="Generated automatically if empty"
            value={selected ? '' : fullName} onChange={event => setFullName(event.target.value)} disabled={Boolean(selected)} />
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="preview-role">Role</label>
            <select id="preview-role" className="w-full rounded-md border border-slate-300 p-2 text-sm"
              value={selected ? '' : roleId} disabled={Boolean(selected)}
              onChange={event => setRoleId(event.target.value)}>
              <option value="">Select role</option>
              {tenantRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="preview-department">Department</label>
            <select id="preview-department" className="w-full rounded-md border border-slate-300 p-2 text-sm"
              value={selected ? '' : department} disabled={Boolean(selected)}
              onChange={event => setDepartment(event.target.value)}>
              <option value="">Select department</option>
              {tenantDepartments.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <Input label="Designation" placeholder="e.g. Officer"
            value={selected ? '' : designation} onChange={event => setDesignation(event.target.value)}
            disabled={Boolean(selected)} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-slate-700">{notice}</p>}
        <div className="mt-4 flex gap-2">
          <Button type="button" disabled={!tenantRoles.length || !tenantDepartments.length || Boolean(selected)}
            onClick={generate}>Generate Random User</Button>
          {selected && <Button type="button" variant="secondary" onClick={() => { setSelectedId(''); setEditing(false); setError(''); setFullName(''); setRoleId(''); setDepartment(''); setDesignation(''); }}>New user</Button>}
        </div>
      </section>

      <Card title="Preview user directory" subtitle="Search, view, edit and change synthetic user status. No production privileges are granted.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Search" placeholder="Name, email or user ID" value={query} onChange={event => setQuery(event.target.value)} />
          <div><label htmlFor="preview-role-filter" className="mb-1 block text-sm font-medium">Role filter</label>
            <select id="preview-role-filter" className="w-full rounded-md border border-slate-300 p-2 text-sm"
              value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
              <option value="">All roles</option>
              {tenantRoles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></div>
          <div><label htmlFor="preview-status-filter" className="mb-1 block text-sm font-medium">Status filter</label>
            <select id="preview-status-filter" className="w-full rounded-md border border-slate-300 p-2 text-sm"
              value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option><option value="active">Active in preview</option>
              <option value="inactive">Inactive in preview</option>
            </select></div>
        </div>
        <div className="mt-3">
          <Table columns={columns} data={visibleUsers} keyExtractor={item => item.userId}
            onRowClick={item => { setSelectedId(item.userId); setEditing(false); }}
            emptyMessage="No preview users match the current filters." />
        </div>
      </Card>

      <Modal isOpen={Boolean(selected && !editing)} onClose={() => { setSelectedId(''); setFullName(''); }}
        title="Preview user details" subtitle="Browser session only">
        {selected && <div className="flex flex-col gap-2 text-sm">
          <p><strong>Name:</strong> {selected.fullName}</p>
          <p><strong>Email:</strong> {selected.email}</p>
          <p><strong>User ID:</strong> {selected.userId}</p>
          <p><strong>Employee ID:</strong> {selected.employeeId}</p>
          <p><strong>Role:</strong> {tenantRoles.find(item => item.id === selected.roleId)?.name || 'Unassigned'}</p>
          <p><strong>Department:</strong> {selected.department}</p>
          <p><strong>Designation:</strong> {selected.designation}</p>
          <p><strong>Status:</strong> {selected.status} in preview</p>
          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            <Button type="button" onClick={openEdit}>Edit preview user</Button>
            <Button type="button" variant="secondary" onClick={() => { setConfirmId(selected.userId); setSelectedId(''); }}>
              {selected.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </div>}
      </Modal>

      <Modal isOpen={Boolean(selected && editing)} onClose={() => { setEditing(false); setError(''); }}
        title="Edit preview user" subtitle="User ID, employee ID and reserved email stay unchanged">
        {selected && <form onSubmit={saveEdit} className="flex flex-col gap-3">
          <Input label="Full name" value={fullName} onChange={event => setFullName(event.target.value)} required />
          <div><label htmlFor="edit-preview-role" className="mb-1 block text-sm font-medium">Role</label>
            <select id="edit-preview-role" value={roleId} onChange={event => setRoleId(event.target.value)}
              className="w-full rounded-md border border-slate-300 p-2 text-sm" required>
              {tenantRoles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></div>
          <Input label="Department" value={department} onChange={event => setDepartment(event.target.value)} required />
          <Input label="Designation" value={designation} onChange={event => setDesignation(event.target.value)} required />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
            <Button type="submit">Save preview changes</Button>
          </div>
        </form>}
      </Modal>

      <Modal isOpen={Boolean(changing)} onClose={() => setConfirmId('')}
        title="Confirm preview status change">
        {changing && <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">Change {changing.fullName} to {changing.status === 'active' ? 'inactive' : 'active'} in this browser preview? Real user access will not change.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmId('')}>Cancel</Button>
            <Button type="button" onClick={updateStatus}>Confirm</Button>
          </div>
        </div>}
      </Modal>
    </div>
  );
};
