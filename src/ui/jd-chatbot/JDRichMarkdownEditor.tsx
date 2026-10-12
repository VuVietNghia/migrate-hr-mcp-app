import { useEffect, useRef, useState } from 'react';
import { CompanyMarkdownPreview } from '../company/CompanyMarkdownPreview';
import { markdownFromEditableJD } from './jd-rich-editor-markdown';

interface JDRichMarkdownEditorProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export function JDRichMarkdownEditor({ value, disabled, onChange }: JDRichMarkdownEditorProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const latestValue = useRef(value);
  latestValue.current = value;
  const emittedValue = useRef<string | null>(null);

  useEffect(() => {
    if (emittedValue.current === value) {
      emittedValue.current = null;
      return;
    }
    setDisplayValue(value);
  }, [value]);

  const publishChange = (element: HTMLDivElement) => {
    const nextValue = markdownFromEditableJD(element, latestValue.current);
    if (nextValue === latestValue.current.trim()) return;
    emittedValue.current = nextValue;
    latestValue.current = nextValue;
    onChange(nextValue);
  };

  return (
    <div
      className="jd-studio-manual-editor"
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-label="Chỉnh sửa nội dung JD"
      aria-multiline="true"
      aria-disabled={disabled}
      onInput={(event) => publishChange(event.currentTarget)}
      onBlur={(event) => publishChange(event.currentTarget)}
    >
      <CompanyMarkdownPreview content={displayValue} />
    </div>
  );
}
