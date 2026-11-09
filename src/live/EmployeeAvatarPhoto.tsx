import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';

const PHOTO_BUCKET = 'employee-avatars';
const MAX_BYTES = 2 * 1024 * 1024;
const UUID_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg)$/;

const words = {
  en: {
    change: 'Change photo',
    choose: 'Choose photo file',
    unverified: 'Photo update was accepted but could not be verified. Refresh the profile before trying again.',
    loading: 'Loading photo…',
    saving: 'Saving photo…',
    unavailable: 'Photo editing is not available for this employee yet.',
    invalid: 'Choose a PNG or JPEG image up to 2 MB.',
    failure: 'The photo could not be saved. Your previous photo is unchanged.',
    readError: 'Your saved photo could not be displayed.',
  },
  bn: {
    change: 'ছবি পরিবর্তন',
    choose: 'ছবির ফাইল নির্বাচন করুন',
    unverified: 'ছবির পরিবর্তন গ্রহণ করা হয়েছে, কিন্তু যাচাই করা যায়নি। আবার চেষ্টা করার আগে প্রোফাইল রিফ্রেশ করুন।',
    loading: 'ছবি লোড হচ্ছে…',
    saving: 'ছবি সংরক্ষণ হচ্ছে…',
    unavailable: 'এই কর্মীর ছবি পরিবর্তন করার সুবিধা এখনো চালু নেই।',
    invalid: '২ মেগাবাইটের মধ্যে PNG বা JPEG ছবি নির্বাচন করুন।',
    failure: 'ছবিটি সংরক্ষণ করা যায়নি। আগের ছবিটি অপরিবর্তিত রয়েছে।',
    readError: 'সংরক্ষিত ছবিটি দেখানো যাচ্ছে না।',
  },
};

function belongsToActiveEmployee(path: string, userId: string, tenantId: string) {
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === userId
    && parts[1] === tenantId && UUID_IMAGE_NAME.test(parts[2]);
}

export function EmployeeAvatarPhoto({
  tenantId, locale, label, initials,
}: { tenantId: string; locale: Locale; label: string; initials: string }) {
  const t = words[locale === 'bn' ? 'bn' : 'en'];
  const fileRef = useRef<HTMLInputElement>(null);
  const [revision, setRevision] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPhotoUrl(null);
    setSavedPath(null);
    setEnabled(false);
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const { data: account, error: authError } = await supabase.auth.getUser();
        if (authError || !account.user) throw new Error('Employee sign-in required');
        const userId = account.user.id;
        const { data: path, error: getError } = await supabase.rpc('employee_get_my_avatar_v1', {
          p_tenant_id: tenantId,
        });
        // Fail closed until the matching SQL migration is installed. Do not
        // surface an unrelated profile-wide error or disturb existing actions.
        if (getError) return;
        if (!active) return;
        setEnabled(true);

        if (path === null || path === '') return;
        if (typeof path !== 'string' || !belongsToActiveEmployee(path, userId, tenantId)) {
          setError(t.readError);
          return;
        }
        setSavedPath(path);
        const { data: blob, error: downloadError } = await supabase.storage.from(PHOTO_BUCKET).download(path);
        if (downloadError || !blob) throw new Error('Private avatar retrieval denied');
        objectUrl = URL.createObjectURL(blob);
        if (active) setPhotoUrl(objectUrl);
      } catch {
        if (active) setError(t.unavailable);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, revision, t.readError, t.unavailable]);

  async function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy || !enabled) return;
    setError('');
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > MAX_BYTES) {
      setError(t.invalid);
      return;
    }

    setBusy(true);
    let newPath: string | null = null;
    let committed = false;
    try {
      const { data: account, error: authError } = await supabase.auth.getUser();
      if (authError || !account.user) throw new Error('Employee sign-in required');

      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      newPath = `${account.user.id}/${tenantId}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from(PHOTO_BUCKET).upload(newPath, file, {
        contentType: file.type, cacheControl: '3600', upsert: false,
      });
      if (upload.error) throw upload.error;
      const { data: stored, error: saveError } = await supabase.rpc('employee_set_my_avatar_v1', {
        p_tenant_id: tenantId,
        p_storage_path: newPath,
        p_expected_path: savedPath,
      });
      if (saveError || stored !== newPath) throw saveError || new Error('Photo write not confirmed');
      committed = true;
      const { data: confirmed, error: verifyError } = await supabase.rpc('employee_get_my_avatar_v1', {
        p_tenant_id: tenantId,
      });
      if (verifyError || confirmed !== newPath) throw verifyError || new Error('Photo readback failed');
      // Successful readback is required. Keep the previous private file intact
      // rather than risking destructive cleanup during profile recovery.
      setRevision(value => value + 1);
    } catch {
      if (!committed && newPath) {
        await supabase.storage.from(PHOTO_BUCKET).remove([newPath]);
      }
      setError(committed ? t.unverified : t.failure);
    } finally {
      setBusy(false);
    }
  }

  return <div className="relative h-[203px] w-[203px] max-w-full">
    <div role="img" aria-label={label} className="grid h-full w-full place-items-center rounded-lg bg-[#6FB1E1] p-2">
      {photoUrl
        ? <img src={photoUrl} alt="" aria-hidden="true" className="h-full w-full rounded object-cover" />
        : <span className="grid h-full w-full place-items-center rounded bg-[#EFF7F8] text-4xl font-medium text-[#085587]" aria-hidden="true">{initials}</span>}
    </div>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only"
      tabIndex={-1} aria-label={t.choose} onChange={event => { void changePhoto(event); }} />
    <button type="button" onClick={() => fileRef.current?.click()}
      disabled={!enabled || loading || busy}
      aria-label={loading ? t.loading : busy ? t.saving : t.change}
      className="absolute bottom-2 left-1/2 inline-flex min-h-10 max-w-[calc(100%_-_16px)] -translate-x-1/2 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#085587] bg-white/95 px-3 text-xs font-medium text-[#085587] shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#085587] disabled:cursor-not-allowed disabled:opacity-65">
      <Camera aria-hidden="true" className="h-4 w-4" />
      {busy ? t.saving : t.change}
    </button>
    {error && <p role="alert" className="absolute left-0 right-0 top-full z-10 rounded border border-rose-200 bg-white p-2 text-xs text-rose-800 shadow-sm">{error}</p>}
  </div>;
}
