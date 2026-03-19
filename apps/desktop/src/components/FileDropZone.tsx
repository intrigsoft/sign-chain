import { forwardRef } from 'react';

interface FileDropZoneProps {
  icon: string;
  title: string;
  description: string;
  isHovering: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const FileDropZone = forwardRef<HTMLDivElement, FileDropZoneProps>(
  ({ icon, title, description, isHovering, onClick, disabled }, ref) => {
    return (
      <div
        ref={ref}
        onClick={disabled ? undefined : onClick}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          borderRadius: 12,
          border: isHovering
            ? '2px solid #2563eb'
            : '2px dashed #d1d5db',
          background: isHovering ? '#eff6ff' : '#f9fafb',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 150ms ease',
          transform: isHovering ? 'scale(1.02)' : 'scale(1)',
          minHeight: 200,
        }}
      >
        <span
          style={{
            fontSize: 40,
            marginBottom: 12,
            filter: isHovering ? 'none' : 'grayscale(0.3)',
            transition: 'filter 150ms ease',
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 8,
            color: isHovering ? '#2563eb' : '#111827',
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 14,
            color: '#6b7280',
            textAlign: 'center',
            maxWidth: 220,
            lineHeight: 1.4,
          }}
        >
          {description}
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#9ca3af',
            marginTop: 12,
          }}
        >
          or click to browse
        </span>
      </div>
    );
  },
);

FileDropZone.displayName = 'FileDropZone';

export default FileDropZone;
