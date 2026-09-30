import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { links } from '@/lib/api';
import { useSession } from '@/hooks/queries';
import { Logo } from '@/components/layout/Logo';

const ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on the server yet (GOOGLE_CLIENT_ID / SECRET).',
  google_cancelled: 'Google sign-in was cancelled.',
  google_state_mismatch: 'That sign-in link expired. Please try again.',
  google_failed: 'Google could not verify your account. Please try again.',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function LoginPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const [note, setNote] = useState<string | null>(null);
  const error = params.get('error');

  if (session.data) return <Navigate to="/scheduled" replace />;

  // Email/password is in the design, but this build signs people in with Google only.
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNote('Sign-up happens through Google: click "Login with Google" above and your account is created automatically.');
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-white px-4">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-[340px] rounded-xl border border-line px-8 py-10">
        <h1 className="mb-7 text-center text-[26px] font-semibold tracking-tight">Login</h1>

        {error && (
          <p role="alert" className="mb-4 flex gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="mt-px size-3.5 shrink-0" /> {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
          </p>
        )}

        <Button variant="soft" size="lg" className="w-full text-[13px]" icon={<GoogleMark />} onClick={() => (window.location.href = links.googleLogin)}>
          Login with Google
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted">New here? Continue with Google — your account is created on first sign-in.</p>

        <div className="my-5 flex items-center gap-3 text-[11px] text-muted">
          <span className="h-px flex-1 bg-line" /> or sign up through email <span className="h-px flex-1 bg-line" />
        </div>

        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <Input type="email" placeholder="Email ID" aria-label="Email ID" autoComplete="email" className="h-10" />
          <Input type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" className="h-10" />
          {note && <p className="text-xs text-amber-ink">{note}</p>}
          <Button type="submit" size="lg" className="mt-2 w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
