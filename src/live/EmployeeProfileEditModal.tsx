import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';

export type ProfileEditKind =
  | 'request-personal' | 'request-contact'
  | 'education' | 'experience' | 'training' | 'certification' | 'family' | 'bank';

type ProfileRecord = Record<string, unknown>;
type Field = { id: string; label: string; type?: string; required?: boolean; max?: number; min?: number; maxNumber?: number; wide?: boolean };

const words = {
  en: {
    requestPersonal: 'Request a personal information correction',
    requestContact: 'Request a contact information correction',
    education: 'Educational Information', experience: 'Work Experience Information',
    training: 'Training Information', certification: 'Certification Information',
    family: 'Family & Nominee Information Details', bank: 'Bank Information Details',
    profileField: 'Profile field', proposed: 'Proposed value', reason: 'Reason for this correction',
    cancel: 'Cancel', save: 'Save', submit: 'Submit request', saving: 'Saving…',
    attach: 'Certificate', existing: 'A certificate is already attached. Choose a new file to replace it.',
    pdfImages: 'PDF, JPG, or PNG up to 10 MB', currentlyStudying: 'Is Currently Studying?',
    nominee: 'Is Nominee?',
    full_name: 'Employee name', father_name: 'Father’s name', mother_name: 'Mother’s name',
    date_of_birth: 'Date of birth', birthplace: 'Birthplace', blood_group: 'Blood group',
    gender: 'Gender', religion: 'Religion', nationality: 'Nationality', marital_status: 'Marital status',
    nid_number: 'NID number', passport_number: 'Passport', etin_number: 'E-TIN', phone: 'Phone number',
    official_email: 'Official email', personal_email: 'Personal email', official_phone: 'Official phone number',
    male: 'Male', female: 'Female', other: 'Other',
    address: 'Present address', mailing_address: 'Permanent address',
    emergency_contact_name: 'Emergency contact name', emergency_contact_phone: 'Emergency contact phone',
    emergency_contact_relation: 'Emergency contact relation',
    education_level: 'Level of education', institution: 'Institution name', subject_major: 'Subject/Major/Concentration',
    degree_title: 'Degree title', result_type: 'Result type', result: 'Current result', starting_year: 'Starting year',
    passing_year: 'Passing year', duration: 'Duration', achievements: 'Achievements',
    role_title: 'Job title', company: 'Organization name', job_type: 'Job type', company_website: 'Company website link',
    joining_date: 'Date of joining', departure_date: 'Date of departure', total_duration: 'Work duration',
    office_address: 'Address', description: 'Responsibilities', title: 'Training title',
    institute_name: 'Institute name', training_number: 'Training number', year: 'Year of held',
    issue_date: 'Date of issue', expiry_date: 'Expiry date',
    name: 'Family member name', relationship: 'Relationship', present_address: 'Present address',
    permanent_address: 'Permanent address', bank_name: 'Bank name', account_number: 'Bank account number',
    branch_name: 'Branch name', routing_number: 'Routing number',
    invalid: 'Check the highlighted fields and try again.',
    emailError: 'Enter a valid email address.', phoneError: 'Enter a valid phone number.',
    dateError: 'End date must be on or after the start date.',
    fileError: 'Choose a PDF, JPG, or PNG file that is no larger than 10 MB.',
    failed: 'The change could not be saved. Check your values and try again.',
  },
  bn: {
    requestPersonal: 'ব্যক্তিগত তথ্য সংশোধনের অনুরোধ',
    requestContact: 'যোগাযোগের তথ্য সংশোধনের অনুরোধ',
    education: 'শিক্ষাগত তথ্য', experience: 'কর্ম-অভিজ্ঞতার তথ্য',
    training: 'প্রশিক্ষণের তথ্য', certification: 'সনদের তথ্য',
    family: 'পরিবার ও মনোনীত ব্যক্তির তথ্য', bank: 'ব্যাংকের তথ্য',
    profileField: 'প্রোফাইলের ক্ষেত্র', proposed: 'প্রস্তাবিত মান', reason: 'সংশোধনের কারণ',
    cancel: 'বাতিল', save: 'সংরক্ষণ', submit: 'অনুরোধ জমা দিন', saving: 'সংরক্ষণ হচ্ছে…',
    attach: 'সনদ', existing: 'একটি সনদ যুক্ত আছে। পরিবর্তন করতে নতুন ফাইল নির্বাচন করুন।',
    pdfImages: '১০ এমবি পর্যন্ত PDF, JPG বা PNG', currentlyStudying: 'বর্তমানে অধ্যয়নরত?', nominee: 'মনোনীত ব্যক্তি?',
    full_name: 'কর্মীর নাম', father_name: 'পিতার নাম', mother_name: 'মাতার নাম',
    date_of_birth: 'জন্মতারিখ', birthplace: 'জন্মস্থান', blood_group: 'রক্তের গ্রুপ',
    gender: 'লিঙ্গ', religion: 'ধর্ম', nationality: 'জাতীয়তা', marital_status: 'বৈবাহিক অবস্থা',
    nid_number: 'জাতীয় পরিচয়পত্র নম্বর', passport_number: 'পাসপোর্ট', etin_number: 'ই-টিন', phone: 'ফোন নম্বর',
    official_email: 'অফিসিয়াল ইমেইল', personal_email: 'ব্যক্তিগত ইমেইল', official_phone: 'অফিসিয়াল ফোন নম্বর',
    male: 'পুরুষ', female: 'নারী', other: 'অন্যান্য',
    address: 'বর্তমান ঠিকানা', mailing_address: 'স্থায়ী ঠিকানা',
    emergency_contact_name: 'জরুরি যোগাযোগের নাম', emergency_contact_phone: 'জরুরি যোগাযোগের ফোন',
    emergency_contact_relation: 'জরুরি যোগাযোগের সম্পর্ক',
    education_level: 'শিক্ষার স্তর', institution: 'প্রতিষ্ঠানের নাম', subject_major: 'বিষয়/মেজর/বিশেষায়ন',
    degree_title: 'ডিগ্রির নাম', result_type: 'ফলাফলের ধরন', result: 'বর্তমান ফলাফল', starting_year: 'শুরুর বছর',
    passing_year: 'পাসের বছর', duration: 'সময়কাল', achievements: 'অর্জন',
    role_title: 'পদবি', company: 'প্রতিষ্ঠানের নাম', job_type: 'কাজের ধরন', company_website: 'প্রতিষ্ঠানের ওয়েবসাইট',
    joining_date: 'যোগদানের তারিখ', departure_date: 'প্রস্থানের তারিখ', total_duration: 'কর্মকাল',
    office_address: 'ঠিকানা', description: 'দায়িত্ব', title: 'প্রশিক্ষণের শিরোনাম',
    institute_name: 'প্রতিষ্ঠানের নাম', training_number: 'প্রশিক্ষণ নম্বর', year: 'অনুষ্ঠানের বছর',
    issue_date: 'প্রদানের তারিখ', expiry_date: 'মেয়াদ শেষের তারিখ',
    name: 'পরিবারের সদস্যের নাম', relationship: 'সম্পর্ক', present_address: 'বর্তমান ঠিকানা',
    permanent_address: 'স্থায়ী ঠিকানা', bank_name: 'ব্যাংকের নাম', account_number: 'ব্যাংক অ্যাকাউন্ট নম্বর',
    branch_name: 'শাখার নাম', routing_number: 'রাউটিং নম্বর',
    invalid: 'চিহ্নিত ক্ষেত্রগুলো ঠিক করে আবার চেষ্টা করুন।',
    emailError: 'একটি সঠিক ইমেইল ঠিকানা দিন।', phoneError: 'একটি সঠিক ফোন নম্বর দিন।',
    dateError: 'শেষের তারিখ শুরুর তারিখের পরে বা একই হতে হবে।',
    fileError: '১০ এমবির মধ্যে PDF, JPG বা PNG ফাইল নির্বাচন করুন।',
    failed: 'তথ্য সংরক্ষণ করা যায়নি। মানগুলো যাচাই করে আবার চেষ্টা করুন।',
  },
} as const;

const requestFieldSets: Record<'request-personal' | 'request-contact', string[]> = {
  'request-personal': ['full_name','father_name','mother_name','date_of_birth','birthplace','blood_group','gender','religion','nationality','marital_status','nid_number','passport_number','etin_number'],
  'request-contact': ['official_email','phone','personal_email','official_phone','address','mailing_address','emergency_contact_name','emergency_contact_phone','emergency_contact_relation'],
};

const recordFields: Record<Exclude<ProfileEditKind, 'request-personal' | 'request-contact'>, Field[]> = {
  education: [
    { id:'education_level',label:'education_level',required:true,max:120 }, { id:'institution',label:'institution',required:true,max:255 },
    { id:'subject_major',label:'subject_major',required:true,max:255 }, { id:'degree_title',label:'degree_title',required:true,max:255 },
    { id:'result_type',label:'result_type',required:true,max:120 }, { id:'result',label:'result',required:true,max:120 },
    { id:'currently_studying',label:'currently_studying',type:'checkbox' },
    { id:'starting_year',label:'starting_year',type:'number',required:true,min:1900,maxNumber:2200 },
    { id:'passing_year',label:'passing_year',type:'number',min:1900,maxNumber:2200 },
    { id:'duration',label:'duration',required:true,max:120 }, { id:'achievements',label:'achievements',max:1000,wide:true },
  ],
  experience: [
    { id:'role_title',label:'role_title',required:true,max:255 }, { id:'company',label:'company',required:true,max:255 },
    { id:'job_type',label:'job_type',required:true,max:120 }, { id:'company_website',label:'company_website',type:'url',max:500 },
    { id:'joining_date',label:'joining_date',type:'date',required:true }, { id:'departure_date',label:'departure_date',type:'date',required:true },
    { id:'total_duration',label:'total_duration',required:true,max:120 }, { id:'office_address',label:'office_address',required:true,max:500 },
    { id:'description',label:'description',required:true,max:2000,wide:true },
  ],
  training: [
    { id:'title',label:'title',required:true,max:255 }, { id:'institute_name',label:'institute_name',required:true,max:255 },
    { id:'training_number',label:'training_number',required:true,max:120 }, { id:'year',label:'year',type:'number',required:true,min:1900,maxNumber:2200 },
    { id:'duration',label:'duration',required:true,max:120 }, { id:'certificate_url',label:'attach',type:'file',required:true,wide:true },
  ],
  certification: [
    { id:'title',label:'title',required:true,max:255 }, { id:'institute_name',label:'institute_name',required:true,max:255 },
    { id:'issue_date',label:'issue_date',type:'date',required:true }, { id:'expiry_date',label:'expiry_date',type:'date',required:true },
    { id:'certificate_document_url',label:'attach',type:'file',required:true,wide:true },
  ],
  family: [
    { id:'is_nominee',label:'nominee',type:'checkbox' }, { id:'name',label:'name',required:true,max:200 },
    { id:'phone',label:'phone',type:'tel',required:true,max:32 }, { id:'nid_number',label:'nid_number',required:true,max:100 },
    { id:'date_of_birth',label:'date_of_birth',type:'date',required:true }, { id:'relationship',label:'relationship',required:true,max:120 },
    { id:'present_address',label:'present_address',required:true,max:500 }, { id:'permanent_address',label:'permanent_address',required:true,max:500 },
  ],
  bank: [
    { id:'bank_name',label:'bank_name',required:true,max:200,wide:true }, { id:'account_number',label:'account_number',required:true,max:64 },
    { id:'branch_name',label:'branch_name',required:true,max:200 },
    { id:'routing_number',label:'routing_number',type:'tel',required:true,max:32 },
  ],
};

const inputTypeByField: Record<string, string> = {
  full_name:'text', father_name:'text', mother_name:'text', date_of_birth:'date', birthplace:'text',
  blood_group:'text', gender:'text', religion:'text', nationality:'text', marital_status:'text',
  nid_number:'text', passport_number:'text', etin_number:'text', phone:'tel', official_email:'email',
  personal_email:'email', official_phone:'tel', address:'text', mailing_address:'text',
  emergency_contact_name:'text', emergency_contact_phone:'tel', emergency_contact_relation:'text',
};

function fieldInputType(id: string) { return inputTypeByField[id] || 'text'; }
function textValue(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }

export function EmployeeProfileEditModal({
  kind, tenantId, locale, initial = {}, onClose, onSaved,
}: {
  kind: ProfileEditKind; tenantId: string; locale: Locale; initial?: ProfileRecord;
  onClose: () => void; onSaved: () => void;
}) {
  const t = words[locale === 'bn' ? 'bn' : 'en'];
  const isRequest = kind === 'request-personal' || kind === 'request-contact';
  const title = kind === 'request-personal' ? t.requestPersonal : kind === 'request-contact' ? t.requestContact : t[kind];
  const initialRequestField = requestFieldSets[kind as 'request-personal' | 'request-contact']?.[0] || '';
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    ...Object.fromEntries(Object.entries(initial).map(([key,value]) => [key, value === true ? true : textValue(value)])),
    ...(initialRequestField ? { proposed_value: textValue(initial[initialRequestField]) } : {}),
  }));
  const [selectedField, setSelectedField] = useState(initialRequestField);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function setValue(field: string, value: string | boolean) {
    setValues(current => ({ ...current, [field]: value }));
  }

  async function uploadCertificate(): Promise<string | undefined> {
    if (!file) return undefined;
    const ext = file.name.split('.').at(-1)?.toLowerCase() || '';
    const allowed = new Set(['pdf','jpg','jpeg','png']);
    if (!allowed.has(ext) || file.size === 0 || file.size > 10 * 1024 * 1024
        || !['application/pdf','image/jpeg','image/png'].includes(file.type)) {
      throw new Error('file');
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error('upload');
    const path = `${userData.user.id}/${tenantId}/profile-certificates/${crypto.randomUUID()}.${ext}`;
    const result = await supabase.storage.from('employee-documents').upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
    });
    if (result.error) throw new Error('upload');
    return path;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    if (!form.reportValidity()) { setError(t.invalid); return; }
    if (kind === 'experience' && String(values.departure_date || '') < String(values.joining_date || '')) {
      setError(t.dateError); return;
    }
    if (kind === 'certification' && String(values.expiry_date || '') < String(values.issue_date || '')) {
      setError(t.dateError); return;
    }
    if (isRequest && !String(values.reason || '').trim()) { setError(t.invalid); return; }
    setBusy(true);
    let uploadedPath: string | undefined;
    try {
      if (isRequest) {
        const proposed = String(values.proposed_value || '').trim();
        if (!proposed) { setError(t.invalid); return; }
        const { error: rpcError } = await supabase.rpc('employee_submit_profile_change_request', {
          p_tenant_id: tenantId, p_field_key: selectedField,
          p_requested_value: proposed, p_reason: String(values.reason || '').trim(),
        });
        if (rpcError) throw rpcError;
      } else {
        const payload: Record<string, unknown> = Object.fromEntries(
          recordFields[recordKind!]
            .filter(field => field.type !== 'file')
            .map(field => [field.id, field.type === 'checkbox'
              ? values[field.id] === true || values[field.id] === 'true'
              : values[field.id] ?? '']),
        );
        if (typeof initial.id === 'string') payload.id = initial.id;
        if (kind === 'education' && values.currently_studying === true) payload.passing_year = null;
        if (file) {
          uploadedPath = await uploadCertificate();
          const key = kind === 'training' ? 'certificate_url' : 'certificate_document_url';
          payload[key] = uploadedPath;
        }
        const args = { p_tenant_id: tenantId, p_payload: payload };
        let saveError: unknown = null;
        switch (kind) {
          case 'education': saveError = (await supabase.rpc('employee_save_my_education_v1', args)).error; break;
          case 'experience': saveError = (await supabase.rpc('employee_save_my_experience_v1', args)).error; break;
          case 'training': saveError = (await supabase.rpc('employee_save_my_training_v1', args)).error; break;
          case 'certification': saveError = (await supabase.rpc('employee_save_my_certification_v1', args)).error; break;
          case 'family': saveError = (await supabase.rpc('employee_save_my_family_member_v1', args)).error; break;
          case 'bank': saveError = (await supabase.rpc('employee_save_my_bank_v1', args)).error; break;
          default: throw new Error('Unsupported profile section');
        }
        if (saveError) throw saveError;
      }
      onSaved();
      onClose();
    } catch (cause) {
      if (uploadedPath) {
        const cleanup = await supabase.storage.from('employee-documents').remove([uploadedPath]);
        if (cleanup.error) { /* the orphan-cleanup RLS policy still keeps the object owner-scoped */ }
      }
      const message = cause && typeof cause === 'object' && 'message' in cause ? String((cause as { message: unknown }).message) : '';
      if (/email/i.test(message)) setError(t.emailError);
      else if (/phone/i.test(message)) setError(t.phoneError);
      else if (/certificate file|certificate is required|attach/i.test(message)) setError(t.fileError);
      else setError(cause instanceof Error && cause.message === 'file' ? t.fileError : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const requestFields = isRequest ? requestFieldSets[kind as 'request-personal' | 'request-contact'] : [];
  const proposedType = fieldInputType(selectedField);
  const recordKind = isRequest ? null : kind as keyof typeof recordFields;

  function renderLabel(label: string, required = false) {
    const value = t[label as keyof typeof t] || label;
    return <span>{value}{required && <span className="text-rose-600">*</span>}</span>;
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/40 p-2 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="employee-profile-edit-title"
      className="my-auto max-h-[96vh] w-full max-w-[1024px] overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6 lg:p-7">
      <header className="flex items-center justify-between gap-4 border-b border-[#E7EEF2] pb-4">
        <h2 ref={titleRef} tabIndex={-1} id="employee-profile-edit-title" className="text-xl font-semibold text-[#212121]">{title}</h2>
        <button type="button" onClick={onClose} aria-label={t.cancel} className="grid h-10 w-10 shrink-0 place-items-center rounded text-2xl text-slate-600 hover:bg-slate-100">×</button>
      </header>
      <form noValidate onSubmit={event => void submit(event)} className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {isRequest ? <>
          <label className="grid gap-2 text-sm text-[#777] sm:col-span-2">
            {t.profileField}
            <select aria-label={t.profileField} value={selectedField} onChange={event => {
              setSelectedField(event.target.value);
              setValue('proposed_value', textValue(initial[event.target.value]));
            }} className="min-h-11 rounded border border-[#DEE0E3] bg-white px-3 text-base text-[#424242]">
              {requestFields.map(field => <option key={field} value={field}>{t[field as keyof typeof t]}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-[#777] sm:col-span-2">
            {renderLabel('proposed', true)}
            {selectedField === 'gender' ? <select aria-label={t.proposed} required
              value={String(values.proposed_value || '')} onChange={event => setValue('proposed_value',event.target.value)}
              className="min-h-11 rounded border border-[#DEE0E3] bg-white px-3 text-base text-[#424242]">
              <option value="">—</option>
              <option value="Male">{t.male}</option><option value="Female">{t.female}</option><option value="Other">{t.other}</option>
            </select> : <input aria-label={t.proposed} required maxLength={500} type={proposedType}
              max={selectedField === 'date_of_birth' ? new Date().toISOString().slice(0,10) : undefined}
              value={String(values.proposed_value || '')} onChange={event => setValue('proposed_value',event.target.value)}
              className="min-h-11 rounded border border-[#DEE0E3] px-3 text-base text-[#424242]" />}
          </label>
          <label className="grid gap-2 text-sm text-[#777] sm:col-span-2">
            {renderLabel('reason', true)}
            <textarea aria-label={t.reason} required maxLength={1000} rows={3}
              value={String(values.reason || '')} onChange={event => setValue('reason',event.target.value)}
              className="min-h-20 rounded border border-[#DEE0E3] px-3 py-2 text-base text-[#424242]" />
          </label>
        </> : recordFields[recordKind!].map(field => {
          if (field.type === 'checkbox') return <label key={field.id} className="flex min-h-12 items-center gap-3 rounded border border-[#DEE0E3] px-4 text-sm text-[#777] sm:col-span-2">
            <input type="checkbox" checked={values[field.id] === true || values[field.id] === 'true'}
              onChange={event => setValue(field.id,event.target.checked)} className="h-4 w-4 accent-[#08558B]" />
            {renderLabel(field.id)}
          </label>;
          if (field.type === 'file') return <label key={field.id} className="grid gap-2 text-sm text-[#777] sm:col-span-2">
            {renderLabel('attach',field.required && !Boolean(initial.certificate_url || initial.certificate_document_url))}
            {Boolean(initial.id && (initial.certificate_url || initial.certificate_document_url)) && <span className="text-xs text-slate-600">{t.existing}</span>}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              required={Boolean(field.required && !initial.certificate_url && !initial.certificate_document_url)} onChange={event => setFile(event.target.files?.[0] || null)}
              className="min-h-11 w-full rounded border border-[#DEE0E3] text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-slate-100 file:px-3" />
            <span className="text-xs text-slate-500">{t.pdfImages}</span>
          </label>;
          const inputType = field.type || 'text';
          const isDate = inputType === 'date';
          const minDate = field.id === 'departure_date' ? String(values.joining_date || '') : field.id === 'expiry_date' ? String(values.issue_date || '') : undefined;
          return <label key={field.id} className={`grid min-w-0 gap-2 text-sm text-[#777] ${field.wide ? 'sm:col-span-2' : ''}`}>
            {renderLabel(field.label,field.required)}
            <input type={inputType} required={field.required} maxLength={field.max}
              min={isDate ? minDate : field.min} max={isDate ? undefined : field.maxNumber}
              disabled={field.id==='passing_year' && (values.currently_studying === true || values.currently_studying === 'true')}
              value={isDate ? String(values[field.id] || '') : String(values[field.id] ?? '')}
              onChange={event => setValue(field.id,event.target.value)}
              className="min-h-11 min-w-0 rounded border border-[#DEE0E3] bg-white px-3 text-base text-[#424242] disabled:bg-slate-100" />
          </label>;
        })}
        {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 sm:col-span-2">{error}</p>}
        <footer className="mt-2 flex flex-wrap justify-end gap-3 border-t border-[#E7EEF2] pt-4 sm:col-span-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded px-4 text-sm text-[#49454F] hover:bg-slate-50 disabled:opacity-50">{t.cancel}</button>
          <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white hover:bg-[#06466F] disabled:opacity-60">
            {busy ? t.saving : isRequest ? t.submit : t.save}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
