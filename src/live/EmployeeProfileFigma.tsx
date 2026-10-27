import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  BookOpenCheck,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  Landmark,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { EmployeeProfileEditModal, type ProfileEditKind } from './EmployeeProfileEditModal';
import addressBookIcon from '../assets/employee-figma/address-book.svg';
import documentCheckIcon from '../assets/employee-figma/document-check.svg';
import editPenIcon from '../assets/employee-figma/edit-pen.svg';
import graduationCapIcon from '../assets/employee-figma/graduation-cap.svg';
import pdfDocumentIcon from '../assets/employee-figma/pdf-document-icon.svg';

type Profile = Record<string, unknown>;
type Panel = 'personal' | 'experience' | 'training' | 'bank' | 'family';
type LoadState = 'loading' | 'ready' | 'empty' | 'error';
type DetailField = { id: string; label: string; value: ReactNode };

const copy = {
  en: {
    heading: 'My Profile',
    personalTab: 'Personal & Educational Information',
    experienceTab: 'Work Experience',
    trainingTab: 'Training & certification',
    bankTab: 'Bank',
    familyTab: 'Family & Nominee',
    identitySection: 'Name',
    employeeId: 'ID',
    officialEmail: 'Official email',
    designation: 'Designation',
    department: 'Department',
    joiningDate: 'Joining Date',
    employmentType: 'Employment Type',
    workLocation: 'Work Location',
    lineManager: 'Line Manager',
    grade: 'Grade',
    team: 'Team',
    profileContentHeading: 'Personal, Contact, Verification & Educational Information',
    personalDetails: 'Personal Details',
    contactDetails: 'Personal Details',
    editContactDetails: 'Edit Contact Details',
    verification: 'Verification',
    educationDetails: 'Education Information',
    employeeName: 'Employee Name',
    fatherName: 'Father’s Name',
    motherName: 'Mother’s Name',
    dateOfBirth: 'Date of birth',
    birthplace: 'Birthplace',
    bloodGroup: 'Blood Group',
    gender: 'Gender',
    religion: 'Religion',
    nationality: 'Nationality',
    maritalStatus: 'Marital Status',
    digitalSignature: 'Digital Signature',
    phoneNumber: 'Phone Number',
    personalEmail: 'Personal E-mail',
    officialPhone: 'Official Phone Number',
    presentAddress: 'Present address',
    permanentAddress: 'Permanent address',
    nid: 'NID',
    passport: 'Passport',
    eTin: 'E-Tin',
    taxCircle: 'Tax Circle',
    educationLevel: 'Level Of Education',
    institutionName: 'Institution Name',
    subjectMajor: 'Subject/Major/Concentration',
    degreeTitle: 'Degree title',
    resultType: 'Result Type',
    currentResult: 'Current Result',
    result: 'Result',
    startingYear: 'Starting Year',
    passingYear: 'Passing Year',
    duration: 'Duration',
    achievements: 'Achievements',
    experienceInformation: 'Work Experience Information',
    jobTitle: 'Job Title/ Designation',
    organizationName: 'Organization name',
    jobType: 'Job Type',
    workDuration: 'Work Duration',
    websiteLink: 'Company website link',
    responsibilities: 'Responsibilities',
    address: 'Address',
    dateOfJoining: 'Date of Joining',
    dateOfDeparture: 'Date of Departure',
    trainingInformation: 'Training & Certification',
    professionalTraining: 'Professional Training',
    professionalCertification: 'Professional Certification',
    trainingName: 'Training Name',
    instituteName: 'Institute Name',
    startDate: 'Start Date',
    endDate: 'End Date',
    certificate: 'Certificate',
    bankInformation: 'Bank Information',
    bankName: 'Bank Name',
    bankAccountName: 'Bank Account Name',
    branchName: 'Branch Name',
    accountNumber: 'Account Number',
    routingNumber: 'Routing Number',
    familyInformation: 'Family & Nominee Information',
    nomineeName: 'Nominee Name',
    nidNumber: 'NID Number',
    relation: 'Relation',
    unavailable: 'Not available',
    signatureUnavailable: 'No document available',
    readUnavailable: 'This information is not available through an approved employee read service.',
    educationUnavailable: 'Education records are not available through an approved employee read service.',
    experienceUnavailable: 'Work experience records are not available through an approved employee read service.',
    trainingUnavailable: 'Training and certification records are not available through an approved employee read service.',
    bankUnavailable: 'Bank details are not available through an approved employee read service.',
    familyUnavailable: 'Family and nominee details are not available through an approved employee read service.',
    loading: 'Loading your profile…',
    empty: 'Your employee profile is not available in this organization.',
    error: 'Your employee profile could not be loaded.',
    retry: 'Retry',
    add: 'Add',
    edit: 'Edit',
    view: 'View',
    writeUnavailable: 'This action is disabled until WS02 confirms the employee RPC and RLS requirements.',
    viewUnavailable: 'This information is not available through an approved employee read service.',
    requestSubmitted: 'Your correction request was submitted for HR review.',
    profileSaved: 'Your profile information was saved.',
    delete: 'Delete', cancel: 'Cancel', deleteConfirm: 'Delete this profile record?',
    deleteSucceeded: 'The profile record was deleted.', deleteFailed: 'The record could not be deleted. Try again.',
    noRecords: 'No records are available yet.',
    emergencyContact: 'Emergency Contact',
    emergencyName: 'Contact name',
    emergencyPhone: 'Contact phone',
    reveal: 'View',
    hide: 'Hide',
    certificateAttached: 'Certificate attached',
    familyMemberName: 'Family Member',
    nomineeStatus: 'Nominee',
    trainingNumber: 'Training Number',
    yearOfHeld: 'Year of held',
    currentlyStudying: 'Currently studying',
    yes: 'Yes',
    no: 'No',
  },
  bn: {
    heading: 'আমার প্রোফাইল',
    personalTab: 'ব্যক্তিগত ও শিক্ষাগত তথ্য',
    experienceTab: 'কর্ম-অভিজ্ঞতা',
    trainingTab: 'প্রশিক্ষণ ও সনদ',
    bankTab: 'ব্যাংক',
    familyTab: 'পরিবার ও মনোনীত ব্যক্তি',
    identitySection: 'নাম',
    employeeId: 'আইডি',
    officialEmail: 'অফিসিয়াল ইমেইল',
    designation: 'পদবি',
    department: 'বিভাগ',
    joiningDate: 'যোগদানের তারিখ',
    employmentType: 'কর্মসংস্থানের ধরন',
    workLocation: 'কর্মস্থল',
    lineManager: 'লাইন ম্যানেজার',
    grade: 'গ্রেড',
    team: 'টিম',
    profileContentHeading: 'ব্যক্তিগত, যোগাযোগ, যাচাইকরণ ও শিক্ষাগত তথ্য',
    personalDetails: 'ব্যক্তিগত বিবরণ',
    contactDetails: 'ব্যক্তিগত বিবরণ',
    editContactDetails: 'যোগাযোগের তথ্য সম্পাদনা',
    verification: 'যাচাইকরণ',
    educationDetails: 'শিক্ষাগত তথ্য',
    employeeName: 'কর্মীর নাম',
    fatherName: 'পিতার নাম',
    motherName: 'মাতার নাম',
    dateOfBirth: 'জন্মতারিখ',
    birthplace: 'জন্মস্থান',
    bloodGroup: 'রক্তের গ্রুপ',
    gender: 'লিঙ্গ',
    religion: 'ধর্ম',
    nationality: 'জাতীয়তা',
    maritalStatus: 'বৈবাহিক অবস্থা',
    digitalSignature: 'ডিজিটাল স্বাক্ষর',
    phoneNumber: 'ফোন নম্বর',
    personalEmail: 'ব্যক্তিগত ইমেইল',
    officialPhone: 'অফিসিয়াল ফোন নম্বর',
    presentAddress: 'বর্তমান ঠিকানা',
    permanentAddress: 'স্থায়ী ঠিকানা',
    nid: 'জাতীয় পরিচয়পত্র',
    passport: 'পাসপোর্ট',
    eTin: 'ই-টিন',
    taxCircle: 'কর সার্কেল',
    educationLevel: 'শিক্ষার স্তর',
    institutionName: 'প্রতিষ্ঠানের নাম',
    subjectMajor: 'বিষয়/মেজর/বিশেষায়ন',
    degreeTitle: 'ডিগ্রির নাম',
    resultType: 'ফলাফলের ধরন',
    currentResult: 'বর্তমান ফলাফল',
    result: 'ফলাফল',
    startingYear: 'শুরুর বছর',
    passingYear: 'পাসের বছর',
    duration: 'সময়কাল',
    achievements: 'অর্জন',
    experienceInformation: 'কর্ম-অভিজ্ঞতার তথ্য',
    jobTitle: 'পদবি/কাজের নাম',
    organizationName: 'প্রতিষ্ঠানের নাম',
    jobType: 'কাজের ধরন',
    workDuration: 'কর্মকাল',
    websiteLink: 'প্রতিষ্ঠানের ওয়েবসাইট',
    responsibilities: 'দায়িত্ব',
    address: 'ঠিকানা',
    dateOfJoining: 'যোগদানের তারিখ',
    dateOfDeparture: 'প্রস্থানের তারিখ',
    trainingInformation: 'প্রশিক্ষণ ও সনদ',
    professionalTraining: 'পেশাগত প্রশিক্ষণ',
    professionalCertification: 'পেশাগত সনদ',
    trainingName: 'প্রশিক্ষণের নাম',
    instituteName: 'প্রতিষ্ঠানের নাম',
    startDate: 'শুরুর তারিখ',
    endDate: 'শেষের তারিখ',
    certificate: 'সনদ',
    bankInformation: 'ব্যাংকের তথ্য',
    bankName: 'ব্যাংকের নাম',
    bankAccountName: 'ব্যাংক অ্যাকাউন্টের নাম',
    branchName: 'শাখার নাম',
    accountNumber: 'অ্যাকাউন্ট নম্বর',
    routingNumber: 'রাউটিং নম্বর',
    familyInformation: 'পরিবার ও মনোনীত ব্যক্তির তথ্য',
    nomineeName: 'মনোনীত ব্যক্তির নাম',
    nidNumber: 'জাতীয় পরিচয়পত্র নম্বর',
    relation: 'সম্পর্ক',
    unavailable: 'তথ্য পাওয়া যায়নি',
    signatureUnavailable: 'কোনো নথি পাওয়া যায়নি',
    readUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে এই তথ্য পাওয়া যাচ্ছে না।',
    educationUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে শিক্ষাগত তথ্য পাওয়া যাচ্ছে না।',
    experienceUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে কর্ম-অভিজ্ঞতার তথ্য পাওয়া যাচ্ছে না।',
    trainingUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে প্রশিক্ষণ ও সনদের তথ্য পাওয়া যাচ্ছে না।',
    bankUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে ব্যাংকের তথ্য পাওয়া যাচ্ছে না।',
    familyUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে পরিবার ও মনোনীত ব্যক্তির তথ্য পাওয়া যাচ্ছে না।',
    loading: 'আপনার প্রোফাইল লোড হচ্ছে…',
    empty: 'এই প্রতিষ্ঠানে আপনার কর্মী প্রোফাইল পাওয়া যায়নি।',
    error: 'আপনার কর্মী প্রোফাইল লোড করা যায়নি।',
    retry: 'আবার চেষ্টা করুন',
    add: 'যোগ করুন',
    edit: 'সম্পাদনা',
    view: 'দেখুন',
    writeUnavailable: 'WS02 কর্মী RPC ও RLS শর্ত নিশ্চিত না করা পর্যন্ত এই কাজটি বন্ধ থাকবে।',
    viewUnavailable: 'অনুমোদিত কর্মী তথ্যসেবা থেকে এই তথ্য পাওয়া যাচ্ছে না।',
    requestSubmitted: 'তথ্য সংশোধনের অনুরোধ HR পর্যালোচনার জন্য জমা হয়েছে।',
    profileSaved: 'আপনার প্রোফাইলের তথ্য সংরক্ষণ হয়েছে।',
    delete: 'মুছুন', cancel: 'বাতিল', deleteConfirm: 'প্রোফাইলের এই তথ্যটি মুছে ফেলবেন?',
    deleteSucceeded: 'প্রোফাইলের তথ্য মুছে ফেলা হয়েছে।', deleteFailed: 'তথ্যটি মুছে ফেলা যায়নি। আবার চেষ্টা করুন।',
    noRecords: 'এখনও কোনো তথ্য যোগ করা হয়নি।',
    emergencyContact: 'জরুরি যোগাযোগ',
    emergencyName: 'যোগাযোগের নাম',
    emergencyPhone: 'যোগাযোগের ফোন',
    reveal: 'দেখুন',
    hide: 'লুকান',
    certificateAttached: 'সনদ সংযুক্ত আছে',
    familyMemberName: 'পরিবারের সদস্য',
    nomineeStatus: 'মনোনীত ব্যক্তি',
    trainingNumber: 'প্রশিক্ষণ নম্বর',
    yearOfHeld: 'অনুষ্ঠানের বছর',
    currentlyStudying: 'বর্তমানে অধ্যয়নরত',
    yes: 'হ্যাঁ',
    no: 'না',
  },
} as const;

function textValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function DetailRows({ fields }: { fields: DetailField[] }) {
  return <dl className="mt-4 grid min-w-0 grid-cols-1 gap-y-1 sm:gap-y-2">
    {fields.map(field => <div key={field.id} className="grid min-w-0 grid-cols-1 gap-1 py-1 sm:grid-cols-[minmax(140px,0.72fr)_minmax(0,1.28fr)] sm:gap-x-6">
      <dt className="min-w-0 break-words text-sm text-[#969696] sm:text-base">{field.label}</dt>
      <dd className="min-w-0 break-words text-sm text-[#424242] sm:text-base">{field.value}</dd>
    </div>)}
  </dl>;
}

function IconTile({ children }: { children: ReactNode }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EFF7F8]" aria-hidden="true">{children}</span>;
}

function SectionHeading({ id, icon, title }: { id?: string; icon: ReactNode; title: string }) {
  return <div className="flex min-w-0 items-center gap-4">
    <IconTile>{icon}</IconTile>
    <h3 id={id} className="min-w-0 flex-1 break-words text-lg text-[#424242]">{title}</h3>
  </div>;
}

export function EmployeeProfileFigma({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const words = copy[locale === 'bn' ? 'bn' : 'en'];
  const [panel, setPanel] = useState<Panel>('personal');
  const [loadedTenantId, setLoadedTenantId] = useState(tenantId);
  const [employee, setEmployee] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employment, setEmployment] = useState<Profile | null>(null);
  const [status, setStatus] = useState<LoadState>('loading');
  const [revision, setRevision] = useState(0);
  const [edit, setEdit] = useState<{ kind: ProfileEditKind; initial?: Profile } | null>(null);
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'education' | 'experience' | 'family'; id: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showSensitive, setShowSensitive] = useState(false);
  const [showBankAccount, setShowBankAccount] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setShowSensitive(false);
    setShowBankAccount(false);
    setEdit(null);
    setPendingDelete(null);
    setDeleteError('');
    setNotice('');
  }, [tenantId]);

  useEffect(() => {
    setShowSensitive(false);
    setShowBankAccount(false);
  }, [panel]);

  useEffect(() => {
    let current = true;
    setLoadedTenantId(tenantId);
    setEmployee(null);
    setProfile(null);
    setEmployment(null);
    setStatus('loading');
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('employee_get_my_profile_v1', { p_tenant_id: tenantId });
        if (error) throw error;
        const record: unknown = data;
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid employee profile response');
        const response = record as Profile;
        if (response.tenant_id !== tenantId) throw new Error('Tenant mismatch');
        for (const section of ['education','experience','training','certifications','family_members']) {
          if (!Array.isArray(response[section])) throw new Error('Invalid employee profile section');
        }
        const rawEmployee: unknown = response.employee;
        if (rawEmployee === null || rawEmployee === undefined) {
          if (current) setStatus('empty');
          return;
        }
        if (typeof rawEmployee !== 'object' || Array.isArray(rawEmployee)) throw new Error('Invalid employee profile record');
        const profile = rawEmployee as Profile;
        if (typeof profile.tenant_id === 'string' && profile.tenant_id !== tenantId) throw new Error('Tenant mismatch');
        // Employment metadata remains on its already approved tenant-scoped read RPC.
        let workDetails: Profile | null = null;
        try {
          const { data: detailsData, error: detailsError } = await supabase.rpc(
            'employee_get_my_employment_info_v1', { p_tenant_id: tenantId },
          );
          if (!detailsError && Array.isArray(detailsData) && detailsData.length === 1) {
            const details: unknown = detailsData[0];
            if (details && typeof details === 'object' && !Array.isArray(details)) {
              const record = details as Profile;
              const allowed = [
                'joining_date', 'employment_type', 'designation_title', 'department_name',
                'manager_name', 'work_location_name', 'grade_name',
              ];
              workDetails = Object.fromEntries(
                allowed.filter(key => typeof record[key] === 'string' && Boolean((record[key] as string).trim()))
                  .map(key => [key, record[key]]),
              );
            }
          }
        } catch {
          // Never bypass the approved RPC with private table reads.
        }
        if (current) {
          setEmployment(workDetails);
          setEmployee(profile);
          setProfile(response);
          setStatus('ready');
        }
      } catch {
        if (current) setStatus('error');
      }
    })();
    return () => { current = false; };
  }, [tenantId, revision]);

  const currentTenant = loadedTenantId === tenantId;
  const currentEmployee = currentTenant ? employee : null;
  const currentStatus = currentTenant ? status : 'loading';
  const unavailable = words.unavailable;
  const value = (key: string) => textValue(currentEmployee?.[key] ?? (currentTenant ? employment?.[key] : null), words.unavailable);
  const employmentValue = (key: string) => textValue(currentTenant ? employment?.[key] : null, words.unavailable);
  const records = (key: string) => currentTenant && Array.isArray(profile?.[key])
    ? (profile?.[key] as unknown[]).filter((item): item is Profile => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
  const profileRecordValue = (record: Profile, key: string) => textValue(record[key], unavailable);
  const maskValue = (key: string) => {
    const current = value(key);
    return current === unavailable || showSensitive ? current : '•'.repeat(Math.min(16, Math.max(8, current.length)));
  };
  const name = value('full_name');
  const initials = name === words.unavailable
    ? '—'
    : name.split(/\s+/).filter(Boolean).slice(0, 2).map(item => item[0].toUpperCase()).join('');
  const actionClass = 'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded border border-[#08558B] px-3 py-2 text-sm text-[#08558B] hover:bg-[#EFF7F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08558B]';

  const tabs: { id: Panel; text: string; figma: string }[] = [
    { id: 'personal', text: words.personalTab, figma: '66:72042' },
    { id: 'experience', text: words.experienceTab, figma: '66:50924' },
    { id: 'training', text: words.trainingTab, figma: '66:51095' },
    { id: 'bank', text: words.bankTab, figma: '66:53701' },
    { id: 'family', text: words.familyTab, figma: '66:73395' },
  ];

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, selectedIndex: number) {
    const previous = (selectedIndex + tabs.length - 1) % tabs.length;
    const next = (selectedIndex + 1) % tabs.length;
    let target: number | null = null;
    if (event.key === 'ArrowLeft') target = previous;
    if (event.key === 'ArrowRight') target = next;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target === null) return;
    event.preventDefault();
    setPanel(tabs[target].id);
    tabRefs.current[target]?.focus();
  }

  const personalFields: DetailField[] = [
    { id: 'employee-name', label: words.employeeName, value: value('full_name') },
    { id: 'father-name', label: words.fatherName, value: value('father_name') },
    { id: 'mother-name', label: words.motherName, value: value('mother_name') },
    { id: 'date-of-birth', label: words.dateOfBirth, value: value('date_of_birth') },
    { id: 'birthplace', label: words.birthplace, value: value('birthplace') },
    { id: 'blood-group', label: words.bloodGroup, value: value('blood_group') },
    { id: 'gender', label: words.gender, value: value('gender') },
    { id: 'religion', label: words.religion, value: value('religion') },
    { id: 'nationality', label: words.nationality, value: value('nationality') },
    { id: 'marital-status', label: words.maritalStatus, value: value('marital_status') },
    {
      id: 'digital-signature', label: words.digitalSignature,
      value: <span className="inline-flex min-h-10 max-w-full items-center gap-3 rounded-lg border border-[#DEE0E3] px-3 py-2 text-sm text-slate-500">
        <img src={pdfDocumentIcon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="break-words">{words.signatureUnavailable}</span>
      </span>,
    },
  ];
  const contactFields: DetailField[] = [
    { id: 'phone-number', label: words.phoneNumber, value: value('phone') },
    { id: 'personal-email', label: words.personalEmail, value: value('personal_email') },
    { id: 'official-phone', label: words.officialPhone, value: value('official_phone') },
    { id: 'work-location', label: words.workLocation, value: employmentValue('work_location_name') },
    { id: 'present-address', label: words.presentAddress, value: value('address') },
    { id: 'permanent-address', label: words.permanentAddress, value: value('mailing_address') },
  ];
  const verificationFields: DetailField[] = [
    { id: 'nid', label: words.nid, value: maskValue('nid_number') },
    { id: 'passport', label: words.passport, value: maskValue('passport_number') },
    { id: 'e-tin', label: words.eTin, value: maskValue('etin_number') },
    { id: 'tax-circle', label: words.taxCircle, value: value('tax_circle') },
  ];
  const educationRows = records('education');
  const experienceRows = records('experience');
  const trainingRows = records('training');
  const certificationRows = records('certifications');
  const familyRows = records('family_members');
  const educationFields = (record: Profile): DetailField[] => [
    { id:'education-level',label:words.educationLevel,value:profileRecordValue(record,'education_level') },
    { id:'institution-name',label:words.institutionName,value:profileRecordValue(record,'institution') },
    { id:'subject-major',label:words.subjectMajor,value:profileRecordValue(record,'subject_major') },
    { id:'degree-title',label:words.degreeTitle,value:profileRecordValue(record,'degree_title') },
    { id:'result-type',label:words.resultType,value:profileRecordValue(record,'result_type') },
    { id:'current-result',label:words.currentResult,value:profileRecordValue(record,'result') },
    { id:'starting-year',label:words.startingYear,value:profileRecordValue(record,'starting_year') },
    { id:'passing-year',label:words.passingYear,value:record.currently_studying === true ? words.currentlyStudying : profileRecordValue(record,'passing_year') },
    { id:'education-duration',label:words.duration,value:profileRecordValue(record,'duration') },
    { id:'achievements',label:words.achievements,value:profileRecordValue(record,'achievements') },
  ];
  const experienceFields = (record: Profile): DetailField[] => [
    { id:'job-title',label:words.jobTitle,value:profileRecordValue(record,'role_title') },
    { id:'organization-name',label:words.organizationName,value:profileRecordValue(record,'company') },
    { id:'job-type',label:words.jobType,value:profileRecordValue(record,'job_type') },
    { id:'work-duration',label:words.workDuration,value:profileRecordValue(record,'total_duration') },
    { id:'company-website',label:words.websiteLink,value:profileRecordValue(record,'company_website') },
    { id:'responsibilities',label:words.responsibilities,value:profileRecordValue(record,'description') },
    { id:'work-address',label:words.address,value:profileRecordValue(record,'office_address') },
    { id:'work-date-of-joining',label:words.dateOfJoining,value:profileRecordValue(record,'joining_date') },
    { id:'work-date-of-departure',label:words.dateOfDeparture,value:profileRecordValue(record,'departure_date') },
  ];
  const trainingFields = (record: Profile): DetailField[] => [
    { id:'training-name',label:words.trainingName,value:profileRecordValue(record,'title') },
    { id:'institute-name',label:words.instituteName,value:profileRecordValue(record,'institute_name') },
    { id:'training-number',label:words.trainingNumber,value:profileRecordValue(record,'training_number') },
    { id:'training-year',label:words.yearOfHeld,value:profileRecordValue(record,'year') },
    { id:'training-duration',label:words.duration,value:profileRecordValue(record,'duration') },
    { id:'training-certificate',label:words.certificate,value:record.certificate_url ? words.certificateAttached : unavailable },
  ];
  const certificationFields = (record: Profile): DetailField[] => [
    { id:'certification-name',label:words.trainingName,value:profileRecordValue(record,'title') },
    { id:'certification-organization',label:words.organizationName,value:profileRecordValue(record,'institute_name') },
    { id:'certification-start-date',label:words.startDate,value:profileRecordValue(record,'issue_date') },
    { id:'certification-end-date',label:words.endDate,value:profileRecordValue(record,'expiry_date') },
    { id:'certification-document',label:words.certificate,value:record.certificate_document_url ? words.certificateAttached : unavailable },
  ];
  const bankRecord = currentTenant && profile?.bank && typeof profile.bank === 'object' && !Array.isArray(profile.bank)
    ? profile.bank as Profile : null;
  const bankValue = (key: string) => textValue(bankRecord?.[key], unavailable);
  const bankFields: DetailField[] = [
    { id:'bank-name',label:words.bankName,value:bankValue('bank_name') },
    { id:'bank-account-name',label:words.bankAccountName,value:bankValue('account_name') },
    { id:'branch-name',label:words.branchName,value:bankValue('branch_name') },
    { id:'account-number',label:words.accountNumber,value:bankRecord?.account_number ? <span className="inline-flex flex-wrap items-center gap-2">
      <span>{showBankAccount ? bankValue('account_number') : '•'.repeat(Math.min(16, Math.max(8, String(bankRecord.account_number).length)))}</span>
      <button type="button" aria-label={`${showBankAccount ? words.hide : words.reveal} ${words.accountNumber}`} aria-pressed={showBankAccount}
        onClick={() => setShowBankAccount(current => !current)} className={actionClass}>{showBankAccount ? words.hide : words.reveal}</button>
    </span> : unavailable },
    { id:'routing-number',label:words.routingNumber,value:bankValue('routing_number') },
  ];
  const familyFields = (record: Profile): DetailField[] => [
    { id:'family-name',label:words.familyMemberName,value:profileRecordValue(record,'name') },
    { id:'family-phone',label:words.phoneNumber,value:profileRecordValue(record,'phone') },
    { id:'family-nid',label:words.nidNumber,value:profileRecordValue(record,'nid_number') },
    { id:'family-date-of-birth',label:words.dateOfBirth,value:profileRecordValue(record,'date_of_birth') },
    { id:'family-relation',label:words.relation,value:profileRecordValue(record,'relationship') },
    { id:'family-present-address',label:words.presentAddress,value:profileRecordValue(record,'present_address') },
    { id:'family-permanent-address',label:words.permanentAddress,value:profileRecordValue(record,'permanent_address') },
    { id:'family-nominee',label:words.nomineeStatus,value:record.is_nominee === true ? words.yes : words.no },
  ];

  function requestDelete(kind: 'education' | 'experience' | 'family', record: Profile) {
    if (typeof record.id !== 'string' || !record.id) return;
    setDeleteError('');
    setPendingDelete({ kind, id: record.id });
  }

  async function confirmDeleteRecord() {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    const { error } = await supabase.rpc('employee_delete_my_profile_record_v1', {
      p_tenant_id: tenantId, p_kind: pendingDelete.kind, p_record_id: pendingDelete.id,
    });
    if (error) setDeleteError(words.deleteFailed);
    else {
      setPendingDelete(null);
      setNotice(words.deleteSucceeded);
      setRevision(current => current + 1);
    }
    setDeleteBusy(false);
  }

  function afterProfileSave() {
    setNotice(edit?.kind.startsWith('request-') ? words.requestSubmitted : words.profileSaved);
    setRevision(current => current + 1);
  }

  return <section data-employee-figma-profile data-figma-node="66:72042" className="mx-auto min-w-0 max-w-[1397px] space-y-6" aria-labelledby="employee-figma-profile-heading">
    <h1 id="employee-figma-profile-heading" className="sr-only">{words.heading}</h1>

    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

    {currentStatus === 'loading' && <div role="status" className="space-y-4 rounded-xl bg-white p-5 text-sm text-slate-600">
      <p>{words.loading}</p>
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-[203px] animate-pulse rounded-lg bg-slate-100 xl:col-span-1" />
        <div className="h-[203px] animate-pulse rounded-lg bg-slate-100" />
        <div className="h-[203px] animate-pulse rounded-lg bg-slate-100 md:col-span-2 xl:col-span-1" />
      </div>
    </div>}
    {currentStatus === 'empty' && <div role="status" className="rounded-xl border border-[#DEE0E3] bg-white p-6 text-sm text-slate-600">{words.empty}</div>}
    {currentStatus === 'error' && <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-200 bg-white p-6 text-sm text-rose-900">
      <p>{words.error}</p>
      <button type="button" onClick={() => setRevision(current => current + 1)} className="inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm text-[#08558B] hover:bg-[#EFF7F8] focus-visible:outline-2 focus-visible:outline-[#08558B]">
        <RefreshCw aria-hidden="true" className="h-4 w-4" />{words.retry}
      </button>
    </div>}

    {currentStatus === 'ready' && currentEmployee && <>
      <div data-figma-node="66:72046" className="grid min-w-0 gap-4 lg:grid-cols-[203px_minmax(0,1fr)] xl:grid-cols-[203px_minmax(0,1fr)_minmax(0,1fr)] xl:gap-6">
        <div role="img" aria-label={`${words.employeeName}: ${name}`} className="grid h-[203px] w-[203px] max-w-full place-items-center rounded-lg bg-[#6FB1E1] p-2">
          <span className="grid h-full w-full place-items-center rounded bg-[#EFF7F8] text-4xl font-medium text-[#085587]" aria-hidden="true">{initials}</span>
        </div>
        <dl data-figma-node="66:72049" className="grid min-w-0 content-start gap-3 rounded-lg bg-white p-4">
          {[
            { id: 'name', label: words.identitySection, value: name, important: true },
            { id: 'id', label: words.employeeId, value: value('employee_number') },
            { id: 'official-email', label: words.officialEmail, value: value('official_email') },
            { id: 'designation', label: words.designation, value: value('designation_title') },
            { id: 'department', label: words.department, value: value('department_name') },
          ].map(field => <div key={field.id} className="grid min-w-0 grid-cols-[minmax(92px,0.42fr)_minmax(0,1fr)] items-center gap-x-4">
            <dt className="min-w-0 break-words text-sm text-[#969696]">{field.label}</dt>
            <dd className={`min-w-0 break-words text-[#3D3D3D] ${field.important ? 'text-lg' : 'text-sm'}`}>{field.value}</dd>
          </div>)}
        </dl>
        <dl data-figma-node="66:72070" className="grid min-w-0 content-start gap-3 rounded-lg bg-white p-4 lg:col-start-2 xl:col-start-3">
          {[
            { id: 'joining-date', label: words.joiningDate, value: employmentValue('joining_date') },
            { id: 'employment-type', label: words.employmentType, value: employmentValue('employment_type') },
            { id: 'work-location', label: words.workLocation, value: employmentValue('work_location_name') },
            { id: 'line-manager', label: words.lineManager, value: employmentValue('manager_name') },
            { id: 'team', label: words.team, value: value('team_name') },
            ...(currentTenant && typeof employment?.grade_name === 'string' && employment.grade_name.trim()
              ? [{ id: 'grade', label: words.grade, value: employmentValue('grade_name') }]
              : []),
          ].map(field => <div key={field.id} className="grid min-w-0 grid-cols-[minmax(118px,0.52fr)_minmax(0,1fr)] items-center gap-x-3">
            <dt className="min-w-0 break-words text-sm text-[#969696]">{field.label}</dt>
            <dd className="min-w-0 break-words text-sm text-[#3D3D3D]">{field.value}</dd>
          </div>)}
        </dl>
      </div>

      <div data-figma-node="66:72092" role="tablist" aria-label={words.heading} className="mb-[23px]! flex min-w-0 gap-2 overflow-x-auto rounded-lg">
        {tabs.map((tab, index) => <button key={tab.id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab"
          id={`employee-figma-tab-${tab.id}`} aria-selected={panel === tab.id} aria-controls={`employee-figma-panel-${tab.id}`}
          tabIndex={panel === tab.id ? 0 : -1} onClick={() => setPanel(tab.id)} onKeyDown={event => moveTab(event, index)}
          className={`inline-flex h-[56px] min-h-[56px] shrink-0 items-center justify-center rounded-lg px-4 py-0 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#085587] ${index === 0 ? 'lg:w-[313px] lg:min-w-[313px]' : ''} ${panel === tab.id ? 'bg-[#085587] text-white' : 'bg-white text-[#49454F] hover:bg-[#EFF7F8]'}`}>
          {tab.text}
        </button>)}
      </div>

      {tabs.map(tab => <div key={tab.id} id={`employee-figma-panel-${tab.id}`} role="tabpanel" aria-labelledby={`employee-figma-tab-${tab.id}`}
        tabIndex={panel === tab.id ? 0 : -1} hidden={panel !== tab.id} data-figma-node={tab.figma}
        className="min-w-0 focus-visible:outline-2 focus-visible:outline-[#085587]">
        {tab.id === 'personal' && <section className="space-y-6 rounded-2xl bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="employee-figma-content-title">
          <div className="border-b border-[#E7EEF2] pb-[27px]">
            <h2 id="employee-figma-content-title" className="text-lg font-bold text-[#49454F]">{words.profileContentHeading}</h2>
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2" data-figma-node="109:40969">
            <section className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-personal-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                <SectionHeading id="employee-figma-personal-title" title={words.personalDetails} icon={<img src={addressBookIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
                <button type="button" aria-label={`${words.edit} ${words.personalDetails}`} onClick={() => setEdit({ kind:'request-personal', initial:currentEmployee || {} })} className={actionClass}>
                  {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                </button>
              </div>
              <DetailRows fields={personalFields} />
            </section>

            <div className="grid min-w-0 content-start gap-3">
              <section className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-contact-title">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                  <SectionHeading id="employee-figma-contact-title" title={words.contactDetails} icon={<img src={addressBookIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
                  <button type="button" aria-label={words.editContactDetails} onClick={() => setEdit({ kind:'request-contact', initial:currentEmployee || {} })} className={actionClass}>
                    {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                  </button>
                </div>
                <DetailRows fields={contactFields} />
              </section>

              <section className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-verification-title">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                  <SectionHeading id="employee-figma-verification-title" title={words.verification} icon={<img src={documentCheckIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
                  <div className="flex shrink-0 gap-2">
                    <button type="button" aria-pressed={showSensitive} onClick={() => setShowSensitive(current => !current)} className={actionClass}>
                      {showSensitive ? <><EyeOff aria-hidden="true" className="h-4 w-4" />{words.hide}</> : <><Eye aria-hidden="true" className="h-4 w-4" />{words.reveal}</>}
                    </button>
                    <button type="button" aria-label={`${words.edit} ${words.verification}`} onClick={() => setEdit({ kind:'request-personal', initial:currentEmployee || {} })} className={actionClass}>
                      {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                </div>
                <DetailRows fields={verificationFields} />
              </section>
            </div>
          </div>

          <div aria-hidden="true" className="h-px bg-[#E7EEF2]" />
          <section className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-education-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
              <SectionHeading id="employee-figma-education-title" title={words.educationDetails} icon={<img src={graduationCapIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
              <button type="button" onClick={() => setEdit({ kind:'education' })} className={actionClass}>{words.add}<span aria-hidden="true" className="text-lg leading-none">+</span></button>
            </div>
            {educationRows.length === 0 ? <p role="status" className="mt-4 text-sm text-slate-600">{words.noRecords}</p>
              : <div className="mt-4 divide-y divide-[#E7EEF2]">
                {educationRows.map((record,index) => <article key={String(record.id || index)} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-2 flex justify-end">
                    <button type="button" onClick={() => setEdit({ kind:'education', initial:record })} aria-label={`${words.edit} ${words.educationDetails} ${index+1}`} className={actionClass}>
                      {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                    </button>
                    <button type="button" onClick={() => requestDelete('education', record)} aria-label={`${words.delete} ${words.educationDetails} ${index+1}`} className={actionClass}>{words.delete}</button>
                  </div>
                  <DetailRows fields={educationFields(record)} />
                </article>)}
              </div>}
          </section>
        </section>}

        {tab.id === 'experience' && <section className="min-w-0 rounded-2xl bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="employee-figma-experience-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-5">
            <SectionHeading id="employee-figma-experience-title" title={words.experienceInformation} icon={<BriefcaseBusiness className="h-[18px] w-[18px] text-[#08558B]" />} />
            <button type="button" onClick={() => setEdit({ kind:'experience' })} className={actionClass}>{words.add}<span aria-hidden="true" className="text-lg leading-none">+</span></button>
          </div>
          {experienceRows.length === 0 ? <p role="status" className="mt-5 text-sm text-slate-600">{words.noRecords}</p>
            : <div className="mt-5 grid min-w-0 gap-3">{experienceRows.map((record,index) => <article key={String(record.id || index)} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6">
              <div className="mb-3 flex justify-end"><button type="button" onClick={() => setEdit({ kind:'experience', initial:record })} aria-label={`${words.edit} ${words.experienceTab} ${index+1}`} className={actionClass}>
                {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
              </button><button type="button" onClick={() => requestDelete('experience', record)} aria-label={`${words.delete} ${words.experienceTab} ${index+1}`} className={actionClass}>{words.delete}</button></div>
              <DetailRows fields={experienceFields(record)} />
            </article>)}</div>}
        </section>}

        {tab.id === 'training' && <section className="min-w-0 rounded-2xl bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="employee-figma-training-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-5">
            <SectionHeading id="employee-figma-training-title" title={words.trainingInformation} icon={<BookOpenCheck className="h-[18px] w-[18px] text-[#08558B]" />} />
          </div>
          <div className="mt-5 grid min-w-0 gap-3">
            <article className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-professional-training-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                <SectionHeading id="employee-figma-professional-training-title" title={words.professionalTraining} icon={<img src={documentCheckIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
                <button type="button" onClick={() => setEdit({ kind:'training' })} className={actionClass}>{words.add}<span aria-hidden="true" className="text-lg leading-none">+</span></button>
              </div>
              {trainingRows.length === 0 ? <p role="status" className="mt-4 text-sm text-slate-600">{words.noRecords}</p>
                : <div className="divide-y divide-[#E7EEF2]">{trainingRows.map((record,index) => <div key={String(record.id || index)} className="py-4 first:pb-4">
                  <div className="mb-2 flex justify-end"><button type="button" onClick={() => setEdit({ kind:'training', initial:record })} aria-label={`${words.edit} ${words.professionalTraining} ${index+1}`} className={actionClass}>
                    {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                  </button></div>
                  <DetailRows fields={trainingFields(record)} />
                </div>)}</div>}
            </article>
            <article className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-professional-certification-title">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                <SectionHeading id="employee-figma-professional-certification-title" title={words.professionalCertification} icon={<img src={documentCheckIcon} alt="" aria-hidden="true" className="h-[18px] w-[18px]" />} />
                <button type="button" onClick={() => setEdit({ kind:'certification' })} className={actionClass}>{words.add}<span aria-hidden="true" className="text-lg leading-none">+</span></button>
              </div>
              {certificationRows.length === 0 ? <p role="status" className="mt-4 text-sm text-slate-600">{words.noRecords}</p>
                : <div className="divide-y divide-[#E7EEF2]">{certificationRows.map((record,index) => <div key={String(record.id || index)} className="py-4 first:pt-0 last:pb-0">
                  <div className="mb-2 flex justify-end"><button type="button" onClick={() => setEdit({ kind:'certification', initial:record })} aria-label={`${words.edit} ${words.professionalCertification} ${index+1}`} className={actionClass}>
                    {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                  </button></div>
                  <DetailRows fields={certificationFields(record)} />
                </div>)}</div>}
            </article>
          </div>
        </section>}

        {tab.id === 'bank' && <section className="min-w-0 rounded-2xl bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="employee-figma-bank-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-5">
            <SectionHeading id="employee-figma-bank-title" title={words.bankInformation} icon={<Landmark className="h-[18px] w-[18px] text-[#08558B]" />} />
            <button type="button" onClick={() => setEdit({ kind:'bank', initial:bankRecord || {} })} className={actionClass}>
              {bankRecord ? words.edit : words.add}{bankRecord ? <img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" /> : <span aria-hidden="true" className="text-lg leading-none">+</span>}
            </button>
          </div>
          {!bankRecord && <p role="status" className="mt-4 text-sm text-slate-600">{words.noRecords}</p>}
          {bankRecord && <DetailRows fields={bankFields} />}
        </section>}

        {tab.id === 'family' && <section className="min-w-0 rounded-2xl bg-white p-4 sm:p-6 lg:p-8" aria-labelledby="employee-figma-family-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-5">
            <SectionHeading id="employee-figma-family-title" title={words.familyInformation} icon={<UsersRound className="h-[18px] w-[18px] text-[#08558B]" />} />
            <button type="button" onClick={() => setEdit({ kind:'family' })} className={actionClass}>{words.add}<span aria-hidden="true" className="text-lg leading-none">+</span></button>
          </div>
          <section className="mt-4 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6" aria-labelledby="employee-figma-emergency-contact-title">
            <h3 id="employee-figma-emergency-contact-title" className="text-lg text-[#424242]">{words.emergencyContact}</h3>
            <DetailRows fields={[
              { id:'emergency-name',label:words.emergencyName,value:value('emergency_contact_name') },
              { id:'emergency-phone',label:words.emergencyPhone,value:value('emergency_contact_phone') },
              { id:'emergency-relation',label:words.relation,value:value('emergency_contact_relation') },
            ]} />
            <div className="mt-4 flex justify-end border-t border-[#E7EEF2] pt-4">
              <button type="button" aria-label={words.editContactDetails} onClick={() => setEdit({ kind:'request-contact', initial:currentEmployee || {} })} className={actionClass}>
                {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
              </button>
            </div>
          </section>
          {familyRows.length === 0 ? <p role="status" className="mt-4 text-sm text-slate-600">{words.noRecords}</p>
            : <div className="mt-4 grid min-w-0 gap-3">{familyRows.map((record,index) => <article key={String(record.id || index)} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EEF2] pb-4">
                <SectionHeading title={record.is_nominee === true ? words.nomineeName : words.familyMemberName} icon={<UsersRound className="h-[18px] w-[18px] text-[#08558B]" />} />
                <button type="button" onClick={() => setEdit({ kind:'family', initial:record })} aria-label={`${words.edit} ${words.familyInformation} ${index+1}`} className={actionClass}>
                  {words.edit}<img src={editPenIcon} alt="" aria-hidden="true" className="h-[15px] w-[15px]" />
                </button>
                <button type="button" onClick={() => requestDelete('family', record)} aria-label={`${words.delete} ${words.familyInformation} ${index+1}`} className={actionClass}>{words.delete}</button>
              </div>
              <DetailRows fields={familyFields(record)} />
            </article>)}</div>}
        </section>}
      </div>)}
    </>}
    {pendingDelete && <div className="fixed inset-0 z-[105] grid place-items-center bg-black/40 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="profile-delete-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="profile-delete-title" className="text-lg font-semibold text-slate-900">{words.deleteConfirm}</h2>
        {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={deleteBusy} onClick={() => { setPendingDelete(null); setDeleteError(''); }} className={actionClass}>{words.cancel}</button>
          <button type="button" autoFocus disabled={deleteBusy} onClick={() => void confirmDeleteRecord()} className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{words.delete}</button>
        </div>
      </section>
    </div>}
    {edit && <EmployeeProfileEditModal kind={edit.kind} tenantId={tenantId} locale={locale} initial={edit.initial}
      onClose={() => setEdit(null)} onSaved={afterProfileSave} />}
  </section>;
}
