import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileMailSecret } from '../src/services/mail/file-mail-secret';

describe('FileMailSecret', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('reads a configured local key file when there is no Docker secret mount', async () => {
		// Exercise the filesystem boundary used by WSL, including Windows line endings.
		const directory = await mkdtemp(path.resolve('node_modules', '.mail-secret-test-'));
		try {
			const filename = path.join(directory, 'nango_api_key');
			await writeFile(filename, ' local-file-key\r\n');
			vi.stubEnv('NANGO_SECRET_FILE', path.relative(process.cwd(), filename));
			vi.stubEnv('NANGO_API_KEY', 'env-key-must-not-be-used');
			await expect(new FileMailSecret().read()).resolves.toBe('local-file-key');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('keeps the Docker mount as the default when no file path is configured', async () => {
		vi.stubEnv('NANGO_SECRET_FILE', undefined);
		const mountedReader = async (filename: string) => {
			if (filename !== '/run/secrets/nango_api_key') throw new Error('Wrong secret mount.');
			return 'docker-file-key';
		};
		await expect(new FileMailSecret(undefined, mountedReader).read()).resolves.toBe('docker-file-key');
	});

	it('returns a safe error for a missing configured file instead of using an env key', async () => {
		const directory = await mkdtemp(path.resolve('node_modules', '.mail-secret-test-'));
		try {
			vi.stubEnv('NANGO_SECRET_FILE', path.join(directory, 'missing-key'));
			vi.stubEnv('NANGO_API_KEY', 'env-key-must-not-be-used');
			await expect(new FileMailSecret().read()).rejects.toMatchObject({ code: 'MAIL_CONFIGURATION_UNAVAILABLE' });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('reads and trims the Docker secret without consulting environment variables', async () => {
		vi.stubEnv('NANGO_API_KEY', 'env-must-not-be-used');
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
