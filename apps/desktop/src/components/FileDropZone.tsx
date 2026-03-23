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
        className={[
          'flex flex-1 flex-col items-center justify-center',
          'rounded-xl p-8 min-h-[200px]',
          'transition-all duration-150 ease-in-out',
          isHovering
            ? 'border-2 border-solid border-brand-700 bg-brand-50 scale-[1.02]'
            : 'border-2 border-dashed border-gray-300 bg-gray-50 scale-100',
          disabled ? 'cursor-default opacity-50' : 'cursor-pointer opacity-100',
        ].join(' ')}
      >
        <span
          className={[
            'text-[40px] mb-3 transition-[filter] duration-150 ease-in-out',
            isHovering ? 'grayscale-0' : 'grayscale-[0.3]',
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={[
            'text-lg font-semibold mb-2',
            isHovering ? 'text-brand-700' : 'text-gray-900',
          ].join(' ')}
        >
          {title}
        </span>
        <span className="text-sm text-gray-500 text-center max-w-[220px] leading-snug">
          {description}
        </span>
        <span className="text-xs text-gray-400 mt-3">
          or click to browse
        </span>
      </div>
    );
  },
);

FileDropZone.displayName = 'FileDropZone';

export default FileDropZone;
