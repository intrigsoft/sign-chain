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
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-10 w-[380px] shadow-sm"
      >
        <img
          src="/logo.png"
          alt="SignChain"
          className="mx-auto block h-8 mb-1"
        />
        <p className="text-gray-500 text-sm mb-6 text-center">
          Enter your details to get started
        </p>

        {/* Signer type toggle */}
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
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="John Doe"
            className={`w-full py-2 px-3 border rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.name && (
            <span className="text-red-500 text-xs">{errors.name}</span>
          )}
        </label>

        <label className="block mb-4">
          <span className="text-sm font-medium block mb-1">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="you@example.com"
            className={`w-full py-2 px-3 border rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <span className="text-red-500 text-xs">{errors.email}</span>
          )}
        </label>

        {signerType === 'company' && (
          <>
            <label className="block mb-4">
              <span className="text-sm font-medium block mb-1">
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
                className={`w-full py-2 px-3 border rounded-md text-sm box-border focus:outline-none focus:ring-2 focus:border-brand-700 focus:ring-brand-50 ${
                  errors.company ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.company && (
                <span className="text-red-500 text-xs">{errors.company}</span>
              )}
            </label>

            <label className="block mb-4">
              <span className="text-sm font-medium block mb-1">
                Position (optional)
              </span>
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
