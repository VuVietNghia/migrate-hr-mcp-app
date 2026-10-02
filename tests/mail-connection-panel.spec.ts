import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
	MicrosoftComingSoonDialog,
	resolveMailConnectionAction,
} from '../src/ui/mail-connection/MailConnectionPanel';

describe('MailConnectionPanel provider actions', () => {
	it('keeps Google on the OAuth path and routes Microsoft to the coming-soon dialog', () => {
		expect(resolveMailConnectionAction('google')).toBe('connect');
		expect(resolveMailConnectionAction('microsoft')).toBe('coming-soon');
	});

	it('renders an accessible Microsoft development notice', () => {
		const html = renderToStaticMarkup(createElement(MicrosoftComingSoonDialog, { onClose: vi.fn() }));

		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('Chức năng này đang phát triển');
		expect(html).toContain('Đóng');
	});
});
