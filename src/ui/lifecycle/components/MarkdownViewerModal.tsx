import { useState, useEffect } from 'react';

interface MarkdownViewerModalProps {
  url: string;
  title?: string;
  onClose: () => void;
}

export function MarkdownViewerModal({ url, title, onClose }: MarkdownViewerModalProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchMarkdown = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Lỗi khi tải file: ${res.statusText}`);
        }
        const text = await res.text();
        if (isMounted) {
          setContent(text);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Không thể tải nội dung Markdown');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (url) {
      fetchMarkdown();
    }

    return () => {
      isMounted = false;
    };
  }, [url]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div 
        style={{
          background: 'white', borderRadius: '8px', 
          width: '100%', maxWidth: '800px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #eaeaea',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f9fafb'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
            {title || 'Chi tiết hồ sơ (Markdown)'}
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', fontSize: '1.5rem',
              cursor: 'pointer', color: '#6b7280', lineHeight: 1
            }}
          >
            &times;
          </button>
        </div>
        
        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, backgroundColor: '#ffffff' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
              <div className="spinner"></div>
              <p style={{ marginTop: '16px', color: '#6b7280' }}>Đang tải nội dung...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', color: '#ef4444', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px' }}>
              ⚠️ {error}
            </div>
          ) : (
            <div 
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                lineHeight: 1.6,
                color: '#1f2937',
                fontSize: '0.95rem'
              }}
            >
              {/* Very basic manual Markdown rendering for headers, bold, lists */}
              {content.split('\n').map((line, idx) => {
                if (line.startsWith('# ')) return <h1 key={idx} style={{ marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid #eaeaea', paddingBottom: '8px', fontSize: '1.5rem', color: 'black' }}>{line.substring(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={idx} style={{ marginTop: '16px', marginBottom: '8px', fontSize: '1.25rem', color: 'black' }}>{line.substring(3)}</h2>;
                if (line.startsWith('- ')) return <li key={idx} style={{ marginLeft: '16px', marginBottom: '4px' }}>{parseInline(line.substring(2))}</li>;
                if (line.trim() === '') return <br key={idx} />;
                return <p key={idx} style={{ margin: '4px 0' }}>{parseInline(line)}</p>;
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #eaeaea',
          display: 'flex', justifyContent: 'flex-end', background: '#f9fafb'
        }}>
          {url && (
             <a 
               href={url} 
               target="_blank" 
               rel="noreferrer"
               style={{ 
                 marginRight: 'auto', textDecoration: 'none', color: '#4a90e2', 
                 display: 'flex', alignItems: 'center', fontSize: '0.9rem' 
               }}
             >
               ⬇️ Tải file gốc
             </a>
          )}
          <button 
            onClick={onClose}
            style={{
              background: '#4a90e2', color: 'white', border: 'none',
              padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
              fontWeight: 500
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// Giả lập parse in-line cơ bản (**bold**)
function parseInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.substring(2, part.length - 2)}</strong>;
    }
    return part;
  });
}
