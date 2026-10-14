import type { Locale } from './project-locale';

const bengali: Record<string, string> = {
  'Internal panel notes': 'প্যানেলের অভ্যন্তরীণ নোট',
  'Only authorized recruitment staff can view these notes.': 'শুধু অনুমোদিত নিয়োগ কর্মীরা এই নোট দেখতে পারবেন।',
  'No internal panel notes have been recorded.': 'কোনো অভ্যন্তরীণ প্যানেল নোট এখনো যোগ করা হয়নি।',
  'Add panel notes': 'প্যানেল নোট যোগ করুন',
  'Edit panel notes': 'প্যানেল নোট সম্পাদনা করুন',
  'Panel notes': 'প্যানেল নোট',
  'Leave blank and save to clear the existing notes.': 'আগের নোট মুছতে খালি রেখে সংরক্ষণ করুন।',
  'Cancel': 'বাতিল',
  'Save panel notes': 'প্যানেল নোট সংরক্ষণ করুন',
  'Saving notes…': 'নোট সংরক্ষণ হচ্ছে…',
  'Panel notes saved.': 'প্যানেল নোট সংরক্ষিত হয়েছে।',
  'Panel notes could not be saved. Your text is kept here; retry or refresh the interview responses.': 'প্যানেল নোট সংরক্ষণ করা যায়নি। আপনার লেখা এখানেই রাখা হয়েছে; আবার চেষ্টা করুন অথবা সাক্ষাৎকারের উত্তর রিফ্রেশ করুন।',
  'Interview responses could not be loaded. Check recruitment management access and retry.': 'সাক্ষাৎকারের উত্তর লোড করা যায়নি। নিয়োগ ব্যবস্থাপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।',
  'Loading interview responses…': 'সাক্ষাৎকারের উত্তর লোড হচ্ছে…',
  'No interview invitations have been scheduled.': 'কোনো সাক্ষাৎকারের আমন্ত্রণ নির্ধারণ করা হয়নি।',
  'Refresh interview responses': 'সাক্ষাৎকারের উত্তর রিফ্রেশ করুন',
  'Refresh': 'রিফ্রেশ',
  'Retry': 'আবার চেষ্টা করুন',
};

export function candidateInterviewText(locale: Locale, english: string): string {
  return locale === 'bn' ? (bengali[english] || english) : english;
}
