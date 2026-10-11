import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Table, Column } from '../../components/ui/Table';
import { AuditLogEntry } from '../../types';
import { History, ShieldCheck, Download, Search } from 'lucide-react';

export const AuditAndCompliance: React.FC = () => {
  const { auditLogs, currentTenant } = useHRIS();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = auditLogs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Description', 'IP Address'];
    const rows = filteredLogs.map((l) => [
      l.timestamp,
      `"${l.actorName}"`,
      `"${l.actorRole}"`,
      l.action,
      l.entityType,
      `"${l.description.replace(/"/g, '""')}"`,
      l.ipAddress,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${currentTenant.slug}-${Date.now()}.csv`;
    link.click();
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '160px',
      render: (r) => (
        <span className="font-mono text-[11px] text-slate-600">
          {new Date(r.timestamp).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor & Role',
      width: '180px',
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 block">{r.actorName}</span>
          <span className="text-[10px] text-slate-500 block truncate">{r.actorRole}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action Code',
      width: '170px',
      render: (r) => (
        <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
          {r.action}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Audit Description',
      render: (r) => (
        <span className="text-xs text-slate-700 leading-relaxed block">
          {r.description}
        </span>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP / Origin',
      width: '120px',
      render: (r) => (
        <span className="font-mono text-[11px] text-slate-500">{r.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Tamper-Evident System Audit Trail
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Append-only cryptographic event log tracking governance changes, policy adjustments, and allocations.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export Audit Trail (CSV)
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 max-w-md">
        <Input
          placeholder="Filter audit entries by action, actor, or keyword..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          icon={<Search className="w-4 h-4 text-slate-400" />}
        />
      </div>

      <Card
        title={`Audit Event Ledger (${filteredLogs.length} Events)`}
        subtitle="Chronological transaction log scoped to current tenant partition"
        noPadding
      >
        <Table
          columns={columns}
          data={filteredLogs}
          keyExtractor={(r) => r.id}
          emptyMessage="No audit logs recorded for current criteria."
        />
      </Card>
    </div>
  );
};
