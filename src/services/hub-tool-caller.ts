/**
 * Server-side bridge to one mediated Hub tool, executed with this app's own
 * installation-bot credential and pinned to ONE room. Every `hrm.*` tool
 * handler builds its caller from `actor.roomId` (Hub-verified) — never from a
 * caller-supplied argument — so the bot can only ever be pointed at the room
 * the human actually made the request from.
 *
 * The allowlist below is the complete set of Hub tools the server is permitted
 * to reach. Anything else throws before a request is made.
 */
import { callAppPlatformTool } from '../app-platform-tool-call';

export type HubToolCaller = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
export type HubToolTransport = typeof callAppPlatformTool;

const SCOPE_BY_TOOL: Readonly<Record<string, string>> = {
	'mcpapp.db.registerCollection': 'db:schema:write',
	'mcpapp.db.getSchema': 'db:schema:read',
	'mcpapp.db.query': 'db:read',
	'mcpapp.db.count': 'db:read',
	'mcpapp.db.get': 'db:read',
	'mcpapp.db.create': 'db:write',
	'mcpapp.db.update': 'db:write',
	'mcpapp.db.delete': 'db:write',
	'mcpapp.lists.getAll': 'lists:read',
	'mcpapp.lists.get': 'lists:read',
	'mcpapp.lists.getItems': 'lists:read',
	'mcpapp.lists.getItem': 'lists:read',
	'mcpapp.stages.getByList': 'lists:read',
	'mcpapp.lists.create': 'lists:write',
	'mcpapp.lists.createItem': 'lists:write',
	'mcpapp.lists.updateItem': 'lists:write',
	'mcpapp.lists.moveItemToStage': 'lists:write',
};

export function resolveRequiredScope(toolName: string): string {
	const scope = SCOPE_BY_TOOL[toolName];
	if (!scope) throw new Error(`Hub tool "${toolName}" is not allowed from the server`);
	return scope;
}

export function createRoomHubToolCaller(
	roomId: string,
	transport: HubToolTransport = callAppPlatformTool,
): HubToolCaller {
	return (name, args = {}) => transport(name, args, resolveRequiredScope(name), roomId);
}
