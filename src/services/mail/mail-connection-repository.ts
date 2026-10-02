import type { MailConnection, MailScope } from './mail-contracts';

export interface MailConnectionRepository {
	read(scope: MailScope): Promise<MailConnection | null>;
	write(scope: MailScope, connection: MailConnection): Promise<void>;
}
