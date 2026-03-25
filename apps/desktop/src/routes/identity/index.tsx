import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../../store/auth';
import { useSigningStore, UserIdentity } from '../../store/signing';
import { api } from '../../lib/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthTab = 'magic-link' | 'oauth';
type MagicLinkStep = 'email' | 'code';

export default function IdentityPage() {
  const navigate = useNavigate();
  const jwt = useAuthStore((s) => s.jwt);
  const user = useAuthStore((s) => s.user);
  const setJwt = useAuthStore((s) => s.setJwt);
  const userIdentity = useSigningStore((s) => s.userIdentity);
  const setUserIdentity = useSigningStore((s) => s.setUserIdentity);

  const [tab, setTab] = useState<AuthTab>('magic-link');
  const [mlStep, setMlStep] = useState<MagicLinkStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Profile step (after auth — collect name/company/position)
  const [showProfile, setShowProfile] = useState(false);
  const [name, setName] = useState('');
  const [signerType, setSignerType] = useState<'individual' | 'company'>('individual');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [profileErrors, setProfileErrors] = useState<{ name?: string; company?: string }>({});

  // If already authenticated with a stored profile, go straight to dashboard
  useEffect(() => {
    if (jwt && userIdentity) {
      navigate('/dashboard', { replace: true });
    }
  }, [jwt, userIdentity, navigate]);

  // If JWT present but no profile, show the profile step
  useEffect(() => {
    if (jwt && user && !userIdentity && !showProfile) {
      setShowProfile(true);
      if (user.name) setName(user.name);
    }
  }, [jwt, user, userIdentity, showProfile]);

  const handleSendMagicLink = async () => {
    const trimmed = email.trim();
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/magic-link', { email: trimmed });
      setMlStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string }>('/api/auth/magic-link/verify', { code });
      await invoke('store_jwt', { token: res.token });
      setJwt(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: string) => {
    try {
      await invoke('open_auth_browser', { provider });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open browser');
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const next: typeof profileErrors = {};

    if (!trimmedName) next.name = 'Name is required';
    if (signerType === 'company' && !company.trim()) next.company = 'Company name is required';

    if (Object.keys(next).length) {
      setProfileErrors(next);
      return;
    }

    const identity: UserIdentity = {
      name: trimmedName,
      email: user!.email,
      signerType,
      ...(signerType === 'company' && company.trim() ? { company: company.trim() } : {}),
      ...(signerType === 'company' && position.trim() ? { position: position.trim() } : {}),
    };

    // Persist profile in keychain so it survives app restarts
    await invoke('store_profile', { json: JSON.stringify(identity) }).catch(() => {});

    setUserIdentity(identity);
    navigate('/dashboard');
  };

  // ── Profile step (after auth) ───────────────────────────────────
  if (showProfile) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <form
          onSubmit={handleProfileSubmit}
          className="bg-white rounded-xl p-10 w-[380px] shadow-sm"
        >
          <img src="/logo.png" alt="SignChain" className="mx-auto block h-8 mb-1" />
          <p className="text-gray-500 text-sm mb-6 text-center">
            Complete your profile
          </p>

          <div className="flex gap-2 mb-4">
            {(['individual', 'company'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSignerType(type)}
                className={`flex-1 py-2 px-3 text-sm rounded-md border cursor-pointer ${
                  signerType === type
                    ? 'border-brand-700 bg-brand-50 text-brand-700 font-semibold'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                {type === 'individual' ? 'Individual' : 'Company'}
              </button>
            ))}
          </div>

          <label className="block mb-4">
            <span className="text-sm font-medium block mb-1">Full Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setProfileErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="John Doe"
              className={`w-full py-2 px-3 border rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 ${
                profileErrors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {profileErrors.name && (
              <span className="text-red-500 text-xs">{profileErrors.name}</span>
            )}
          </label>

          {signerType === 'company' && (
            <>
              <label className="block mb-4">
                <span className="text-sm font-medium block mb-1">Company Name</span>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setProfileErrors((prev) => ({ ...prev, company: undefined }));
                  }}
                  placeholder="Acme Inc."
                  className={`w-full py-2 px-3 border rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 ${
                    profileErrors.company ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {profileErrors.company && (
                  <span className="text-red-500 text-xs">{profileErrors.company}</span>
                )}
              </label>

              <label className="block mb-4">
                <span className="text-sm font-medium block mb-1">Position (optional)</span>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="CEO"
                  className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50"
                />
              </label>
            </>
          )}

          <button
            type="submit"
            className="w-full py-3 px-6 text-sm bg-brand-700 hover:bg-brand-800 text-white border-none rounded-lg cursor-pointer"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  // ── Login step ──────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="bg-white rounded-xl p-10 w-[380px] shadow-sm">
        <img src="/logo.png" alt="SignChain" className="mx-auto block h-8 mb-1" />
        <p className="text-gray-500 text-sm mb-6 text-center">
          Sign in to get started
        </p>

        {/* Tab toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setTab('magic-link')}
            className={`flex-1 py-2 px-3 text-sm rounded-md border cursor-pointer ${
              tab === 'magic-link'
                ? 'border-brand-700 bg-brand-50 text-brand-700 font-semibold'
                : 'border-gray-300 bg-white text-gray-700'
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setTab('oauth')}
            className={`flex-1 py-2 px-3 text-sm rounded-md border cursor-pointer ${
              tab === 'oauth'
                ? 'border-brand-700 bg-brand-50 text-brand-700 font-semibold'
                : 'border-gray-300 bg-white text-gray-700'
            }`}
          >
            Social
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
            {error}
          </div>
        )}

        {tab === 'magic-link' && mlStep === 'email' && (
          <>
            <label className="block mb-4">
              <span className="text-sm font-medium block mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="you@example.com"
                className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50"
                onKeyDown={(e) => e.key === 'Enter' && handleSendMagicLink()}
              />
            </label>
            <button
              type="button"
              onClick={handleSendMagicLink}
              disabled={loading}
              className="w-full py-3 px-6 text-sm bg-brand-700 hover:bg-brand-800 text-white border-none rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send login code'}
            </button>
          </>
        )}

        {tab === 'magic-link' && mlStep === 'code' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <label className="block mb-4">
              <span className="text-sm font-medium block mb-1">Code</span>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="000000"
                maxLength={6}
                className="w-full py-2 px-3 border border-gray-300 rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 text-center tracking-[0.3em] text-lg"
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
              />
            </label>
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={loading}
              className="w-full py-3 px-6 text-sm bg-brand-700 hover:bg-brand-800 text-white border-none rounded-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMlStep('email');
                setCode('');
                setError('');
              }}
              className="w-full mt-2 py-2 text-sm text-gray-500 bg-transparent border-none cursor-pointer hover:text-gray-700"
            >
              Use a different email
            </button>
          </>
        )}

        {tab === 'oauth' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full py-3 px-6 text-sm bg-white border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('microsoft')}
              className="w-full py-3 px-6 text-sm bg-white border border-gray-300 rounded-lg cursor-pointer flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <svg width="18" height="18" viewBox="0 0 23 23">
                <rect fill="#f25022" x="1" y="1" width="10" height="10"/>
                <rect fill="#00a4ef" x="1" y="12" width="10" height="10"/>
                <rect fill="#7fba00" x="12" y="1" width="10" height="10"/>
                <rect fill="#ffb900" x="12" y="12" width="10" height="10"/>
              </svg>
              Continue with Microsoft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
