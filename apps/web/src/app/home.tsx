export default function HomePage() {
  return (
    <div style={container}>
      <div style={card}>
        <img src="/logo.png" alt="SignChain" style={{ height: 48, marginBottom: 16 }} />
        <p style={{ color: '#666', fontSize: 16, marginBottom: 24 }}>
          Blockchain-anchored document signing
        </p>
        <p style={{ color: '#999', fontSize: 14 }}>
          Scan a QR code on a signed document to verify its authenticity.
        </p>
      </div>
    </div>
  );
}

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
  padding: 40,
  maxWidth: 440,
  width: '100%',
  textAlign: 'center',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};
