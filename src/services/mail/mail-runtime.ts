import { AppDbMailConnectionRepository } from './app-db-mail-connection-repository';
import { ConnectionMailQueue } from './connection-mail-queue';
import { EmailHistoryRepository } from './email-history-repository';
import { FileMailSecret } from './file-mail-secret';
import { GoogleMailAdapter } from './google-mail-adapter';
import { MailConnectionService } from './mail-connection-service';
import { MailError } from './mail-errors';
import { MailRoomLock } from './mail-room-lock';
import { MicrosoftMailAdapter } from './microsoft-mail-adapter';
import { NangoSdkGateway } from './nango-sdk-gateway';
import { RoomMailDeliveryGateway } from './room-mail-delivery-gateway';
import { TrackedMailService } from './tracked-mail-service';
import { createRoomHubToolCaller } from '../hub-tool-caller';
import { resolveOwnMcpAppId } from '../../resolve-own-mcp-app-id';

const broker = new NangoSdkGateway(new FileMailSecret());
const repository = new AppDbMailConnectionRepository();
const adapters = {
	google: new GoogleMailAdapter(broker),
	microsoft: new MicrosoftMailAdapter(broker),
} as const;
const lock = new MailRoomLock();
const queue = new ConnectionMailQueue();
const connectionService = new MailConnectionService({ repository, broker, adapters, lock });

export function getMailConnectionService(): MailConnectionService {
	return connectionService;
}

export async function createTrackedMail(roomId: string): Promise<TrackedMailService> {
	const installationId = await resolveOwnMcpAppId();
	if (!installationId) throw new MailError('MAIL_CONFIGURATION_UNAVAILABLE');
	const delivery = new RoomMailDeliveryGateway(
		{ installationId, roomId },
		repository,
		broker,
		adapters,
		queue,
		lock,
	);
	return new TrackedMailService(new EmailHistoryRepository(createRoomHubToolCaller(roomId)), delivery);
}
