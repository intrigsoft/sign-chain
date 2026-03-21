import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSigningStore, UserIdentity } from '../../store/signing';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function IdentityPage() {
  const navigate = useNavigate();
  const setUserIdentity = useSigningStore((s) => s.setUserIdentity);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [signerType, setSignerType] = useState<'individual' | 'company'>('individual');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; company?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const next: typeof errors = {};

    if (!trimmedName) next.name = 'Name is required';
    if (!trimmedEmail) next.email = 'Email is required';
    else if (!EMAIL_REGEX.test(trimmedEmail)) next.email = 'Invalid email address';
    if (signerType === 'company' && !company.trim()) next.company = 'Company name is required';

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    const identity: UserIdentity = {
      name: trimmedName,
      email: trimmedEmail,
      signerType,
      ...(signerType === 'company' && company.trim() ? { company: company.trim() } : {}),
      ...(signerType === 'company' && position.trim() ? { position: position.trim() } : {}),
    };

    setUserIdentity(identity);
    navigate('/dashboard');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f9fafb',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 40,
          width: 380,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Sign Chain</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
          Enter your details to get started
        </p>

        {/* Signer type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['individual', 'company'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSignerType(type)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 14,
                border: `1px solid ${signerType === type ? '#2563eb' : '#d1d5db'}`,
                borderRadius: 6,
                background: signerType === type ? '#eff6ff' : '#fff',
                color: signerType === type ? '#2563eb' : '#374151',
                cursor: 'pointer',
                fontWeight: signerType === type ? 600 : 400,
              }}
            >
              {type === 'individual' ? 'Individual' : 'Company'}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 4 }}>
            Full Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="John Doe"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.name ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          {errors.name && (
            <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.name}</span>
          )}
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 4 }}>
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="you@example.com"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${errors.email ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          {errors.email && (
            <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.email}</span>
          )}
        </label>

        {signerType === 'company' && (
          <>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Company Name
              </span>
              <input
                type="text"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setErrors((prev) => ({ ...prev, company: undefined }));
                }}
                placeholder="Acme Inc."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${errors.company ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
              {errors.company && (
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.company}</span>
              )}
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Position (optional)
              </span>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="CEO"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '12px 24px',
            fontSize: 14,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
