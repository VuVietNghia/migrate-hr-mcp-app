// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('uploaded recruitment JD dialog layout', () => {
  it('contains a DOCX preview between a fixed header and action footer', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve('src/ui/studio/studio.css'), 'utf8');
    document.head.append(style);

    const dialog = document.createElement('dialog');
    dialog.className = 'studio-dialog recruitment-job-dialog recruitment-uploaded-job-dialog';
    dialog.setAttribute('open', '');

    const header = document.createElement('div');
    header.className = 'studio-dialog__header';
    const body = document.createElement('div');
    body.className = 'studio-dialog__body';
    const preview = document.createElement('div');
    preview.className = 'company-docx-preview';
    const actions = document.createElement('div');
    actions.className = 'studio-dialog__actions';
    body.append(preview);
    dialog.append(header, body, actions);
    document.body.append(dialog);

    expect(getComputedStyle(dialog)).toMatchObject({
      display: 'grid',
      overflow: 'hidden',
    });
    expect(getComputedStyle(body)).toMatchObject({
      display: 'flex',
      overflow: 'hidden',
    });
    expect(getComputedStyle(preview)).toMatchObject({
      height: '100%',
      maxHeight: 'none',
      overflow: 'auto',
    });

    dialog.remove();
    style.remove();
  });
});
