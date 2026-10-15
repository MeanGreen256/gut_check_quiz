'use client';
import { useEffect, useRef, useState } from 'react';
export type ContactNotice = { noticeVersion: string; disclosure: string; privacyUrl: string } | null;
export function CaptureNotice({ notice }: { notice: ContactNotice }) {
  return notice ? <div id="central-capture-notice" style={{ margin: '16px 0', fontSize: '0.9rem' }}><p>{notice.disclosure}</p><p>This access record does not verify email ownership or enroll you in a newsletter. Any newsletter signup is handled separately. <a href={notice.privacyUrl} target="_blank" rel="noopener noreferrer" style={{textDecoration:'underline'}}>Privacy information (opens in a new tab)</a></p></div> : null;
}
export function useContactCapture(notice: ContactNotice) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true), controller = useRef<AbortController | null>(null);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  async function capture(email: string): Promise<boolean> {
    if (!notice) return true;
    if (lock.current) return false;
    lock.current = true; setPending(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const fingerprint = JSON.stringify([email.trim(), notice.noticeVersion]);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
      const result = await Promise.race([
        (async () => {
          const response = await fetch('/api/contact-capture', { method: 'POST', cache: 'no-store', credentials: 'same-origin', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), requestId: attempt.current!.requestId, noticeVersion: notice.noticeVersion }) });
          const data = await response.json();
          if (!response.ok || data.captured !== true) throw new Error(data.error || 'We could not confirm your email was saved. Please try again.');
          return true;
        })(),
        new Promise<boolean>((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error('The request timed out. Please try again.')); }, 12000); }),
      ]);
      if (alive.current && !abort.signal.aborted && result) { attempt.current = null; return true; }
      return false;
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error && reason.name !== 'AbortError' && reason.message !== 'Failed to fetch' ? reason.message : 'Could not connect. Please try again.');
      return false;
    } finally { clearTimeout(timeout); lock.current = false; if (alive.current) setPending(false); }
  }
  return { capture, pending, error };
}
