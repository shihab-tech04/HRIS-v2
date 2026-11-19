import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';

const ADDRESS_TYPES = ['Present', 'Permanent'] as const;
const ADDRESS_FIELDS = ['road_block_house', 'city_village', 'thana', 'district', 'post_code'] as const;
type AddressType = typeof ADDRESS_TYPES[number];
type AddressField = typeof ADDRESS_FIELDS[number];
type AddressRow = { id?: string; address_type: AddressType | 'Other' } & Partial<Record<AddressField, string>>;

const words = {
  en: {
    title: 'Edit addresses', present: 'Present address', permanent: 'Permanent address',
    road_block_house: 'Road, block and house', city_village: 'City or village',
    thana: 'Thana', district: 'District', post_code: 'Post code',
    cancel: 'Cancel', save: 'Save', saving: 'Saving…',
    invalid: 'The current address records could not be verified. Refresh your profile before editing.',
    failed: 'Addresses could not be saved. Your previous information has been kept.',
    verify: 'The save could not be verified. Refresh your profile before trying again.',
  },
  bn: {
    title: 'ঠিকানা সম্পাদনা', present: 'বর্তমান ঠিকানা', permanent: 'স্থায়ী ঠিকানা',
    road_block_house: 'সড়ক, ব্লক ও বাসা', city_village: 'শহর বা গ্রাম',
    thana: 'থানা', district: 'জেলা', post_code: 'পোস্ট কোড',
    cancel: 'বাতিল', save: 'সংরক্ষণ', saving: 'সংরক্ষণ হচ্ছে…',
    invalid: 'বর্তমান ঠিকানার তথ্য যাচাই করা যায়নি। সম্পাদনার আগে প্রোফাইল রিফ্রেশ করুন।',
    failed: 'ঠিকানা সংরক্ষণ করা যায়নি। আগের তথ্য অপরিবর্তিত আছে।',
    verify: 'তথ্য সংরক্ষণ যাচাই করা যায়নি। আবার চেষ্টা করার আগে প্রোফাইল রিফ্রেশ করুন।',
  },
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// The profile projection is already tenant-scoped. Never fetch the address table
// directly or use the obsolete employee_get_my_addresses_v2 RPC.
export function getStructuredAddresses(source: unknown): AddressRow[] {
  if (!Array.isArray(source)) return [];
  return source.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (!['Present', 'Permanent', 'Other'].includes(String(record.address_type))) return [];
    if (typeof record.id !== 'string' || !record.id) return [];
    const row: AddressRow = {
      id: record.id,
      address_type: record.address_type as AddressRow['address_type'],
    };
    for (const field of ADDRESS_FIELDS) row[field] = stringValue(record[field]);
    return [row];
  });
}

export function formatStructuredAddress(row: AddressRow | undefined, fallback: string): string {
  if (!row) return fallback;
  const parts = ADDRESS_FIELDS.map(field => stringValue(row[field]).trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}

export function EmployeeStructuredAddressesModal({
  tenantId, locale, addresses, onSaved, onClose,
}: {
  tenantId: string; locale: Locale; addresses: unknown; onSaved: () => void; onClose: () => void;
}) {
  const t = words[locale === 'bn' ? 'bn' : 'en'];
  const records = getStructuredAddresses(addresses);
  const invalidSource = !Array.isArray(addresses) || records.length !== addresses.length;
  const [values, setValues] = useState<Record<AddressType, Record<AddressField, string>>>(() => {
    const groups = {} as Record<AddressType, Record<AddressField, string>>;
    for (const type of ADDRESS_TYPES) {
      const record = records.find(item => item.address_type === type);
      groups[type] = {} as Record<AddressField, string>;
      for (const field of ADDRESS_FIELDS) groups[type][field] = stringValue(record?.[field]);
    }
    return groups;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
    }
    if (event.key !== 'Tab') return;
    const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    );
    if (!elements?.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setField(type: AddressType, field: AddressField, value: string) {
    setError('');
    setValues(previous => ({
      ...previous,
      [type]: { ...previous[type], [field]: value },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (invalidSource) { setError(t.invalid); return; }
    const next: AddressRow[] = records.map(item => ({ ...item }));
    let changed = false;
    for (const type of ADDRESS_TYPES) {
      const previous = next.find(item => item.address_type === type);
      const fields = values[type];
      const hasContent = ADDRESS_FIELDS.some(field => fields[field].trim());
      if (!previous && !hasContent) continue;
      if (!previous) {
        next.push({ address_type: type, ...fields });
        changed = true;
      } else {
        for (const field of ADDRESS_FIELDS) {
          const value = fields[field].trim();
          if (value !== stringValue(previous[field])) changed = true;
          previous[field] = value;
        }
      }
    }
    if (!changed) { onClose(); return; }
    if (next.length > 100) { setError(t.failed); return; }

    setBusy(true);
    setError('');
    let committed = false;
    try {
      const { data: savedCount, error: saveError } = await supabase.rpc('employee_save_my_addresses_v1', {
        p_tenant_id: tenantId, p_rows: next,
      });
      if (saveError || savedCount !== next.length) throw saveError || new Error('Address write not confirmed');
      committed = true;
      const { data: readback, error: readError } = await supabase.rpc('employee_get_my_profile_v1', {
        p_tenant_id: tenantId,
      });
      if (readError || !readback || readback.tenant_id !== tenantId || !Array.isArray(readback.addresses)) {
        throw new Error('Address readback not confirmed');
      }
      const confirmed = getStructuredAddresses(readback.addresses);
      if (confirmed.length !== next.length || !next.every(row => confirmed.some(item =>
        (row.id ? item.id === row.id : item.address_type === row.address_type)
        && ADDRESS_FIELDS.every(field => stringValue(item[field]) === stringValue(row[field]))
      ))) throw new Error('Address readback mismatch');
      onSaved();
      onClose();
    } catch {
      setError(committed ? t.verify : t.failed);
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/40 p-2 sm:p-5"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="employee-structured-address-title"
      onKeyDown={handleKeyDown} className="max-h-[calc(100dvh_-_24px)] w-full max-w-[760px] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
      <h2 ref={headingRef} id="employee-structured-address-title" tabIndex={-1}
        className="mb-5 text-lg font-semibold text-[#49454F]">{t.title}</h2>
      <form onSubmit={event => { void submit(event); }} className="grid gap-5">
        {ADDRESS_TYPES.map(type => <fieldset key={type} className="min-w-0 rounded-xl border border-[#DEE0E3] p-4">
          <legend className="px-2 text-sm font-semibold text-[#49454F]">{type === 'Present' ? t.present : t.permanent}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ADDRESS_FIELDS.map(field => <label key={field} className="grid min-w-0 gap-1.5 text-sm text-[#777]">
              {t[field]}
              <input type="text" maxLength={500} value={values[type][field]}
                onChange={event => setField(type, field, event.target.value)}
                disabled={busy || invalidSource}
                className="min-h-11 w-full min-w-0 rounded border border-[#DEE0E3] bg-white px-3 text-base text-[#424242] focus-visible:outline-2 focus-visible:outline-[#08558B] disabled:bg-slate-100" />
            </label>)}
          </div>
        </fieldset>)}
        {(error || invalidSource) && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error || t.invalid}
        </p>}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-[#E7EEF2] pt-4">
          <button type="button" onClick={onClose} disabled={busy}
            className="min-h-11 rounded px-4 text-sm text-[#49454F] hover:bg-slate-50 disabled:opacity-50">{t.cancel}</button>
          <button type="submit" disabled={busy || invalidSource}
            className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white hover:bg-[#06466F] disabled:opacity-60">
            {busy ? t.saving : t.save}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
