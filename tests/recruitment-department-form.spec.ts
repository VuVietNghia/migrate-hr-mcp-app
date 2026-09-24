import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { describe, expect, it, vi } from 'vitest';

import {
  RecruitmentDepartmentForm,
  RecruitmentDepartmentRenameForm,
} from '../src/ui/recruitment-department-form';

const recruitmentStyles = postcss.parse(readFileSync(resolve('src/ui/contact-form-styles.css'), 'utf8'));

function declarationsFor(selector: string) {
  const declarations = new Map<string, string>();
  recruitmentStyles.walkRules(selector, (rule) => {
    rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
  });
  return declarations;
}

function declarationsForMobile(selector: string) {
  const declarations = new Map<string, string>();
  recruitmentStyles.walkAtRules('media', (media) => {
    if (media.params !== '(max-width: 780px)') return;
    media.walkRules(selector, (rule) => {
      rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
    });
  });
  return declarations;
}

describe('RecruitmentDepartmentForm', () => {
  it('uses a compact accessible input without a visible field label', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentDepartmentForm, {
      departmentName: '',
      isLoading: false,
      isSaving: false,
      onCancel: vi.fn(),
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('aria-label="Tên phòng ban"');
    expect(html).toContain('placeholder="Nhập tên phòng ban"');
    expect(html).not.toContain('<label');
    expect(html).toContain('class="recruitment-department-submit"');
  });

  it('renders the current name and an empty new-name input in an accessible modal', () => {
    const html = renderToStaticMarkup(createElement(RecruitmentDepartmentRenameForm, {
      currentDepartmentName: 'Kinh doanh',
      departmentName: '',
      errorMessage: '',
      isSaving: false,
      onCancel: vi.fn(),
      onNameChange: vi.fn(),
      onSubmit: vi.fn(),
    }));

    expect(html).toContain('class="recruitment-department-modal-backdrop"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Đổi tên phòng ban');
    expect(html).toContain('Tên hiện tại');
    expect(html).toContain('<strong>Kinh doanh</strong>');
    expect(html).toContain('aria-label="Tên phòng ban mới"');
    expect(html).toContain('placeholder="Nhập tên phòng ban mới"');
    expect(html).toContain('value=""');
    expect(html).toContain('Lưu tên');
    expect(html).toContain('Hủy');
  });

  it('centers the rename modal above a dimmed blurred backdrop', () => {
    const backdrop = declarationsFor('.recruitment-department-modal-backdrop');

    expect(backdrop.get('position')).toBe('fixed');
    expect(backdrop.get('inset')).toBe('0');
    expect(backdrop.get('place-items')).toBe('center');
    expect(backdrop.get('backdrop-filter')).toContain('blur(');
    expect(backdrop.has('background')).toBe(true);
  });

  it('leaves comfortable space between department tabs and the add form', () => {
    expect(declarationsFor('.recruitment-department-form').get('margin')).toBe('16px 0 22px');
  });

  it('changes only the department tab border color on hover', () => {
    const hover = declarationsFor('.recruitment-category:hover');

    expect(hover.get('border-color')).toBe('var(--accent)');
    expect(hover.has('color')).toBe(false);
  });

  it('keeps the department input compact when the form stacks on mobile', () => {
    expect(declarationsForMobile('.recruitment-department-form input').get('flex')).toBe('0 0 40px');
  });
});
