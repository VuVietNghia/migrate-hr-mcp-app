import { useEffect, useMemo, useState } from 'react';

import type { MailProvider } from '../../services/mail/mail-contracts';
import { MailConnectionClient, type MailConnectionApp } from './mail-connection-client';
import { MailConnectionController, type MailConnectionState } from './mail-connection-controller';
import { nangoPopupLauncher } from './nango-popup-launcher';
import './mail-connection.css';

export interface MailConnectionPanelProps {
	app: MailConnectionApp;
	roomId: string;
	active: boolean;
}

export type MailConnectionAction = 'connect' | 'coming-soon';

export function resolveMailConnectionAction(provider: MailProvider): MailConnectionAction {
	return provider === 'microsoft' ? 'coming-soon' : 'connect';
}

export function MicrosoftComingSoonDialog({ onClose }: { onClose: () => void }) {
	return (
		<div
			className="mail-coming-soon-backdrop"
			role="presentation"
			onMouseDown={event => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="mail-coming-soon-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="mail-coming-soon-title"
			>
				<h3 id="mail-coming-soon-title">Microsoft 365</h3>
				<p>Chức năng này đang phát triển</p>
				<button type="button" autoFocus onClick={onClose}>Đóng</button>
			</div>
		</div>
	);
}

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
		() => new MailConnectionController(new MailConnectionClient(app, roomId), nangoPopupLauncher),
		[app, roomId],
	);
	const [state, setState] = useState<MailConnectionState>(controller.state);
	const [microsoftComingSoon, setMicrosoftComingSoon] = useState(false);

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

	useEffect(() => {
		if (!microsoftComingSoon) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setMicrosoftComingSoon(false);
		};
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [microsoftComingSoon]);

	const view = state.kind === 'loading' ? null : state.view;
	const connection = view?.connection ?? null;
	const busy = state.kind === 'loading' || state.kind === 'connecting';
	const connect = (provider: MailProvider) => {
		if (resolveMailConnectionAction(provider) === 'coming-soon') {
			setMicrosoftComingSoon(true);
			return;
		}
		void controller.connect(provider);
	};

	return (
		<>
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
		{microsoftComingSoon && (
			<MicrosoftComingSoonDialog onClose={() => setMicrosoftComingSoon(false)} />
		)}
		</>
	);
}
