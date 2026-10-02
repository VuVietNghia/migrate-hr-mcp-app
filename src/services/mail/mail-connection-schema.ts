export const MAIL_CONNECTION_COLLECTION = 'hr_mail_connections';

export const MAIL_CONNECTION_FIELDS = [
	{ name: 'roomId', type: 'string', required: true, maxLength: 64 },
	{ name: 'provider', type: 'string', required: true, enum: ['google', 'microsoft'] },
	{ name: 'connectionId', type: 'string', required: true, maxLength: 256 },
	{ name: 'senderEmail', type: 'string', required: true, maxLength: 320 },
	{ name: 'status', type: 'string', required: true, enum: ['connected', 'disconnected', 'error'] },
	{ name: 'revision', type: 'string', required: true, maxLength: 36 },
	{ name: 'updatedBy', type: 'string', required: true, maxLength: 256 },
	{ name: 'updatedAt', type: 'string', required: true, maxLength: 35 },
] as const;

/** The validator contract the Hub's registered field schema must enforce at collection level. */
export const MAIL_CONNECTION_JSON_SCHEMA = {
	bsonType: 'object',
	required: [
		'roomId',
		'provider',
		'connectionId',
		'senderEmail',
		'status',
		'revision',
		'updatedBy',
		'updatedAt',
	],
	properties: {
		roomId: { bsonType: 'string', minLength: 1, maxLength: 64 },
		provider: { bsonType: 'string', enum: ['google', 'microsoft'] },
		connectionId: { bsonType: 'string', minLength: 1, maxLength: 256 },
		senderEmail: { bsonType: 'string', minLength: 3, maxLength: 320 },
		status: { bsonType: 'string', enum: ['connected', 'disconnected', 'error'] },
		revision: {
			bsonType: 'string',
			pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
		},
		updatedBy: { bsonType: 'string', minLength: 1, maxLength: 256 },
		updatedAt: { bsonType: 'string', minLength: 20, maxLength: 35 },
	},
} as const;

/** Every repository query filters on this unique index and requests at most one record. */
export const MAIL_CONNECTION_INDEXES = [{ fields: { roomId: 1 }, unique: true }] as const;
