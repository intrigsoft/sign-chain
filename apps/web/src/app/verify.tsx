import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { base64urlDecode, toHex, decryptPayload } from './crypto';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://192.168.8.100:3000/api';

interface AnchorEntry {
  txHash: string;
  compositeHash: string;
  signer: string;
  timestamp: number;
  previousTxHash: string;
}

interface VerifyApiResult extends AnchorEntry {
  chain: AnchorEntry[];
  encryptedPayload?: string;
}

interface SignerPayload {
  d: string; // doc hash
  s: {
    t: string; // signer type
    n: string; // name
    e: string; // email
    c?: string; // company
    p?: string; // position
  };
  ts: number; // unix timestamp
  g?: { la: number; ln: number }; // geo
  salt: string;
}

type Status = 'loading' | 'verified' | 'no-key' | 'error';

interface VerifyState {
  status: Status;
  error?: string;
  apiResult?: VerifyApiResult;
  signerPayload?: SignerPayload;
}

export default function VerifyPage() {
  const { txHashB64 } = useParams<{ txHashB64: string }>();
  const location = useLocation();
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    if (!txHashB64) {
      setState({ status: 'error', error: 'Missing transaction hash in URL' });
      return;
    }

    const fragment = location.hash.slice(1); // strip leading #
    verify(txHashB64, fragment);
  }, [txHashB64, location.hash]);

  async function verify(txB64: string, keyB64: string) {
    try {
      // Decode tx hash from base64url → hex
      const txBytes = base64urlDecode(txB64);
      const txHash = '0x' + toHex(txBytes);

      // Call API
      const res = await fetch(`${API_BASE}/verify/${txHash}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Verification failed: ${text}`);
      }
      const apiResult: VerifyApiResult = await res.json();

      // If we have the key and encrypted payload, decrypt
      if (keyB64 && apiResult.encryptedPayload) {
        const keyBytes = base64urlDecode(keyB64);
        const json = await decryptPayload(keyBytes, apiResult.encryptedPayload);
        const signerPayload: SignerPayload = JSON.parse(json);
        setState({ status: 'verified', apiResult, signerPayload });
      } else {
        // No key in fragment — can only confirm blockchain anchor exists
        setState({ status: 'no-key', apiResult });
      }
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div style={container}>
      <div style={card}>
        <img src="/logo.png" alt="SignChain" style={{ height: 36, marginBottom: 4 }} />
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
          Document Verification
        </p>

        {state.status === 'loading' && <LoadingView />}
        {state.status === 'error' && <ErrorView error={state.error!} />}
        {state.status === 'no-key' && <NoKeyView result={state.apiResult!} />}
        {state.status === 'verified' && (
          <VerifiedView
            result={state.apiResult!}
            payload={state.signerPayload!}
          />
        )}
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={spinner} />
      <p style={{ color: '#666', marginTop: 16, fontSize: 14 }}>
        Verifying on blockchain...
      </p>
    </div>
  );
}

function ErrorView({ error }: { error: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={statusBadge('#fef2f2', '#dc2626')}>Verification Failed</div>
      <p style={{ color: '#666', fontSize: 14, marginTop: 16, wordBreak: 'break-word' }}>
        {error}
      </p>
    </div>
  );
}

function NoKeyView({ result }: { result: VerifyApiResult }) {
  return (
    <div>
      <div style={statusBadge('#fefce8', '#ca8a04')}>Partial Verification</div>
      <p style={{ color: '#666', fontSize: 13, margin: '16px 0' }}>
        This document is anchored on the blockchain, but the decryption key was
        not found in the URL. Signer details cannot be displayed.
      </p>
      <DetailRow label="Transaction" value={result.txHash} mono truncate />
      <DetailRow label="Composite Hash" value={result.compositeHash} mono truncate />
      <DetailRow
        label="Block Time"
        value={new Date(result.timestamp * 1000).toLocaleString()}
      />
      <DetailRow label="Chain Length" value={`${result.chain.length} signature(s)`} />
    </div>
  );
}

function VerifiedView({
  result,
  payload,
}: {
  result: VerifyApiResult;
  payload: SignerPayload;
}) {
  const signerType =
    payload.s.t === 'company' ? 'Company' : 'Individual';

  return (
    <div>
      <div style={statusBadge('#f0fdf4', '#16a34a')}>Verified</div>
      <p style={{ color: '#666', fontSize: 13, margin: '16px 0' }}>
        This document's signature is anchored on the blockchain and the signer
        details have been decrypted successfully.
      </p>

      <SectionTitle>Signer</SectionTitle>
      <DetailRow label="Name" value={payload.s.n} />
      <DetailRow label="Email" value={payload.s.e} />
      <DetailRow label="Type" value={signerType} />
      {payload.s.c && <DetailRow label="Company" value={payload.s.c} />}
      {payload.s.p && <DetailRow label="Position" value={payload.s.p} />}

      <SectionTitle>Document</SectionTitle>
      <DetailRow label="Document Hash" value={payload.d} mono truncate />
      <DetailRow
        label="Signed At"
        value={new Date(payload.ts * 1000).toLocaleString()}
      />
      {payload.g && (
        <DetailRow
          label="Location"
          value={`${payload.g.la.toFixed(4)}, ${payload.g.ln.toFixed(4)}`}
        />
      )}

      <SectionTitle>Blockchain</SectionTitle>
      <DetailRow label="Transaction" value={result.txHash} mono truncate />
      <DetailRow label="Composite Hash" value={result.compositeHash} mono truncate />
      <DetailRow label="Chain Length" value={`${result.chain.length} signature(s)`} />
    </div>
  );
}

// ── UI Helpers ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        margin: '20px 0 8px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </h3>
  );
}

function DetailRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px solid #f3f4f6',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, color: '#666', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: '#111',
          fontFamily: mono ? 'monospace' : 'inherit',
          textAlign: 'right',
          ...(truncate
            ? {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }
            : {}),
        }}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function statusBadge(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '8px 20px',
    background: bg,
    color,
    borderRadius: 20,
    fontWeight: 600,
    fontSize: 15,
  };
}

// ── Styles ──────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#f9fafb',
  padding: 16,
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 32,
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const spinner: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '3px solid #e5e7eb',
  borderTopColor: '#6d28d9',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto',
};
