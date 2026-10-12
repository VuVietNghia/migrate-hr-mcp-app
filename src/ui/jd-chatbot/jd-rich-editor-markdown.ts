const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

function text(value: string | null | undefined): string {
  return (value || '').replace(/\u00a0/gu, ' ');
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return text(node.textContent);
  if (!(node instanceof HTMLElement)) return '';

  const content = [...node.childNodes].map(inlineMarkdown).join('');
  switch (node.tagName.toLowerCase()) {
    case 'strong':
    case 'b':
      return `**${content}**`;
    case 'em':
    case 'i':
      return `*${content}*`;
    case 'del':
    case 's':
      return `~~${content}~~`;
    case 'code':
      return `\`${content}\``;
    case 'a': {
      const href = node.getAttribute('href');
      return href ? `[${content}](${href})` : content;
    }
    case 'br':
      return '\n';
    case 'img': {
      const src = node.getAttribute('src');
      return src ? `![${node.getAttribute('alt') || ''}](${src})` : '';
    }
    default:
      return content;
  }
}

function listMarkdown(element: HTMLElement, depth = 0): string {
  const ordered = element.tagName.toLowerCase() === 'ol';
  const items = [...element.children].filter((child) => child.tagName.toLowerCase() === 'li');
  return items.map((item, index) => {
    const nestedLists = [...item.children].filter((child) => /^(?:ul|ol)$/iu.test(child.tagName));
    const inline = [...item.childNodes]
      .filter((child) => !(child instanceof HTMLElement && /^(?:ul|ol)$/iu.test(child.tagName)))
      .map(inlineMarkdown)
      .join('')
      .trim();
    const prefix = ordered ? `${index + 1}.` : '-';
    const current = `${'  '.repeat(depth)}${prefix} ${inline}`;
    const nested = nestedLists
      .map((child) => listMarkdown(child as HTMLElement, depth + 1))
      .filter(Boolean)
      .join('\n');
    return nested ? `${current}\n${nested}` : current;
  }).join('\n');
}

function tableMarkdown(element: HTMLElement): string {
  const rows = [...element.querySelectorAll('tr')].map((row) => (
    [...row.querySelectorAll(':scope > th, :scope > td')]
      .map((cell) => inlineMarkdown(cell).trim().replace(/\|/gu, '\\|'))
  )).filter((row) => row.length > 0);
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')]);
  const lines = normalized.map((row) => `| ${row.join(' | ')} |`);
  lines.splice(1, 0, `| ${Array<string>(width).fill('---').join(' | ')} |`);
  return lines.join('\n');
}

function blockMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return text(node.textContent);
  if (!(node instanceof HTMLElement)) return '';

  const tag = node.tagName.toLowerCase();
  const children = () => [...node.childNodes].map(blockMarkdown).join('');
  if (/^h[1-6]$/u.test(tag)) {
    return `${'#'.repeat(Number(tag.slice(1)))} ${inlineMarkdown(node).trim()}\n\n`;
  }
  if (tag === 'p') return `${inlineMarkdown(node).trim()}\n\n`;
  if (tag === 'ul' || tag === 'ol') return `${listMarkdown(node)}\n\n`;
  if (tag === 'blockquote') {
    const quote = serializeEditableJD(node).split('\n').map((line) => `> ${line}`).join('\n');
    return `${quote}\n\n`;
  }
  if (tag === 'pre') return `\`\`\`\n${text(node.textContent).trim()}\n\`\`\`\n\n`;
  if (tag === 'table') return `${tableMarkdown(node)}\n\n`;
  if (tag === 'hr') return '---\n\n';
  if (tag === 'br') return '\n';
  if (['strong', 'b', 'em', 'i', 'del', 's', 'code', 'a', 'span'].includes(tag)) {
    return inlineMarkdown(node);
  }
  return children();
}

export function serializeEditableJD(root: HTMLElement): string {
  return [...root.childNodes]
    .map(blockMarkdown)
    .join('')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function restoreJDHiddenComments(visibleMarkdown: string, originalMarkdown: string): string {
  const comments = originalMarkdown.match(HTML_COMMENT) || [];
  const visible = visibleMarkdown.replace(HTML_COMMENT, '').replace(/\n{3,}/gu, '\n\n').trim();
  if (comments.length === 0) return visible;

  const commentBlock = comments.map((comment) => comment.trim()).join('\n');
  const firstLineEnd = visible.indexOf('\n');
  if (firstLineEnd < 0) return `${visible}\n\n${commentBlock}`.trim();
  return [
    visible.slice(0, firstLineEnd).trimEnd(),
    commentBlock,
    visible.slice(firstLineEnd + 1).trimStart(),
  ].filter(Boolean).join('\n\n');
}

export function markdownFromEditableJD(root: HTMLElement, originalMarkdown: string): string {
  return restoreJDHiddenComments(serializeEditableJD(root), originalMarkdown);
}
