import { describe, expect, it } from 'vitest';

import { FileMailSecret } from '../src/services/mail/file-mail-secret';

describe('FileMailSecret', () => {
	it('reads and trims the Docker secret without consulting environment variables', async () => {
		process.env.NANGO_API_KEY = 'env-must-not-be-used';
		const secret = new FileMailSecret('/run/secrets/nango_api_key', async () => ' file-secret\r\n');
		await expect(secret.read()).resolves.toBe('file-secret');
	});

	it.each([
		['empty', async () => '   '],
		['missing', async () => Promise.reject(Object.assign(new Error('secret-key-value'), { code: 'ENOENT' }))],
		['denied', async () => Promise.reject(Object.assign(new Error('secret-key-value'), { code: 'EACCES' }))],
	])('maps %s secret failures to a safe domain error', async (_name, readFile) => {
		const secret = new FileMailSecret('/run/secrets/nango_api_key', readFile);
		await expect(secret.read()).rejects.toMatchObject({ code: 'MAIL_CONFIGURATION_UNAVAILABLE' });
		await expect(secret.read()).rejects.not.toThrow(/secret-key-value/);
	});
});
