// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineJDPanel } from '../src/ui/pipeline/PipelineStudioSections';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Pipeline JD custom select interactions', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('opens, navigates with arrows, selects with Enter, and closes', async () => {
    const onSelect = vi.fn();
    const onAddJD = vi.fn();
    await act(async () => {
      root.render(createElement(PipelineJDPanel, {
        jds: [
          { _id: 'jd-regular', name: 'JD Frontend.md' },
          { _id: 'jd-generated', name: 'JD_AI_Backend.md' },
        ],
        selectedName: 'JD Frontend.md',
        loadStatus: 'success',
        loading: false,
        disabled: false,
        onSelect,
        onOpenSelected: vi.fn(),
        onAddJD,
        onRetry: vi.fn(),
      }));
    });

    const trigger = host.querySelector<HTMLButtonElement>('#pipeline-jd-select');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }));
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    });

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toContain('JD_AI_Backend.md');

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('jd-generated');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    const addButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Thêm JD'));
    expect(addButton).toBeTruthy();
    expect(host.querySelector('input[type="file"]')).toBeNull();
    await act(async () => addButton?.click());
    expect(onAddJD).toHaveBeenCalledTimes(1);
  });
});
