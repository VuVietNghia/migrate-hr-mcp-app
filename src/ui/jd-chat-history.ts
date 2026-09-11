export type JDChatHistoryMessage = {
  role: 'user' | 'ai';
  content: string;
};

const MAX_HISTORY_CHARS = 6000;
const MAX_NEWEST_USER_CHARS = 3000;
const MAX_OTHER_MESSAGE_CHARS = 1200;
const TRUNCATION_MARKER = '\n… [đã rút gọn] …\n';

function sanitizeAIHistoryContent(content: string): string {
  let sanitized = content;
  for (const tag of ['jd_content', 'saved_file', 'position_name']) {
    sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, 'gi'), '');
  }
  return sanitized
    .replace(/<\/?(?:jd_content|saved_file|position_name)\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateMiddle(value: string, maxChars: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxChars) return value;
  if (maxChars <= TRUNCATION_MARKER.length) return characters.slice(0, maxChars).join('');

  const available = maxChars - TRUNCATION_MARKER.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return `${characters.slice(0, headLength).join('')}${TRUNCATION_MARKER}${characters.slice(-tailLength).join('')}`;
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

export function buildCompactJDChatHistory(messages: JDChatHistoryMessage[]): string {
  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  const candidates = messages
    .map((message, index) => {
      const sanitized = message.role === 'ai' ? sanitizeAIHistoryContent(message.content) : message.content.trim();
      if (!sanitized) return null;
      const maxChars = index === latestUserIndex ? MAX_NEWEST_USER_CHARS : MAX_OTHER_MESSAGE_CHARS;
      const content = truncateMiddle(sanitized, maxChars);
      return {
        index,
        isLatestUser: index === latestUserIndex,
        text: `${message.role === 'user' ? 'Người dùng' : 'AI'}: ${content}`
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const selected: Array<{ index: number; text: string }> = [];
  let remaining = MAX_HISTORY_CHARS;

  const addCandidate = (candidate: { index: number; text: string }) => {
    const separatorLength = selected.length > 0 ? 1 : 0;
    const available = remaining - separatorLength;
    if (available <= 0) return false;

    const text = truncateMiddle(candidate.text, available);
    if (!text) return false;
    selected.push({ index: candidate.index, text });
    remaining -= characterLength(text) + separatorLength;
    return characterLength(candidate.text) <= available;
  };

  const latestUser = candidates.find(candidate => candidate.isLatestUser);
  if (latestUser) addCandidate(latestUser);

  for (let index = candidates.length - 1; index >= 0; index--) {
    const candidate = candidates[index];
    if (candidate.isLatestUser) continue;
    const fullyAdded = addCandidate(candidate);
    if (!fullyAdded) {
      break;
    }
  }

  return selected
    .sort((left, right) => left.index - right.index)
    .map(candidate => candidate.text)
    .join('\n');
}
