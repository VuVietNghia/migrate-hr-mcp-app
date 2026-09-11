import { describe, expect, it } from 'vitest';
import { sanitizeEmailHtml } from '../src/services/mail/html-sanitizer';

describe('sanitizeEmailHtml', () => {
  it('strips script/style/iframe/object blocks and event handlers', () => {
    const dirty = '<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="a"></iframe><style>*{}</style>';
    expect(sanitizeEmailHtml(dirty)).toBe('<p>Hi</p>');
  });
  it('neutralises javascript: and data: URLs in href/src', () => {
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeEmailHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img src="#">');
  });
  it('keeps ordinary formatting untouched', () => {
    const clean = '<p>Xin chào <b>Nguyễn</b>,<br/>Mời bạn <a href="https://x.vn">tại đây</a>.</p>';
    expect(sanitizeEmailHtml(clean)).toBe(clean);
  });
});
