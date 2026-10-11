import React, { useState } from 'react';
import { useHRIS } from '../../context/HRISContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FileText, Download, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';

interface DocumentItem {
  id: string;
  title: string;
  category: string;
  issueDate: string;
  size: string;
  status: 'verified' | 'pending_signature';
}

export const MyDocuments: React.FC = () => {
  const { currentEmployee, currentTenant, recordAuditLog } = useHRIS();
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const documents: DocumentItem[] = [
    {
      id: 'doc-01',
      title: 'Principal Employment Agreement & Terms',
      category: 'Employment Contract',
      issueDate: currentEmployee.joinDate,
      size: '2.4 MB',
      status: 'verified',
    },
    {
      id: 'doc-02',
      title: 'Proprietary Information & Inventions Agreement (PIIA)',
      category: 'Legal & IP',
      issueDate: currentEmployee.joinDate,
      size: '1.1 MB',
      status: 'verified',
    },
    {
      id: 'doc-03',
      title: 'Tax Withholding Exemption Form (W-4 / Regional)',
      category: 'Tax & Compliance',
      issueDate: '2026-01-05',
      size: '480 KB',
      status: 'verified',
    },
    {
      id: 'doc-04',
      title: 'Hybrid Work & Remote Telecommuting Policy Agreement',
      category: 'Tenant Policy',
      issueDate: '2026-03-01',
      size: '620 KB',
      status: 'verified',
    },
  ];

  const handleDownload = (doc: DocumentItem) => {
    recordAuditLog(
      'DOCUMENT_ACCESS',
      'employee_documents',
      doc.id,
      `Employee ${currentEmployee.firstName} downloaded confidential document '${doc.title}'.`
    );
    setDownloadSuccess(doc.title);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Personal Compliance & Document Vault
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure digital repository for verified legal contracts, job descriptions, and certifications.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Vault Encrypted (AES-256)</span>
          </div>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Verified download generated for "{downloadSuccess}". Recorded to tamper-evident audit trail.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documents.map((doc) => (
          <Card key={doc.id} className="border border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 rounded-lg text-slate-700 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
                    {doc.category}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-900 mt-0.5">
                    {doc.title}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-2 font-mono">
                    <span>Issued: {doc.issueDate}</span>
                    <span>·</span>
                    <span>{doc.size}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <Badge status={doc.status === 'verified' ? 'active' : 'warning'}>
                {doc.status === 'verified' ? 'Signed & Verified' : 'Pending Signature'}
              </Badge>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDownload(doc)}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                Download PDF
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
