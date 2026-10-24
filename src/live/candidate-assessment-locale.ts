import type { Locale } from './project-locale';

const bengali: Record<string, string> = {
  'Assessment assigned. The candidate can submit it from Tasks & qualifications.': 'মূল্যায়ন বরাদ্দ হয়েছে। প্রার্থী Tasks & qualifications থেকে জমা দিতে পারবেন।',
  'Assign assessment': 'মূল্যায়ন বরাদ্দ করুন',
  'Assessment title': 'মূল্যায়নের শিরোনাম',
  'Assessment type': 'মূল্যায়নের ধরন',
  'Assessment instructions': 'মূল্যায়নের নির্দেশনা',
  'Candidate instructions': 'প্রার্থীর জন্য নির্দেশনা',
  'Due date': 'শেষ তারিখ',
  'e.g. Technical': 'যেমন: প্রযুক্তিগত',
  'This application is not available in the selected organization.': 'নির্বাচিত প্রতিষ্ঠানে এই আবেদনটি পাওয়া যায়নি।',
  'An assessment cannot be assigned to a closed application.': 'বন্ধ আবেদনে মূল্যায়ন বরাদ্দ করা যাবে না।',
  'The assessment could not be assigned. Check the details and recruitment access, then retry.': 'মূল্যায়ন বরাদ্দ করা যায়নি। তথ্য ও নিয়োগ ব্যবস্থাপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।',
  'Assigning…': 'বরাদ্দ হচ্ছে…',
  'Assign to candidate': 'প্রার্থীকে বরাদ্দ করুন',
  'Candidate assessments': 'প্রার্থীর মূল্যায়ন',
  'Assignments, candidate work and review status for this organization.': 'এই প্রতিষ্ঠানের মূল্যায়ন, প্রার্থীর কাজ এবং পর্যালোচনার অবস্থা।',
  'Refresh candidate assessments': 'প্রার্থীর মূল্যায়ন রিফ্রেশ করুন',
  'Refresh': 'রিফ্রেশ',
  'Retry': 'আবার চেষ্টা করুন',
  'Candidate assessments could not be loaded. Check recruitment management access and retry.': 'প্রার্থীর মূল্যায়ন লোড করা যায়নি। নিয়োগ ব্যবস্থাপনার অনুমতি যাচাই করে আবার চেষ্টা করুন।',
  'The review status could not be saved. Your note is kept here; retry or refresh the assessment list.': 'পর্যালোচনার অবস্থা সংরক্ষণ করা যায়নি। আপনার নোট এখানেই রাখা হয়েছে; আবার চেষ্টা করুন অথবা তালিকা রিফ্রেশ করুন।',
  'Awaiting candidate work': 'প্রার্থীর কাজের অপেক্ষায়',
  'Submitted for review': 'পর্যালোচনার জন্য জমা হয়েছে',
  'Review complete': 'পর্যালোচনা সম্পন্ন',
  'Loading candidate assessments…': 'প্রার্থীর মূল্যায়ন লোড হচ্ছে…',
  'No candidate assessments have been assigned.': 'কোনো প্রার্থীর মূল্যায়ন বরাদ্দ করা হয়নি।',
  'Candidate submission': 'প্রার্থীর জমা',
  'Open candidate submission link': 'প্রার্থীর জমার লিংক খুলুন',
  'Review submission': 'জমা পর্যালোচনা করুন',
  'Internal review note': 'অভ্যন্তরীণ পর্যালোচনা নোট',
  'optional': 'ঐচ্ছিক',
  'This note is visible only to authorized recruitment staff.': 'এই নোটটি শুধু অনুমোদিত নিয়োগ কর্মীরা দেখতে পাবেন।',
  'Visible only to authorized recruitment staff.': 'শুধু অনুমোদিত নিয়োগ কর্মীরা দেখতে পাবেন।',
  'Cancel': 'বাতিল',
  'Saving review…': 'পর্যালোচনা সংরক্ষণ হচ্ছে…',
  'Mark review complete': 'পর্যালোচনা সম্পন্ন হিসেবে চিহ্নিত করুন',
  'Reviewed': 'পর্যালোচনা হয়েছে',
};

export function candidateAssessmentText(locale: Locale, english: string): string {
  return locale === 'bn' ? (bengali[english] || english) : english;
}
