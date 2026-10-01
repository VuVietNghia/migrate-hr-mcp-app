import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '../privos-app.json';
import { FileMailSecret } from '../src/services/mail/file-mail-secret';

describe('Room mailbox container configuration', () => {
	it('mounts the Nango key as a Docker secret and keeps the standalone identity in a Linux volume', () => {
		const compose = fs.readFileSync(path.resolve('compose.yaml'), 'utf8');
		expect(compose).toContain('- nango_api_key');
		expect(compose).toContain('nango_api_key:');
		expect(compose).toContain('file: ./docker-data/secrets/nango_api_key');
		expect(compose).toContain('privos_identity:/run/privos/identity');
		expect(compose).toContain('name: privos_hr_identity');
		expect(compose).toContain('external: true');
		expect(compose).not.toContain('./docker-data/identity:/run/privos/identity');
	});

	it('does not declare mail provider secrets as environment variables', () => {
		const keys = manifest.env.map(entry => entry.key);
		expect(keys.some(key => key.startsWith('EMAILJS_'))).toBe(false);
		expect(keys).not.toContain('NANGO_API_KEY');
	});

	it('loads the Nango secret lazily and maps a missing mount to a safe domain error', async () => {
		const secret = new FileMailSecret('/missing/nango_api_key', async () => {
			throw new Error('ENOENT /private/path');
		});
		await expect(secret.read()).rejects.toMatchObject({ code: 'MAIL_CONFIGURATION_UNAVAILABLE' });
	});
});
