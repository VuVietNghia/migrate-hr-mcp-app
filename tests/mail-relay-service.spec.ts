import { describe, expect, it } from 'vitest';

import * as legacyRelay from '../src/services/mail/mail-relay-service';

describe('legacy mail relay module', () => {
	it('has no EmailJS runtime or environment reader', () => {
		expect('MailRelayService' in legacyRelay).toBe(false);
		expect('readMailRelayEnv' in legacyRelay).toBe(false);
	});
});
