import { CheckCircleOutlined, DownOutlined } from '@ant-design/icons';
import { useEffect, useId, useRef, useState } from 'react';

export interface CandidateStudioSelectOption {
  value: string;
  label: string;
}

interface CandidateStudioSelectProps {
  ariaLabel: string;
  value: string;
  options: ReadonlyArray<CandidateStudioSelectOption>;
  groupLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function getNextCandidateStudioSelectOptionIndex(currentIndex: number, key: string, optionCount: number) {
  if (optionCount <= 0) return null;
  if (key === 'ArrowDown') return (currentIndex + 1) % optionCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + optionCount) % optionCount;
  if (key === 'Home') return 0;
  if (key === 'End') return optionCount - 1;
  return null;
}

export function CandidateStudioSelect({
  ariaLabel,
  value,
  options,
  groupLabel,
  disabled = false,
  onChange,
}: CandidateStudioSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const groupLabelId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected?.value));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const optionElements = () => Array.from(
    rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
  );
  const focusOption = (index: number) => optionElements()[index]?.focus();
  const openAndFocus = (index: number) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };
  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className="pipeline-studio-select-wrap candidate-studio-select-wrap"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="pipeline-studio-select candidate-studio-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={(event) => {
          if (open) setOpen(false);
          else if (event.detail === 0) openAndFocus(selectedIndex);
          else setOpen(true);
        }}
        onKeyDown={(event) => {
          const nextIndex = getNextCandidateStudioSelectOptionIndex(selectedIndex, event.key, options.length);
          if (nextIndex !== null) {
            event.preventDefault();
            openAndFocus(nextIndex);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <span>{selected?.label ?? ariaLabel}</span>
        <DownOutlined aria-hidden="true" className={open ? 'is-open' : undefined} />
      </button>
      <div
        id={listboxId}
        className="pipeline-studio-select-menu candidate-studio-select-menu"
        role="listbox"
        aria-label={ariaLabel}
        hidden={!open}
        onKeyDown={(event) => {
          const elements = optionElements();
          const current = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="option"]');
          const currentIndex = current ? elements.indexOf(current) : selectedIndex;
          const nextIndex = getNextCandidateStudioSelectOptionIndex(currentIndex, event.key, elements.length);
          if (nextIndex !== null) {
            event.preventDefault();
            focusOption(nextIndex);
          } else if ((event.key === 'Enter' || event.key === ' ') && current) {
            event.preventDefault();
            current.click();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
          } else if (event.key === 'Tab') {
            setOpen(false);
          }
        }}
      >
        <div className="pipeline-studio-select-group" role="group" aria-labelledby={groupLabelId}>
          <span id={groupLabelId} className="pipeline-studio-select-group__label">{groupLabel}</span>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`pipeline-studio-select-option${option.value === value ? ' is-selected' : ''}`}
              tabIndex={-1}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>
              {option.value === value ? <CheckCircleOutlined aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
