import {
  classifyCompanyDocument,
  describeCompanyDocumentFormat,
  type CompanyDocument,
} from '../company/company-documents';
import { CompanyDocxPreview } from '../company/CompanyDocxPreview';
import { CompanyMarkdownPreview } from '../company/CompanyMarkdownPreview';
import { CompanyPdfPreview } from '../company/CompanyPdfPreview';
import { StudioInlineState } from '../studio/StudioPrimitives';

export interface JDDocumentPreviewProps {
  fileName: string;
  text?: string;
  blob?: Blob | null;
  loading?: boolean;
  error?: string;
}

export function JDDocumentPreview({ fileName, text = '', blob, loading = false, error }: JDDocumentPreviewProps) {
  if (loading) return <StudioInlineState tone="info">Đang dựng bản xem trước JD…</StudioInlineState>;
  if (error) return <StudioInlineState tone="danger">{error}</StudioInlineState>;
  const document: CompanyDocument = { id: 'jd-preview', name: fileName };
  const format = describeCompanyDocumentFormat(document);
  if (format.id === 'markdown') return <CompanyMarkdownPreview content={text} />;
  if (classifyCompanyDocument(document) === 'text') return <pre className="company-text-preview">{text}</pre>;
  if (format.id === 'word' && blob) return <CompanyDocxPreview blob={blob} />;
  if (format.id === 'pdf' && blob) return <CompanyPdfPreview blob={blob} />;
  return <StudioInlineState tone="danger">Không có bản xem trước cho định dạng JD này.</StudioInlineState>;
}
