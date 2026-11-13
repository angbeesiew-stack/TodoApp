'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'Request failed';
    throw new Error(message);
  }
  return result as T;
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/auth/me').then((response) => {
      if (response.ok) router.replace('/');
    }).catch(() => setError('Could not check the current session.'));
  }, [router]);

  async function authenticate(mode: 'register' | 'login') {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        const options = await postJson<PublicKeyCredentialCreationOptionsJSON>('/api/auth/register-options', { username });
        const response = await startRegistration(options);
        await postJson('/api/auth/register-verify', { username, response });
      } else {
        const options = await postJson<PublicKeyCredentialRequestOptionsJSON>('/api/auth/login-options', { username });
        const response = await startAuthentication(options);
        await postJson('/api/auth/login-verify', { username, response });
      }
      router.replace('/');
      router.refresh();
    } catch (reason) {
      const errorName = reason instanceof Error ? reason.name : '';
      setError(errorName === 'NotAllowedError'
        ? 'Passkey prompt was cancelled. You can try again.'
        : reason instanceof Error ? reason.message : 'Passkey authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Todo App</p>
        <h1 className="mt-2 text-2xl font-bold">Sign in with a passkey</h1>
        <p className="mt-2 text-sm text-slate-600">Use your device biometrics, PIN, or a security key.</p>
        <label htmlFor="username" className="mt-6 block text-sm font-medium">Username</label>
        <input
          id="username"
          autoComplete="username webauthn"
          required
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9._-]+"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={busy || !username} onClick={() => void authenticate('login')} className="flex-1 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
            {busy ? 'Working…' : 'Login'}
          </button>
          <button type="button" disabled={busy || !username} onClick={() => void authenticate('register')} className="flex-1 rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50">
            Register
          </button>
        </div>
      </section>
    </main>
  );
}
