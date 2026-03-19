import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSigningStore } from '../../store/signing';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function IdentityPage() {
  const navigate = useNavigate();
  const setUserIdentity = useSigningStore((s) => s.setUserIdentity);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const next: typeof errors = {};

    if (!trimmedName) next.name = 'Name is required';
    if (!trimmedEmail) next.email = 'Email is required';
    else if (!EMAIL_REGEX.test(trimmedEmail)) next.email = 'Invalid email address';

    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setUserIdentity({ name: trimmedName, email: trimmedEmail });
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

        <label style={{ display: 'block', marginBottom: 24 }}>
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
