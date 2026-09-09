/**
 * Minimal allow-nothing-dangerous sanitizer for outbound email HTML. The
 * content is authored inside the app (templates + user text turned into
 * <br/>), so the goal is to strip active content, not to validate markup.
 */
const BLOCK_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form'];

export function sanitizeEmailHtml(html: string): string {
	let out = html;
	for (const tag of BLOCK_TAGS) {
		out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
		out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
	}
	// on*="..." / on*='...' / on*=bare
	out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
	// javascript: / data: / vbscript: in href/src
	out = out.replace(/\b(href|src)\s*=\s*(["']?)\s*(javascript|data|vbscript):[^"'\s>]*\2/gi, '$1=$2#$2');
	return out;
}
