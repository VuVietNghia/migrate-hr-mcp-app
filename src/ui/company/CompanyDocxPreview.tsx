import { useEffect, useRef, useState } from 'react';
import { StudioInlineState } from '../studio/StudioPrimitives';

interface CompanyDocxPreviewProps {
  blob: Blob;
}

export function CompanyDocxPreview({ blob }: CompanyDocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    container.replaceChildren();
    setStatus('loading');

    void import('docx-preview')
      .then(({ renderAsync }) => renderAsync(blob, container, undefined, {
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        useBase64URL: true,
      }))
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [blob]);

  return (
    <div className='company-docx-preview'>
      {status === 'loading' ? <StudioInlineState tone='info'>Đang dựng bản xem trước Word...</StudioInlineState> : null}
      {status === 'error' ? <StudioInlineState tone='danger'>Không thể dựng nội dung DOCX này. Bạn vẫn có thể tải tệp xuống.</StudioInlineState> : null}
      <div
        ref={containerRef}
        className='company-docx-preview__canvas'
        aria-label='Nội dung tài liệu Word'
        hidden={status === 'error'}
      />
    </div>
  );
}
