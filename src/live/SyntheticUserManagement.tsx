import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft, BadgeCheck, BriefcaseBusiness, Building2, Check, Eye, Mail, Pencil,
  Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRoundPlus, Users, X,
} from 'lucide-react';
import { activateModalFocusTrap } from './modal-focus';
import { projectText, type Locale } from './project-locale';
import {
  createManualSyntheticPreviewDraft,
  createSyntheticPreviewDraft,
  materializeSyntheticPreviewUser,
  PREVIEW_USER_ROLES,
  readAllSyntheticPreviewUsers,
  readSyntheticPreviewUsers,
  validateSyntheticPreviewDraft,
  writeSyntheticPreviewUsers,
} from './syntheticUserPreview';
import type { PreviewUserRole, PreviewUserStatus, SyntheticPreviewUser, SyntheticPreviewUserDraft } from './syntheticUserPreview';
import { supabase } from '../lib/supabase';

type DepartmentReference = { id: string; name: string };
type DesignationReference = { id: string; title: string; department_id: string | null };

const workspaceModules: Record<PreviewUserRole, string[]> = {
  'Administrator / HR Administrator': ['Organization structure', 'Employee directory', 'Employee lifecycle', 'Manpower requisitions', 'Recruitment', 'Policies and learning', 'Reports'],
  Employee: ['My overview', 'My profile', 'Attendance', 'Leave and balances', 'Timesheets', 'Learning', 'Payslips', 'Travel and expenses'],
  Manager: ['Manager dashboard', 'Team directory', 'Attendance monitoring', 'Leave approvals', 'Timesheet reviews', 'Team tasks', 'Performance reviews'],
  HOD: ['Department dashboard', 'Department employees', 'Department requisitions', 'Staffing requirements', 'Department performance', 'Escalations', 'Approvals'],
  CEO: ['Executive dashboard', 'Workforce summary', 'Organization reporting', 'Performance overview', 'Approvals and escalations'],
  'Recruitment / HR Operations': ['Recruitment dashboard', 'Job circulars', 'Candidate review', 'Interview management', 'Offer management', 'Employee onboarding'],
};

const workspaceActions: Record<PreviewUserRole, { id: string; label: string }[]> = {
  'Administrator / HR Administrator': [
    { id: 'directory', label: 'Open the employee directory' },
    { id: 'requisition', label: 'Review a manpower requisition' },
  ],
  Employee: [
    { id: 'profile', label: 'Review your profile' },
    { id: 'leave', label: 'Prepare a leave request' },
  ],
  Manager: [
    { id: 'leave', label: 'Review a leave request' },
    { id: 'timesheet', label: 'Review a timesheet' },
  ],
  HOD: [
    { id: 'staffing', label: 'Review a department staffing request' },
    { id: 'report', label: 'Open a department report' },
  ],
  CEO: [
    { id: 'workforce', label: 'Open a workforce summary' },
    { id: 'escalation', label: 'Review an escalation' },
  ],
  'Recruitment / HR Operations': [
    { id: 'candidate', label: 'Review a candidate' },
    { id: 'interview', label: 'Open an interview plan' },
  ],
};

const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-figma-primary-600)] disabled:cursor-not-allowed disabled:opacity-50';
const previewBengali: Record<string, string> = {
  'User Management': 'ব্যবহারকারী ব্যবস্থাপনা', 'User management preview': 'ব্যবহারকারী ব্যবস্থাপনা প্রিভিউ',
  'Admin workspace': 'প্রশাসক কর্মক্ষেত্র', 'Create user': 'ব্যবহারকারী তৈরি করুন', 'Generate Random User': 'এলোমেলো ব্যবহারকারী তৈরি করুন',
  'Create preview user': 'প্রিভিউ ব্যবহারকারী তৈরি করুন', 'Generated user preview': 'তৈরি করা ব্যবহারকারীর প্রিভিউ', 'Edit preview user': 'প্রিভিউ ব্যবহারকারী সম্পাদনা করুন',
  'Create browser-only synthetic users and inspect their role workspaces without another login.': 'এই ব্রাউজারে কৃত্রিম ব্যবহারকারী তৈরি করুন এবং আবার সাইন-ইন না করে তাদের ভূমিকার কর্মক্ষেত্র দেখুন।',
  'Frontend preview data': 'ফ্রন্টএন্ড প্রিভিউ ডেটা',
  'Records are stored only in this browser for the selected organization. They do not create auth.users, send email, or persist to production SQL.': 'রেকর্ডগুলো নির্বাচিত প্রতিষ্ঠানের জন্য শুধু এই ব্রাউজারেই সংরক্ষিত থাকে। এগুলো auth.users তৈরি করে না, ইমেইল পাঠায় না বা উৎপাদন SQL-এ সংরক্ষিত হয় না।',
  'The existing single Super Admin account cannot be generated as a second root account.': 'বিদ্যমান একক সুপার অ্যাডমিন অ্যাকাউন্টের দ্বিতীয় রুট অ্যাকাউন্ট তৈরি করা যাবে না।',
  'Selected organization': 'নির্বাচিত প্রতিষ্ঠান', 'Synthetic users': 'কৃত্রিম ব্যবহারকারী', 'Active in preview': 'প্রিভিউতে সক্রিয়', 'Active': 'সক্রিয়', 'Inactive': 'নিষ্ক্রিয়',
  'Deactivate preview user?': 'প্রিভিউ ব্যবহারকারী নিষ্ক্রিয় করবেন?', 'Activate preview user?': 'প্রিভিউ ব্যবহারকারী সক্রিয় করবেন?',
  'Deactivate {name} in this organization’s browser-only preview?': 'এই প্রতিষ্ঠানের শুধু-ব্রাউজার প্রিভিউতে {name} নিষ্ক্রিয় করবেন?',
  'Activate {name} in this organization’s browser-only preview?': 'এই প্রতিষ্ঠানের শুধু-ব্রাউজার প্রিভিউতে {name} সক্রিয় করবেন?',
  'Search users': 'ব্যবহারকারী খুঁজুন', 'Search name, email, ID, department': 'নাম, ইমেইল, আইডি বা বিভাগ দিয়ে খুঁজুন',
  'All roles': 'সব ভূমিকা', 'All statuses': 'সব অবস্থা', 'User': 'ব্যবহারকারী', 'Role': 'ভূমিকা',
  'User ID / Employee No.': 'ব্যবহারকারী আইডি / কর্মী নম্বর', 'Department / Designation': 'বিভাগ / পদবি', 'Status': 'অবস্থা', 'Actions': 'কার্যক্রম',
  'No users match these filters': 'এই ফিল্টারে কোনো ব্যবহারকারী মেলেনি', 'No synthetic users yet': 'এখনো কোনো কৃত্রিম ব্যবহারকারী নেই',
  'Change the search or filters and try again.': 'অনুসন্ধান বা ফিল্টার বদলে আবার চেষ্টা করুন।', 'Create a preview user or generate one to begin.': 'শুরু করতে প্রিভিউ ব্যবহারকারী তৈরি করুন বা স্বয়ংক্রিয়ভাবে তৈরি করুন।',
  'Showing {start}–{end} of {count}': '{count}টির মধ্যে {start}–{end} দেখানো হচ্ছে', '0 users': '০ জন ব্যবহারকারী', 'Previous': 'আগের', 'Next': 'পরের',
  'Full name': 'পূর্ণ নাম', 'Synthetic email': 'কৃত্রিম ইমেইল', 'Only reserved @example.com addresses are accepted.': 'শুধু সংরক্ষিত @example.com ঠিকানা গ্রহণ করা হয়।',
  'User ID': 'ব্যবহারকারী আইডি', 'Employee number': 'কর্মী নম্বর', 'Department': 'বিভাগ', 'Designation': 'পদবি',
  'Select a department': 'একটি বিভাগ নির্বাচন করুন', 'Select a designation': 'একটি পদবি নির্বাচন করুন',
  'No active departments are configured for this organization.': 'এই প্রতিষ্ঠানে কোনো সক্রিয় বিভাগ নির্ধারিত নেই।',
  'Loading organization references…': 'প্রতিষ্ঠানের রেফারেন্স তথ্য লোড হচ্ছে…', 'Retry loading references': 'রেফারেন্স তথ্য আবার লোড করুন',
  'Choose a department from this organization.': 'এই প্রতিষ্ঠান থেকে একটি বিভাগ নির্বাচন করুন।',
  'Choose a designation for the selected department.': 'নির্বাচিত বিভাগের জন্য একটি পদবি নির্বাচন করুন।',
  'Designation is not configured for this department; enter a preview label.': 'এই বিভাগের জন্য পদবি নির্ধারিত নেই; প্রিভিউ লেবেল লিখুন।',
  'Enter a designation label for this organization.': 'এই প্রতিষ্ঠানের জন্য একটি পদবির লেবেল লিখুন।',
  'Select a preview role.': 'একটি প্রিভিউ ভূমিকা নির্বাচন করুন।',
  'Organization references are unavailable. Retry loading references.': 'প্রতিষ্ঠানের রেফারেন্স তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।',
  'Leave request preview': 'ছুটির অনুরোধ প্রিভিউ', 'Saved preview draft': 'সংরক্ষিত প্রিভিউ খসড়া', 'From date': 'শুরুর তারিখ', 'To date': 'শেষের তারিখ',
  'Reason': 'কারণ', 'Save preview draft': 'প্রিভিউ খসড়া সংরক্ষণ করুন', 'Draft': 'খসড়া', 'No draft request saved.': 'কোনো খসড়া অনুরোধ সংরক্ষিত নেই।',
  'This is a local preview draft; no policy or balance was checked and no request was submitted.': 'এটি স্থানীয় প্রিভিউ খসড়া; কোনো নীতি বা অবশিষ্ট যাচাই করা হয়নি এবং কোনো অনুরোধ জমা হয়নি।',
  'Draft saved in this browser; no SQL request was created.': 'এই ব্রাউজারে খসড়া সংরক্ষিত হয়েছে; কোনো SQL অনুরোধ তৈরি হয়নি।',
  'Enter a valid date range and a reason.': 'সঠিক তারিখের পরিসর ও কারণ লিখুন।', 'The end date must be on or after the start date.': 'শেষের তারিখ শুরুর তারিখের সমান বা পরের হতে হবে।',
  'Generated information is editable before saving.': 'সংরক্ষণের আগে তৈরি করা তথ্য সম্পাদনা করা যাবে।', 'Regenerate': 'আবার তৈরি করুন',
  'This form saves synthetic preview data in this browser only. No email is sent and no production account is created.': 'এই ফর্মের কৃত্রিম প্রিভিউ ডেটা শুধু এই ব্রাউজারে সংরক্ষিত হয়। কোনো ইমেইল পাঠানো বা উৎপাদন অ্যাকাউন্ট তৈরি করা হয় না।',
  'Use a reserved synthetic address ending in @example.com.': 'শেষে @example.com থাকা সংরক্ষিত কৃত্রিম ঠিকানা ব্যবহার করুন।',
  'Super Admin remains the existing single account and is not available for synthetic generation.': 'সুপার অ্যাডমিন বিদ্যমান একক অ্যাকাউন্ট হিসেবেই থাকবে এবং কৃত্রিমভাবে তৈরি করা যাবে না।',
  'Cancel': 'বাতিল', 'Save changes': 'পরিবর্তন সংরক্ষণ করুন', 'Save preview user': 'প্রিভিউ ব্যবহারকারী সংরক্ষণ করুন', 'Close': 'বন্ধ করুন',
  'Edit user': 'ব্যবহারকারী সম্পাদনা করুন', 'View profile': 'প্রোফাইল দেখুন', 'View as User': 'ব্যবহারকারী হিসেবে দেখুন',
  'Deactivate user': 'ব্যবহারকারী নিষ্ক্রিয় করুন', 'Activate user': 'ব্যবহারকারী সক্রিয় করুন', 'Remove synthetic user': 'কৃত্রিম ব্যবহারকারী সরান',
  'Remove synthetic user?': 'কৃত্রিম ব্যবহারকারী সরাবেন?', 'Remove': 'সরান',
  'Change status from the user list; confirmation is required.': 'ব্যবহারকারী তালিকা থেকে অবস্থা বদলালে নিশ্চিত করতে হবে।',
  'Remove {name} and its preview-only actions from this browser?': 'এই ব্রাউজার থেকে {name} এবং তার শুধু-প্রিভিউ কার্যক্রম সরাবেন?',
  'Back to User Management': 'ব্যবহারকারী ব্যবস্থাপনায় ফিরুন', 'Synthetic preview only': 'শুধু কৃত্রিম প্রিভিউ', 'Viewing as': 'যেভাবে দেখছেন',
  'This does not switch accounts, create an authenticated session, or read/write production records. Preview actions stay in this browser.': 'এতে অ্যাকাউন্ট বদলায় না, প্রমাণীকৃত সেশন তৈরি হয় না বা উৎপাদন রেকর্ড পড়া/লেখা হয় না। প্রিভিউ কার্যক্রম এই ব্রাউজারেই থাকে।',
  'Role overview': 'ভূমিকা সারসংক্ষেপ', 'Sample workspace section': 'নমুনা কর্মক্ষেত্র বিভাগ', 'Sample actions': 'নমুনা কার্যক্রম',
  'Complete a sample step to verify the role preview interaction. It only updates this synthetic preview record.': 'ভূমিকা প্রিভিউ যাচাই করতে একটি নমুনা ধাপ সম্পন্ন করুন। এতে শুধু এই কৃত্রিম প্রিভিউ রেকর্ড বদলাবে।',
  'Complete sample step': 'নমুনা ধাপ সম্পন্ন করুন', 'Completed in preview': 'প্রিভিউতে সম্পন্ন',
  'Sample section opened. The information below is synthetic preview content only.': 'নমুনা বিভাগ খোলা হয়েছে। নিচের তথ্য শুধু কৃত্রিম প্রিভিউ কনটেন্ট।',
  'Choose a role-specific section above. Sample records here never connect to live SQL.': 'উপরে ভূমিকা-নির্দিষ্ট বিভাগ বেছে নিন। এখানে নমুনা রেকর্ড কখনো লাইভ SQL-এ যুক্ত হয় না।',
  'Workspace': 'কর্মক্ষেত্র', 'Preview state': 'প্রিভিউ অবস্থা', 'Browser-only sample': 'শুধু ব্রাউজারের নমুনা', 'Not set': 'নির্ধারিত নয়', 'Email': 'ইমেইল', 'Organization': 'প্রতিষ্ঠান',
  'Synthetic employee profile': 'কৃত্রিম কর্মী প্রোফাইল', 'This associated employee profile is synthetic preview data and is not loaded from SQL.': 'এই সংশ্লিষ্ট কর্মী প্রোফাইলটি কৃত্রিম প্রিভিউ ডেটা; এটি SQL থেকে লোড করা হয়নি।',
  'Loading preview users…': 'প্রিভিউ ব্যবহারকারী লোড হচ্ছে…', 'Scrollable synthetic user list': 'স্ক্রলযোগ্য কৃত্রিম ব্যবহারকারী তালিকা',
  'The preview change could not be saved. Check browser storage and retry.': 'প্রিভিউ পরিবর্তন সংরক্ষণ করা যায়নি। ব্রাউজার স্টোরেজ পরীক্ষা করে আবার চেষ্টা করুন।',
  'This preview user no longer exists. Refresh the list and try again.': 'এই প্রিভিউ ব্যবহারকারী আর নেই। তালিকা রিফ্রেশ করে আবার চেষ্টা করুন।',
  'Enter a name between 2 and 100 characters.': '২ থেকে ১০০ অক্ষরের মধ্যে একটি নাম লিখুন।', 'Use a user ID in the format USR-XXXXXXXX.': 'USR-XXXXXXXX বিন্যাসে একটি ব্যবহারকারী আইডি লিখুন।',
  'Use an employee number in the format EMP-YYYY-0001.': 'EMP-YYYY-0001 বিন্যাসে একটি কর্মী নম্বর লিখুন।',
  'That email, user ID, or employee number is already in use for this organization.': 'এই প্রতিষ্ঠানে ইমেইল, ব্যবহারকারী আইডি বা কর্মী নম্বরটি আগে থেকেই ব্যবহৃত হচ্ছে।',
  'Preview user details saved in this browser.': 'প্রিভিউ ব্যবহারকারীর তথ্য এই ব্রাউজারে সংরক্ষিত হয়েছে।', 'Preview user created in this browser.': 'প্রিভিউ ব্যবহারকারী এই ব্রাউজারে তৈরি হয়েছে।',
  'Preview user activated.': 'প্রিভিউ ব্যবহারকারী সক্রিয় করা হয়েছে।', 'Preview user deactivated.': 'প্রিভিউ ব্যবহারকারী নিষ্ক্রিয় করা হয়েছে।',
  'Synthetic preview user removed from this browser.': 'কৃত্রিম প্রিভিউ ব্যবহারকারী এই ব্রাউজার থেকে সরানো হয়েছে।',
  'Sample action saved in preview data. No production record was changed.': 'নমুনা কার্যক্রম প্রিভিউ ডেটায় সংরক্ষিত হয়েছে। উৎপাদন রেকর্ডে কোনো পরিবর্তন হয়নি।',
  'Administrator / HR Administrator': 'প্রশাসক / এইচআর প্রশাসক', 'Employee': 'কর্মী', 'Manager': 'ব্যবস্থাপক', 'HOD': 'বিভাগীয় প্রধান',
  'CEO': 'প্রধান নির্বাহী কর্মকর্তা', 'Recruitment / HR Operations': 'নিয়োগ / এইচআর কার্যক্রম',
  'Organization structure': 'প্রতিষ্ঠানের কাঠামো', 'Employee directory': 'কর্মী তালিকা', 'Employee lifecycle': 'কর্মী জীবনচক্র',
  'Manpower requisitions': 'জনবল চাহিদা', 'Recruitment': 'নিয়োগ', 'Policies and learning': 'নীতিমালা ও শিক্ষা', 'Reports': 'প্রতিবেদন',
  'My overview': 'আমার সারসংক্ষেপ', 'My profile': 'আমার প্রোফাইল', 'Attendance': 'উপস্থিতি', 'Leave and balances': 'ছুটি ও অবশিষ্ট',
  'Timesheets': 'টাইমশিট', 'Learning': 'শিক্ষা', 'Payslips': 'বেতন স্লিপ', 'Travel and expenses': 'ভ্রমণ ও খরচ',
  'Manager dashboard': 'ব্যবস্থাপক ড্যাশবোর্ড', 'Team directory': 'দলের তালিকা', 'Attendance monitoring': 'উপস্থিতি পর্যবেক্ষণ',
  'Leave approvals': 'ছুটি অনুমোদন', 'Timesheet reviews': 'টাইমশিট পর্যালোচনা', 'Team tasks': 'দলের কাজ', 'Performance reviews': 'কর্মদক্ষতা পর্যালোচনা',
  'Department dashboard': 'বিভাগীয় ড্যাশবোর্ড', 'Department employees': 'বিভাগের কর্মীরা', 'Department requisitions': 'বিভাগীয় চাহিদা',
  'Staffing requirements': 'জনবল প্রয়োজন', 'Department performance': 'বিভাগের কর্মদক্ষতা', 'Escalations': 'ঊর্ধ্বতন পর্যায়ের বিষয়', 'Approvals': 'অনুমোদন',
  'Executive dashboard': 'নির্বাহী ড্যাশবোর্ড', 'Workforce summary': 'কর্মীবাহিনীর সারসংক্ষেপ', 'Organization reporting': 'প্রতিষ্ঠান প্রতিবেদন',
  'Performance overview': 'কর্মদক্ষতার সারসংক্ষেপ', 'Approvals and escalations': 'অনুমোদন ও ঊর্ধ্বতন পর্যায়ের বিষয়',
  'Recruitment dashboard': 'নিয়োগ ড্যাশবোর্ড', 'Job circulars': 'চাকরির বিজ্ঞপ্তি', 'Candidate review': 'প্রার্থী পর্যালোচনা',
  'Interview management': 'সাক্ষাৎকার ব্যবস্থাপনা', 'Offer management': 'প্রস্তাব ব্যবস্থাপনা', 'Employee onboarding': 'নতুন কর্মী অন্তর্ভুক্তি',
  'Review your profile': 'আপনার প্রোফাইল পর্যালোচনা করুন', 'Prepare a leave request': 'ছুটির অনুরোধ প্রস্তুত করুন', 'Review a leave request': 'ছুটির অনুরোধ পর্যালোচনা করুন',
  'Review a timesheet': 'টাইমশিট পর্যালোচনা করুন', 'Review a department staffing request': 'বিভাগীয় জনবল অনুরোধ পর্যালোচনা করুন',
  'Open a department report': 'বিভাগীয় প্রতিবেদন খুলুন', 'Open a workforce summary': 'কর্মীবাহিনীর সারসংক্ষেপ খুলুন', 'Review an escalation': 'ঊর্ধ্বতন পর্যায়ের বিষয় পর্যালোচনা করুন',
  'Review a candidate': 'প্রার্থী পর্যালোচনা করুন', 'Open an interview plan': 'সাক্ষাৎকার পরিকল্পনা খুলুন', 'Open the employee directory': 'কর্মী তালিকা খুলুন',
  'Review a manpower requisition': 'জনবল চাহিদা পর্যালোচনা করুন',
};

type FormMode = 'create' | 'edit' | null;

function translate(locale: Locale, source: string): string {
  return locale === 'bn' ? previewBengali[source] || projectText(locale, source) : source;
}

export function SyntheticUserManagement({ tenantId, tenantName, locale }: {
  tenantId: string;
  tenantName: string;
  locale: Locale;
}) {
  const tx = (text: string) => translate(locale, text);
  const [users, setUsers] = useState<SyntheticPreviewUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [departments, setDepartments] = useState<DepartmentReference[]>([]);
  const [designations, setDesignations] = useState<DesignationReference[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceError, setReferenceError] = useState('');
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [draft, setDraft] = useState<SyntheticPreviewUserDraft | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState(false);
  const [profileRecordKey, setProfileRecordKey] = useState('');
  const [removeRecordKey, setRemoveRecordKey] = useState('');
  const [statusChangeRecordKey, setStatusChangeRecordKey] = useState('');
  const [previewRecordKey, setPreviewRecordKey] = useState('');
  const [activeModule, setActiveModule] = useState('');
  const [leaveFromDate, setLeaveFromDate] = useState('');
  const [leaveToDate, setLeaveToDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [leaveNotice, setLeaveNotice] = useState('');
  const formPanelRef = useRef<HTMLElement>(null);
  const formInitialFocusRef = useRef<HTMLButtonElement>(null);
  const removePanelRef = useRef<HTMLElement>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const statusPanelRef = useRef<HTMLElement>(null);
  const cancelStatusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setError('');
    setNotice('');
    setPreviewRecordKey('');
    setProfileRecordKey('');
    setRemoveRecordKey('');
    setStatusChangeRecordKey('');
    setFormMode(null);
    setDraft(null);
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setPage(0);
    try {
      setUsers(readSyntheticPreviewUsers(tenantId));
    } catch (cause) {
      setUsers([]);
      setLoadError(cause instanceof Error ? cause.message : 'Preview records could not be read.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    setReferenceLoading(true);
    setReferenceError('');
    setDepartments([]);
    setDesignations([]);
    async function loadOrganizationReferences() {
      try {
        const [departmentResult, designationResult] = await Promise.all([
          supabase.from('departments').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name').limit(200),
          supabase.from('designations').select('id,title,department_id').eq('tenant_id', tenantId).eq('active', true).order('title').limit(500),
        ]);
        if (departmentResult.error) throw departmentResult.error;
        if (designationResult.error) throw designationResult.error;
        if (!active) return;
        setDepartments((departmentResult.data || []) as DepartmentReference[]);
        setDesignations((designationResult.data || []) as DesignationReference[]);
      } catch (cause) {
        if (active) setReferenceError(cause instanceof Error ? cause.message : 'Unable to read this organization’s department references.');
      } finally {
        if (active) setReferenceLoading(false);
      }
    }
    if (tenantId) void loadOrganizationReferences();
    else setReferenceLoading(false);
    return () => { active = false; };
  }, [tenantId, referenceRetry]);

  useEffect(() => {
    if (!formMode) return;
    return activateModalFocusTrap(formPanelRef.current, {
      initialFocus: formInitialFocusRef.current,
      onEscape: closeForm,
    });
  }, [Boolean(formMode)]);

  useEffect(() => {
    if (!removeRecordKey) return;
    return activateModalFocusTrap(removePanelRef.current, {
      initialFocus: cancelRemoveRef.current,
      onEscape: () => setRemoveRecordKey(''),
    });
  }, [Boolean(removeRecordKey)]);

  useEffect(() => {
    if (!statusChangeRecordKey) return;
    return activateModalFocusTrap(statusPanelRef.current, {
      initialFocus: cancelStatusRef.current,
      onEscape: () => setStatusChangeRecordKey(''),
    });
  }, [Boolean(statusChangeRecordKey)]);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(0, Math.ceil(filteredUserCount(users, search, roleFilter, statusFilter) / 10) - 1)));
  }, [users, search, roleFilter, statusFilter]);

  const previewUser = users.find(user => user.recordKey === previewRecordKey) || null;
  const profileUser = users.find(user => user.recordKey === profileRecordKey) || null;
  const removeUser = users.find(user => user.recordKey === removeRecordKey) || null;
  const statusChangeUser = users.find(user => user.recordKey === statusChangeRecordKey) || null;
  const previewDesignations = draft?.departmentId
    ? designations.filter(item => item.department_id === draft.departmentId)
    : [];

  useEffect(() => {
    if (!previewUser) return;
    setLeaveFromDate(previewUser.previewLeaveDraft?.fromDate || '');
    setLeaveToDate(previewUser.previewLeaveDraft?.toDate || '');
    setLeaveReason(previewUser.previewLeaveDraft?.reason || '');
    setLeaveError('');
    setLeaveNotice('');
  }, [previewUser?.recordKey]);
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(user => (
      (!term || [user.fullName, user.email, user.userId, user.employeeNumber, user.department, user.designation]
        .some(value => value.toLowerCase().includes(term)))
      && (roleFilter === 'all' || user.role === roleFilter)
      && (statusFilter === 'all' || user.status === statusFilter)
    )).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, search, roleFilter, statusFilter]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice(page * pageSize, (page + 1) * pageSize);
  const activeCount = users.filter(user => user.status === 'active').length;

  function closeForm() {
    setFormMode(null);
    setDraft(null);
    setGeneratedDraft(false);
    setError('');
  }

  function allPreviewUsers(): SyntheticPreviewUser[] | null {
    try { return readAllSyntheticPreviewUsers(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('Preview records could not be read. Clear the browser preview storage and retry.'));
      return null;
    }
  }

  function saveUsers(nextUsers: SyntheticPreviewUser[], success: string): boolean {
    try {
      writeSyntheticPreviewUsers(tenantId, nextUsers);
      setUsers(nextUsers);
      setLoadError('');
      setError('');
      setNotice(tx(success));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('The preview change could not be saved. Check browser storage and retry.'));
      return false;
    }
  }

  function openManualCreate() {
    setError('');
    setNotice('');
    const allUsers = allPreviewUsers();
    if (!allUsers) return;
    setDraft(createManualSyntheticPreviewDraft(tenantId, tenantName, allUsers));
    setGeneratedDraft(false);
    setFormMode('create');
  }

  function openGeneratedCreate() {
    setError('');
    setNotice('');
    const allUsers = allPreviewUsers();
    if (!allUsers) return;
    setDraft(createSyntheticPreviewDraft(tenantId, tenantName, allUsers));
    setGeneratedDraft(true);
    setFormMode('create');
  }

  function openEdit(user: SyntheticPreviewUser) {
    setError('');
    setNotice('');
    const { createdAt: _createdAt, completedPreviewActions: _actions, previewLeaveDraft: _leaveDraft, ...editable } = user;
    setDraft(editable);
    setGeneratedDraft(false);
    setFormMode('edit');
  }

  function regenerateDraft() {
    const current = draft;
    if (!current) return;
    const allUsers = allPreviewUsers();
    if (!allUsers) return;
    const generated = createSyntheticPreviewDraft(tenantId, tenantName, allUsers, current.role);
    setDraft({ ...generated, departmentId: current.departmentId ?? null, designationId: current.designationId ?? null,
      department: current.department, designation: current.designation, status: current.status });
    setGeneratedDraft(true);
    setError('');
  }

  function updateDraft<K extends keyof SyntheticPreviewUserDraft>(key: K, value: SyntheticPreviewUserDraft[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current);
  }

  function selectDepartment(departmentId: string) {
    const department = departments.find(item => item.id === departmentId);
    setDraft(current => current ? {
      ...current,
      departmentId: department?.id || null,
      department: department?.name || '',
      designationId: null,
      designation: '',
    } : current);
  }

  function selectDesignation(designationId: string) {
    const designation = previewDesignations.find(item => item.id === designationId);
    setDraft(current => current ? {
      ...current,
      designationId: designation?.id || null,
      designation: designation?.title || '',
    } : current);
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !formMode) return;
    const allUsers = allPreviewUsers();
    if (!allUsers) return;
    if (referenceError) { setError(tx('Organization references are unavailable. Retry loading references.')); return; }
    if (!draft.departmentId || !departments.some(item => item.id === draft.departmentId)) {
      setError(tx('Choose a department from this organization.'));
      return;
    }
    const selectedDepartmentDesignations = designations.filter(item => item.department_id === draft.departmentId);
    if (selectedDepartmentDesignations.length > 0
      && (!draft.designationId || !selectedDepartmentDesignations.some(item => item.id === draft.designationId))) {
      setError(tx('Choose a designation for the selected department.'));
      return;
    }
    const validation = validateSyntheticPreviewDraft(draft, allUsers);
    if (validation) {
      setError(tx(validation));
      return;
    }
    if (formMode === 'edit') {
      const original = users.find(user => user.recordKey === draft.recordKey);
      if (!original) { setError(tx('This preview user no longer exists. Refresh the list and try again.')); return; }
      const updated: SyntheticPreviewUser = {
        ...original,
        ...draft,
        fullName: draft.fullName.trim(),
        email: draft.email.trim().toLowerCase(),
        userId: draft.userId.trim().toUpperCase(),
        employeeNumber: draft.employeeNumber.trim().toUpperCase(),
        department: draft.department.trim(),
        designation: draft.designation.trim(),
      };
      if (saveUsers(users.map(user => user.recordKey === updated.recordKey ? updated : user), 'Preview user details saved in this browser.')) closeForm();
      return;
    }
    const created = materializeSyntheticPreviewUser(draft);
    if (saveUsers([created, ...users], 'Preview user created in this browser.')) {
      setPage(0);
      closeForm();
    }
  }

  function saveEmployeeLeaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previewUser) return;
    if (!leaveFromDate || !leaveToDate || !leaveReason.trim()) {
      setLeaveError(tx('Enter a valid date range and a reason.'));
      setLeaveNotice('');
      return;
    }
    if (leaveToDate < leaveFromDate) {
      setLeaveError(tx('The end date must be on or after the start date.'));
      setLeaveNotice('');
      return;
    }
    const updated: SyntheticPreviewUser = {
      ...previewUser,
      previewLeaveDraft: {
        fromDate: leaveFromDate,
        toDate: leaveToDate,
        reason: leaveReason.trim(),
        savedAt: new Date().toISOString(),
        status: 'draft',
      },
    };
    const next = users.map(user => user.recordKey === updated.recordKey ? updated : user);
    if (saveUsers(next, 'Draft saved in this browser; no SQL request was created.')) {
      setLeaveError('');
      setLeaveNotice(tx('Draft saved in this browser; no SQL request was created.'));
    }
  }

  function toggleStatus(user: SyntheticPreviewUser) {
    const nextStatus: PreviewUserStatus = user.status === 'active' ? 'inactive' : 'active';
    const next = users.map(row => row.recordKey === user.recordKey ? { ...row, status: nextStatus } : row);
    if (saveUsers(next, nextStatus === 'active' ? 'Preview user activated.' : 'Preview user deactivated.')) {
      if (nextStatus === 'inactive' && previewRecordKey === user.recordKey) setPreviewRecordKey('');
      setStatusChangeRecordKey('');
    }
  }

  function removeSyntheticUser() {
    if (!removeUser) return;
    const next = users.filter(user => user.recordKey !== removeUser.recordKey);
    if (saveUsers(next, 'Synthetic preview user removed from this browser.')) {
      setRemoveRecordKey('');
      if (previewRecordKey === removeUser.recordKey) setPreviewRecordKey('');
      if (profileRecordKey === removeUser.recordKey) setProfileRecordKey('');
    }
  }

  function completePreviewAction(user: SyntheticPreviewUser, actionId: string) {
    if (user.completedPreviewActions.includes(actionId)) return;
    const updated = { ...user, completedPreviewActions: [...user.completedPreviewActions, actionId] };
    saveUsers(users.map(row => row.recordKey === user.recordKey ? updated : row), 'Sample action saved in preview data. No production record was changed.');
  }

  if (previewUser) {
    const completed = new Set(previewUser.completedPreviewActions);
    const actions = workspaceActions[previewUser.role];
    return <section className="mx-auto w-full max-w-[1386px] space-y-5" aria-labelledby="preview-workspace-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={buttonClass} onClick={() => { setPreviewRecordKey(''); setActiveModule(''); }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{tx('Back to User Management')}
        </button>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />{tx('Synthetic preview only')}
        </span>
      </div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-semibold">{tx('Viewing as')} {previewUser.fullName} · {tx(previewUser.role)}</p>
        <p className="mt-1">{tx('This does not switch accounts, create an authenticated session, or read/write production records. Preview actions stay in this browser.')}</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-brand-primary)]">{previewUser.tenantName}</p>
            <h1 id="preview-workspace-heading" className="mt-1 text-2xl font-semibold text-slate-900">{tx(workspaceModules[previewUser.role][0])}</h1>
            <p className="mt-2 text-sm text-slate-600">{previewUser.fullName} · {tx(previewUser.role)} · {previewUser.employeeNumber}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold capitalize text-emerald-800">{tx('Active in preview')}</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workspaceModules[previewUser.role].map((module, index) => (
            <button key={module} type="button" onClick={() => setActiveModule(module)} aria-pressed={activeModule === module}
              className={`min-h-24 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] ${activeModule === module ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-light)]' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><BriefcaseBusiness className="h-4 w-4 text-[var(--color-brand-primary)]" aria-hidden="true" />{tx(module)}</span>
              <span className="mt-2 block text-xs text-slate-500">{index === 0 ? tx('Role overview') : tx('Sample workspace section')}</span>
            </button>
          ))}
        </div>
        {previewUser.role === 'Employee' ? (
          <div className="mt-5" aria-live="polite">
            {activeModule === 'My profile' ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="synthetic-employee-profile-heading">
                <h2 id="synthetic-employee-profile-heading" className="text-lg font-semibold text-slate-900">{tx('My profile')}</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[[tx('Full name'), previewUser.fullName], [tx('Synthetic email'), previewUser.email], [tx('User ID'), previewUser.userId],
                    [tx('Employee number'), previewUser.employeeNumber], [tx('Department'), previewUser.department],
                    [tx('Designation'), previewUser.designation || tx('Not set')]].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd></div>
                  ))}
                </dl>
              </section>
            ) : activeModule === 'Leave and balances' ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="synthetic-leave-preview-heading">
                <h2 id="synthetic-leave-preview-heading" className="text-lg font-semibold text-slate-900">{tx('Leave request preview')}</h2>
                <p className="mt-1 text-sm text-slate-600">{tx('This is a local preview draft; no policy or balance was checked and no request was submitted.')}</p>
                {leaveError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{leaveError}</p>}
                {leaveNotice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{leaveNotice}</p>}
                <form onSubmit={saveEmployeeLeaveDraft} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">{tx('From date')}<input required type="date" value={leaveFromDate} onChange={event => setLeaveFromDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
                  <label className="block text-sm font-medium text-slate-700">{tx('To date')}<input required type="date" value={leaveToDate} onChange={event => setLeaveToDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">{tx('Reason')}<textarea required maxLength={500} value={leaveReason} onChange={event => setLeaveReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
                  <div className="sm:col-span-2"><button type="submit" className={primaryButtonClass}>{tx('Save preview draft')}</button></div>
                </form>
                {previewUser.previewLeaveDraft && <dl className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs font-medium text-slate-600">{tx('Saved preview draft')} · {tx('Draft')}</dt>
                  <dd className="mt-1 text-sm text-slate-900">{previewUser.previewLeaveDraft.fromDate} – {previewUser.previewLeaveDraft.toDate}</dd>
                  <dd className="mt-1 text-sm text-slate-700">{previewUser.previewLeaveDraft.reason}</dd>
                </dl>}
              </section>
            ) : (
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="synthetic-employee-overview-heading">
                <h2 id="synthetic-employee-overview-heading" className="font-semibold text-slate-900">{tx(activeModule || 'My overview')}</h2>
                <p className="mt-1 text-sm text-slate-600">{tx('Choose a role-specific section above. Sample records here never connect to live SQL.')}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Workspace')}</p><p className="mt-1 text-sm font-medium">{tx(previewUser.role)}</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Department')}</p><p className="mt-1 text-sm font-medium">{previewUser.department || tx('Not set')}</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Preview state')}</p><p className="mt-1 text-sm font-medium">{tx('Browser-only sample')}</p></div>
                </div>
              </section>
            )}
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
              <h2 className="font-semibold text-slate-900">{tx(activeModule || 'Role preview data')}</h2>
              <p className="mt-1 text-sm text-slate-600">{activeModule
                ? tx('Sample section opened. The information below is synthetic preview content only.')
                : tx('Choose a role-specific section above. Sample records here never connect to live SQL.')}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Workspace')}</p><p className="mt-1 text-sm font-medium">{tx(previewUser.role)}</p></div>
                <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Department')}</p><p className="mt-1 text-sm font-medium">{previewUser.department || tx('Not set')}</p></div>
                <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{tx('Preview state')}</p><p className="mt-1 text-sm font-medium">{tx('Browser-only sample')}</p></div>
              </div>
            </div>
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-slate-900">{tx('Sample actions')}</h2>
              <p className="mt-1 text-sm text-slate-600">{tx('Complete a sample step to verify the role preview interaction. It only updates this synthetic preview record.')}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {actions.map(action => {
                  const done = completed.has(action.id);
                  return <div key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                    <span className="text-sm font-medium text-slate-800">{tx(action.label)}</span>
                    <button type="button" disabled={done} onClick={() => completePreviewAction(previewUser, action.id)} className={done ? `${buttonClass} border-emerald-200 bg-emerald-50 text-emerald-800` : primaryButtonClass}>
                      {done ? <><Check className="h-4 w-4" aria-hidden="true" />{tx('Completed in preview')}</> : tx('Complete sample step')}
                    </button>
                  </div>;
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>;
  }

  return <section className="mx-auto w-full max-w-[1386px] space-y-5" aria-labelledby="synthetic-user-heading">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-[var(--color-brand-primary)]">{tx('Admin workspace')}</p>
        <h1 id="synthetic-user-heading" className="mt-1 text-2xl font-semibold text-slate-900">{tx('User Management')}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{tx('Create browser-only synthetic users and inspect their role workspaces without another login.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={referenceLoading || Boolean(referenceError) || departments.length === 0} onClick={openManualCreate} className={buttonClass}><Plus className="h-4 w-4" aria-hidden="true" />{tx('Create user')}</button>
        <button type="button" disabled={referenceLoading || Boolean(referenceError) || departments.length === 0} onClick={openGeneratedCreate} className={primaryButtonClass}><UserRoundPlus className="h-4 w-4" aria-hidden="true" />{tx('Generate Random User')}</button>
      </div>
    </header>

    {referenceLoading && <p role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">{tx('Loading organization references…')}</p>}
    {referenceError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span>{tx('Organization references are unavailable. Retry loading references.')} {referenceError}</span><button type="button" className={buttonClass} onClick={() => setReferenceRetry(value => value + 1)}>{tx('Retry loading references')}</button></div>}
    {!referenceLoading && !referenceError && departments.length === 0 && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{tx('No active departments are configured for this organization.')}</p>}

    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">{tx('Frontend preview data')}</p>
      <p className="mt-1">{tx('Records are stored only in this browser for the selected organization. They do not create auth.users, send email, or persist to production SQL.')}</p>
      <p className="mt-1">{tx('The existing single Super Admin account cannot be generated as a second root account.')}</p>
    </div>

    {(loadError || error) && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{tx(loadError || error)}</p>}
    {notice && !error && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{tx('Selected organization')}</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900"><Building2 className="h-4 w-4 text-[var(--color-brand-primary)]" aria-hidden="true" />{tenantName}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{tx('Synthetic users')}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{users.length}</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{tx('Active in preview')}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{activeCount}</p></div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700" htmlFor="preview-user-search">{tx('Search users')}
          <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:outline-2 focus-within:outline-[var(--color-figma-primary-600)]"><Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><input id="preview-user-search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" placeholder={tx('Search name, email, ID, department')} /></span>
        </label>
        <label className="text-sm font-medium text-slate-700">{tx('Role')}
          <select value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(0); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-56">
            <option value="all">{tx('All roles')}</option>{PREVIEW_USER_ROLES.map(role => <option key={role} value={role}>{tx(role)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">{tx('Status')}
          <select value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(0); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:w-40">
            <option value="all">{tx('All statuses')}</option><option value="active">{tx('Active')}</option><option value="inactive">{tx('Inactive')}</option>
          </select>
        </label>
      </div>
      {loading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-600"><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />{tx('Loading preview users…')}</div>
        : visibleUsers.length === 0 ? <div className="p-8 text-center"><Users className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" /><h2 className="mt-3 font-semibold text-slate-900">{users.length ? tx('No users match these filters') : tx('No synthetic users yet')}</h2><p className="mt-1 text-sm text-slate-600">{users.length ? tx('Change the search or filters and try again.') : tx('Create a preview user or generate one to begin.')}</p></div>
          : <div role="region" aria-label={tx('Scrollable synthetic user list')} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">{tx('User')}</th><th className="px-4 py-3">{tx('Role')}</th><th className="px-4 py-3">{tx('User ID / Employee No.')}</th><th className="px-4 py-3">{tx('Department / Designation')}</th><th className="px-4 py-3">{tx('Status')}</th><th className="px-4 py-3 text-right">{tx('Actions')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map(user => <tr key={user.recordKey} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-4"><p className="font-semibold text-slate-900">{user.fullName}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{user.email}</p></td>
                  <td className="px-4 py-4"><span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900">{tx(user.role)}</span></td>
                  <td className="px-4 py-4"><p className="font-mono text-xs text-slate-800">{user.userId}</p><p className="mt-1 font-mono text-xs text-slate-500">{user.employeeNumber}</p></td>
                  <td className="px-4 py-4"><p className="text-slate-800">{user.department || '—'}</p><p className="mt-1 text-xs text-slate-500">{user.designation || '—'}</p></td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{tx(user.status === 'active' ? 'Active' : 'Inactive')}</span></td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-1.5">
                    <button type="button" className={buttonClass} onClick={() => setProfileRecordKey(user.recordKey)} title={tx('View profile')} aria-label={`${tx('View profile')}: ${user.fullName}`}><Eye className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{tx('View profile')}</span></button>
                    <button type="button" disabled={user.status !== 'active'} className={buttonClass} onClick={() => { setPreviewRecordKey(user.recordKey); setActiveModule(''); }} title={tx('View as User')} aria-label={`${tx('View as User')}: ${user.fullName}`}><BadgeCheck className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{tx('View as User')}</span></button>
                    <button type="button" className={buttonClass} onClick={() => openEdit(user)} title={tx('Edit user')} aria-label={`${tx('Edit user')}: ${user.fullName}`}><Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{tx('Edit user')}</span></button>
                    <button type="button" className={buttonClass} onClick={() => setStatusChangeRecordKey(user.recordKey)} title={tx(user.status === 'active' ? 'Deactivate user' : 'Activate user')} aria-label={`${tx(user.status === 'active' ? 'Deactivate user' : 'Activate user')}: ${user.fullName}`}><ShieldCheck className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{tx(user.status === 'active' ? 'Deactivate user' : 'Activate user')}</span></button>
                    <button type="button" className={buttonClass} onClick={() => setRemoveRecordKey(user.recordKey)} title={tx('Remove synthetic user')} aria-label={`${tx('Remove synthetic user')}: ${user.fullName}`}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{tx('Remove synthetic user')}</span></button>
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
        <span>{filteredUsers.length ? txf(tx('Showing {start}–{end} of {count}'), { start: String(page * pageSize + 1), end: String(Math.min((page + 1) * pageSize, filteredUsers.length)), count: String(filteredUsers.length) }) : tx('0 users')}</span>
        <div className="flex items-center gap-2"><button type="button" disabled={page === 0} className={buttonClass} onClick={() => setPage(value => Math.max(0, value - 1))}>{tx('Previous')}</button><span>{page + 1} / {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} className={buttonClass} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>{tx('Next')}</button></div>
      </footer>
    </div>

    {formMode && draft && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 sm:justify-end" onMouseDown={event => { if (event.target === event.currentTarget) closeForm(); }}>
      <section ref={formPanelRef} role="dialog" aria-modal="true" aria-labelledby="preview-user-form-heading" tabIndex={-1} className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-none">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div><p className="text-sm font-semibold text-[var(--color-brand-primary)]">{tenantName}</p><h2 id="preview-user-form-heading" className="mt-1 text-xl font-semibold text-slate-900">{tx(formMode === 'edit' ? 'Edit preview user' : generatedDraft ? 'Generated user preview' : 'Create preview user')}</h2></div>
          <button ref={formInitialFocusRef} type="button" className={buttonClass} onClick={closeForm} aria-label={tx('Close')}><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <form onSubmit={submitDraft} className="space-y-4 p-5">
          <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">{tx('This form saves synthetic preview data in this browser only. No email is sent and no production account is created.')}</p>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{tx(error)}</p>}
          {generatedDraft && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="text-sm font-medium text-slate-800">{tx('Generated information is editable before saving.')}</span><button type="button" className={buttonClass} onClick={regenerateDraft}><RefreshCw className="h-4 w-4" aria-hidden="true" />{tx('Regenerate')}</button></div>}
          <label className="block text-sm font-medium text-slate-700">{tx('Full name')}<input required minLength={2} maxLength={100} autoComplete="off" value={draft.fullName} onChange={event => updateDraft('fullName', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">{tx('Synthetic email')}<input required type="email" pattern="[^@\s]+@example\.com" title={tx('Use a reserved synthetic address ending in @example.com.')} autoComplete="off" value={draft.email} onChange={event => updateDraft('email', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /><span className="mt-1 block text-xs text-slate-500">{tx('Only reserved @example.com addresses are accepted.')}</span></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">{tx('User ID')}<input required value={draft.userId} onChange={event => updateDraft('userId', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm" /></label>
            <label className="block text-sm font-medium text-slate-700">{tx('Employee number')}<input required value={draft.employeeNumber} onChange={event => updateDraft('employeeNumber', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm" /></label>
            <label className="block text-sm font-medium text-slate-700">{tx('Role')}<select required value={draft.role} onChange={event => updateDraft('role', event.target.value as PreviewUserRole)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{PREVIEW_USER_ROLES.map(role => <option key={role} value={role}>{tx(role)}</option>)}</select></label>
            {formMode === 'create'
              ? <label className="block text-sm font-medium text-slate-700">{tx('Status')}<select value={draft.status} onChange={event => updateDraft('status', event.target.value as PreviewUserStatus)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="active">{tx('Active')}</option><option value="inactive">{tx('Inactive')}</option></select></label>
              : <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{tx('Status')}</p><p className="mt-1 text-sm font-semibold text-slate-800">{tx(draft.status === 'active' ? 'Active' : 'Inactive')}</p><p className="mt-1 text-xs text-slate-600">{tx('Change status from the user list; confirmation is required.')}</p></div>}
            <div><label htmlFor="synthetic-department" className="block text-sm font-medium text-slate-700">{tx('Department')}</label><select id="synthetic-department" required value={draft.departmentId ?? ''} onChange={event => selectDepartment(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">{tx('Select a department')}</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!draft.departmentId && draft.department && <p className="mt-1 text-xs text-amber-800">{tx('Choose a department from this organization.')} ({draft.department})</p>}</div>
            {previewDesignations.length > 0
              ? <div><label htmlFor="synthetic-designation" className="block text-sm font-medium text-slate-700">{tx('Designation')}</label><select id="synthetic-designation" required value={draft.designationId ?? ''} onChange={event => selectDesignation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">{tx('Select a designation')}</option>{previewDesignations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
              : <div><label htmlFor="synthetic-designation" className="block text-sm font-medium text-slate-700">{tx('Designation')}</label><input id="synthetic-designation" required maxLength={100} value={draft.designation} onChange={event => { updateDraft('designationId', null); updateDraft('designation', event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /><p className="mt-1 text-xs text-slate-500">{tx('Designation is not configured for this department; enter a preview label.')}</p></div>}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{tx('Selected organization')}</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><Building2 className="h-4 w-4 text-[var(--color-brand-primary)]" aria-hidden="true" />{tenantName}</p><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{tenantId}</p></div>
          <p className="text-xs text-slate-600">{tx('Super Admin remains the existing single account and is not available for synthetic generation.')}</p>
          <div className="sticky bottom-0 -mx-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
            <button type="button" className={buttonClass} onClick={closeForm}>{tx('Cancel')}</button><button type="submit" className={primaryButtonClass}><Check className="h-4 w-4" aria-hidden="true" />{tx(formMode === 'edit' ? 'Save changes' : 'Save preview user')}</button>
          </div>
        </form>
      </section>
    </div>}

    {profileUser && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 sm:justify-end" onMouseDown={event => { if (event.target === event.currentTarget) setProfileRecordKey(''); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="synthetic-profile-heading" className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:h-full sm:max-h-none sm:max-w-lg sm:rounded-none">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--color-brand-primary)]">{tx('Synthetic employee profile')}</p><h2 id="synthetic-profile-heading" className="mt-1 text-xl font-semibold text-slate-900">{profileUser.fullName}</h2></div><button type="button" className={buttonClass} onClick={() => setProfileRecordKey('')} aria-label={tx('Close')}><X className="h-4 w-4" aria-hidden="true" /></button></div>
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{tx('This associated employee profile is synthetic preview data and is not loaded from SQL.')}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">{[
          [tx('Email'), profileUser.email], [tx('User ID'), profileUser.userId], [tx('Employee number'), profileUser.employeeNumber],
          [tx('Role'), tx(profileUser.role)], [tx('Department'), profileUser.department || tx('Not set')],
          [tx('Designation'), profileUser.designation || tx('Not set')], [tx('Status'), tx(profileUser.status === 'active' ? 'Active' : 'Inactive')], [tx('Organization'), profileUser.tenantName],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{value}</dd></div>)}</dl>
        <button type="button" disabled={profileUser.status !== 'active'} className={`${primaryButtonClass} mt-5 w-full`} onClick={() => { setPreviewRecordKey(profileUser.recordKey); setProfileRecordKey(''); }}><Eye className="h-4 w-4" aria-hidden="true" />{tx('View as User')}</button>
      </section>
    </div>}

    {removeUser && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4">
      <section ref={removePanelRef} role="dialog" aria-modal="true" aria-labelledby="remove-preview-user-heading" tabIndex={-1} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 id="remove-preview-user-heading" className="text-lg font-semibold text-slate-900">{tx('Remove synthetic user?')}</h2>
        <p className="mt-2 text-sm text-slate-600">{txf(tx('Remove {name} and its preview-only actions from this browser?'), { name: removeUser.fullName })}</p>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelRemoveRef} type="button" className={buttonClass} onClick={() => setRemoveRecordKey('')}>{tx('Cancel')}</button><button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800" onClick={removeSyntheticUser}><Trash2 className="h-4 w-4" aria-hidden="true" />{tx('Remove')}</button></div>
      </section>
    </div>}

    {statusChangeUser && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-4">
      <section ref={statusPanelRef} role="dialog" aria-modal="true" aria-labelledby="preview-status-change-heading" tabIndex={-1} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 id="preview-status-change-heading" className="text-lg font-semibold text-slate-900">{tx(statusChangeUser.status === 'active' ? 'Deactivate preview user?' : 'Activate preview user?')}</h2>
        <p className="mt-2 text-sm text-slate-600">{txf(tx(statusChangeUser.status === 'active' ? 'Deactivate {name} in this organization’s browser-only preview?' : 'Activate {name} in this organization’s browser-only preview?'), { name: statusChangeUser.fullName })}</p>
        <div className="mt-5 flex justify-end gap-2"><button ref={cancelStatusRef} type="button" className={buttonClass} onClick={() => setStatusChangeRecordKey('')}>{tx('Cancel')}</button><button type="button" className={primaryButtonClass} onClick={() => toggleStatus(statusChangeUser)}>{tx(statusChangeUser.status === 'active' ? 'Deactivate user' : 'Activate user')}</button></div>
      </section>
    </div>}
  </section>;
}

function txf(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), template);
}

function filteredUserCount(users: SyntheticPreviewUser[], search: string, roleFilter: string, statusFilter: string): number {
  const term = search.trim().toLowerCase();
  return users.filter(user => (
    (!term || [user.fullName, user.email, user.userId, user.employeeNumber, user.department, user.designation]
      .some(value => value.toLowerCase().includes(term)))
    && (roleFilter === 'all' || user.role === roleFilter)
    && (statusFilter === 'all' || user.status === statusFilter)
  )).length;
}
