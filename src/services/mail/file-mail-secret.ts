import { readFile } from 'node:fs/promises';

import { MailError } from './mail-errors';

export interface MailSecretReader {
	read(): Promise<string>;
}

export type ReadTextFile = (path: string, encoding: BufferEncoding) => Promise<string>;

const defaultReadTextFile: ReadTextFile = (path, encoding) => readFile(path, encoding);

export class FileMailSecret implements MailSecretReader {
	constructor(
		private readonly path = '/run/secrets/nango_api_key',
		private readonly readTextFile: ReadTextFile = defaultReadTextFile,
	) {}

	async read(): Promise<string> {
		try {
			const value = (await this.readTextFile(this.path, 'utf8')).trim();
			if (!value || value.length > 16_384) throw new Error('Invalid mail secret file.');
			return value;
		} catch (error) {
			throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE', undefined, error);
		}
	}
}
