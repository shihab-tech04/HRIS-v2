import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Table, Column } from '../../components/ui/Table';
import { Project } from '../../types';
import { Briefcase, Plus, FolderGit2, Calendar, Users } from 'lucide-react';

export const ProjectManagement: React.FC = () => {
  const { projects, employees, recordAuditLog } = useHRIS();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projCode, setProjCode] = useState('');
  const [projName, setProjName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(employees[0]?.id || '');
  const [targetEndDate, setTargetEndDate] = useState('2026-12-31');

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projCode.trim() || !projName.trim()) return;

    const lead = employees.find((emp) => emp.id === selectedLeadId);

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      tenantId: 't-101-acme',
      code: projCode.trim().toUpperCase(),
      name: projName.trim(),
      clientName: clientName.trim() || 'Internal Enterprise',
      description: description.trim() || 'Client workspace delivery initiative',
      projectLeadId: selectedLeadId,
      projectLeadName: lead ? `${lead.firstName} ${lead.lastName}` : 'Unassigned',
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate,
      status: 'active',
      allocatedMemberIds: lead ? [lead.id] : [],
      totalAllocatedFte: 1.0,
    };

    projects.push(newProject);
    recordAuditLog(
      'PROJECT_CREATE',
      'projects',
      newProject.id,
      `Created project '${newProject.name}' with Lead ${newProject.projectLeadName}.`
    );

    setIsModalOpen(false);
    setProjCode('');
    setProjName('');
    setClientName('');
    setDescription('');
  };

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project Name & Client',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block">{r.name}</span>
          <span className="text-[11px] text-slate-500">Client: {r.clientName}</span>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Project Code',
      width: '130px',
      render: (r) => (
        <span className="font-mono text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
          {r.code}
        </span>
      ),
    },
    {
      key: 'projectLeadName',
      header: 'Assigned Project Lead',
      width: '180px',
      render: (r) => (
        <span className="text-xs font-medium text-slate-800">{r.projectLeadName}</span>
      ),
    },
    {
      key: 'totalAllocatedFte',
      header: 'Committed FTE',
      isNumeric: true,
      width: '120px',
      render: (r) => (
        <span className="font-mono font-bold text-slate-900">
          {r.totalAllocatedFte ? r.totalAllocatedFte.toFixed(1) : '1.0'} FTE
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Timeline',
      width: '180px',
      render: (r) => (
        <span className="font-mono text-[11px] text-slate-600">
          {r.startDate} → {r.targetEndDate}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <Badge status={r.status === 'active' ? 'active' : 'neutral'}>
          {r.status.toUpperCase()}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Project Workspaces & Client Delivery
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Workspaces where staff members are allocated under dedicated Project Leads.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Create Project
          </Button>
        </div>
      </div>

      <Card
        title={`Active Project Registries (${projects.length})`}
        subtitle="Operational project units with independent management hierarchies"
        noPadding
      >
        <Table
          columns={columns}
          data={projects}
          keyExtractor={(r) => r.id}
        />
      </Card>

      {/* Project Creation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Project Workspace"
        subtitle="Matrix allocation unit with distinct leadership"
      >
        <form onSubmit={handleCreateProject} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Project Code"
              placeholder="e.g. PRJ-TITAN"
              value={projCode}
              onChange={(e) => setProjCode(e.target.value)}
              required
            />
            <Input
              label="Client / Account Name"
              placeholder="e.g. Omni Retail Corp"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <Input
            label="Project Name"
            placeholder="e.g. Enterprise Cloud Modernization"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
            required
          />

          <Select
            label="Assigned Project Lead"
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
            options={employees.map((emp) => ({
              value: emp.id,
              label: `${emp.firstName} ${emp.lastName} (${emp.jobTitle})`,
            }))}
          />

          <Input
            label="Target End Date"
            type="date"
            value={targetEndDate}
            onChange={(e) => setTargetEndDate(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!projCode.trim() || !projName.trim()}
            >
              Create Workspace
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
