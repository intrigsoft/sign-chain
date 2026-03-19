import { useNavigate, useParams } from 'react-router-dom';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div style={{ padding: 32 }}>
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          marginBottom: 24,
          color: '#2563eb',
        }}
      >
        &larr; Back
      </button>

      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Document Details</h2>
      <p style={{ color: '#666' }}>Document ID: {id}</p>
      <p style={{ color: '#999', marginTop: 16 }}>
        Document detail view will be implemented when the API backend is ready.
      </p>
    </div>
  );
}
