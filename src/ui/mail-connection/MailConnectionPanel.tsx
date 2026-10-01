import Nango, { type ConnectUIEvent } from '@nangohq/frontend';
import { useEffect, useMemo, useState } from 'react';

import type { MailProvider } from '../../services/mail/mail-contracts';
import { MailConnectionClient, type MailConnectionApp } from './mail-connection-client';
import { MailConnectionController, type MailConnectEvent, type MailConnectLauncher, type MailConnectionState } from './mail-connection-controller';
import './mail-connection.css';

export interface MailConnectionPanelProps {
	app: MailConnectionApp;
	roomId: string;
	active: boolean;
}

function toControllerEvent(event: ConnectUIEvent): MailConnectEvent {
	switch (event.type) {
		case 'ready': return { type: 'ready' };
		case 'close': return { type: 'close' };
		case 'connect': return { type: 'connect', candidateConnectionId: event.payload.connectionId };
		case 'error': return { type: 'error' };
		case 'settings_changed': return { type: 'settings_changed' };
		default: {
			const exhaustive: never = event;
			return exhaustive;
		}
	}
}

const nangoLauncher: MailConnectLauncher = {
	open(onEvent) {
		const sdk = new Nango();
		const connectUi = sdk.openConnectUI({
			detectClosedAuthWindow: true,
			onEvent: event => onEvent(toControllerEvent(event)),
		});
		connectUi.open();
		return {
			setSessionToken: token => connectUi.setSessionToken(token),
			close: () => connectUi.close(),
		};
	},
};

function providerName(provider: MailProvider): string {
	switch (provider) {
		case 'google': return 'Google Workspace';
		case 'microsoft': return 'Microsoft 365';
		default: {
			const exhaustive: never = provider;
			return exhaustive;
		}
	}
}

export function MailConnectionPanel({ app, roomId, active }: MailConnectionPanelProps) {
	const controller = useMemo(
		() => new MailConnectionController(new MailConnectionClient(app, roomId), nangoLauncher),
		[app, roomId],
	);
	const [state, setState] = useState<MailConnectionState>(controller.state);

	useEffect(() => {
		const unsubscribe = controller.subscribe(setState);
		return () => {
			unsubscribe();
			controller.dispose();
		};
	}, [controller]);

	useEffect(() => {
		if (active) void controller.load();
	}, [active, controller]);

	const view = state.kind === 'loading' ? null : state.view;
	const connection = view?.connection ?? null;
	const busy = state.kind === 'loading' || state.kind === 'connecting';
	const connect = (provider: MailProvider) => { void controller.connect(provider); };

	return (
		<section className="mail-connection-panel" aria-labelledby="mail-connection-title">
			<div>
				<h2 id="mail-connection-title">Tài khoản gửi email của Room</h2>
				{state.kind === 'loading' && <p>Đang tải cấu hình mailbox…</p>}
				{state.kind !== 'loading' && !connection && <p>Room chưa kết nối tài khoản gửi email.</p>}
				{connection && (
					<dl className="mail-connection-details">
						<div><dt>Mailbox chung</dt><dd>{connection.senderEmail}</dd></div>
						<div><dt>Nhà cung cấp</dt><dd>{providerName(connection.provider)}</dd></div>
						<div><dt>Trạng thái</dt><dd>{connection.status === 'connected' ? 'Đã kết nối' : connection.status === 'error' ? 'Cần kết nối lại' : 'Đã ngắt kết nối'}</dd></div>
						<div><dt>Cập nhật</dt><dd>{new Date(connection.updatedAt).toLocaleString('vi-VN')}</dd></div>
					</dl>
				)}
				{view?.cleanupPending && <p className="mail-connection-note">Đang hoàn tất dọn kết nối cũ.</p>}
				{state.kind === 'error' && <p className="mail-connection-error" role="alert">{state.message}</p>}
			</div>
			<div className="mail-connection-actions">
				<button type="button" disabled={busy} onClick={() => connect('google')}>
					{connection ? 'Thay tài khoản Google' : 'Kết nối Google'}
				</button>
				<button type="button" disabled={busy} onClick={() => connect('microsoft')}>
					{connection ? 'Thay tài khoản Microsoft' : 'Kết nối Microsoft'}
				</button>
				{connection?.status === 'connected' && (
					<button type="button" className="is-danger" disabled={busy} onClick={() => { void controller.disconnect(); }}>
						Ngắt kết nối
					</button>
				)}
			</div>
		</section>
	);
}
