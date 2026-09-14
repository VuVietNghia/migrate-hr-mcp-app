import { describe, expect, it } from 'vitest';
import {
  findParsedMarkdownFile,
  parsedMarkdownName,
  readParsedCvText,
  stripCvContentTags,
  ParsedCvUnavailableError,
} from '../src/ui/parsed-cv-text';

const ROOM = 'room-1';
const CV = { _id: 'cv-1', name: 'NGUYỄN VIỆT_HƯNG_Resume.pdf' };
const CV_TEXT = '## NGUYỄN VIỆT HƯNG\n\nLập trình viên\n\nSKILLS\n\n• React, Node.js';

/** A Hub stand-in answering `app.rest()` by path, mirroring the routes verified on roxane-dev. */
function fakeHub(overrides: { parseStatus?: string | null; markdownFiles?: any[]; text?: string; noMarkdownFolder?: boolean } = {}) {
  const calls: string[] = [];
  const routes: Record<string, any> = {
    [`file-management.files/${CV._id}`]: { _id: CV._id, name: CV.name, parse_status: 'parseStatus' in overrides ? overrides.parseStatus : 'complete' },
    [`file-management.channels/${ROOM}/root`]: {
      folders: overrides.noMarkdownFolder ? [{ _id: 'f-hr', name: 'hr-miniapp', father: null }] : [
        { _id: 'f-hr', name: 'hr-miniapp', father: null },
        { _id: 'smv1_d_markdown', name: '.markdown', father: null },
      ],
    },
    [`file-management.files.channel/${ROOM}`]: {
      files: overrides.markdownFiles ?? [
        { _id: 'smv1_f_other', name: 'CV_Test_TranVanTest.md' },
        { _id: 'smv1_f_cv', name: 'NGUYỄN_VIỆT_HƯNG_Resume.md' },
      ],
      total: 2,
    },
    'file-management.files/smv1_f_cv/content': { result: overrides.text ?? CV_TEXT },
  };
  const app = {
    rest: async ({ path }: { path: string }) => {
      calls.push(path);
      return path in routes ? { statusCode: 200, body: routes[path] } : { statusCode: 404, body: { success: false, error: 'Not found' } };
    },
  } as any;
  return { app, calls };
}

describe('parsedMarkdownName', () => {
  it('drops the extension and replaces spaces with underscores, like the Hub parser', () => {
    expect(parsedMarkdownName('NGUYỄN VIỆT_HƯNG_Resume.pdf')).toBe('NGUYỄN_VIỆT_HƯNG_Resume.md');
    expect(parsedMarkdownName('CV Vũ Việt Nghĩa-1.pdf')).toBe('CV_Vũ_Việt_Nghĩa-1.md');
  });

  it('matches a parsed file whose name uses decomposed Unicode', () => {
    const files = [{ _id: 'x', name: 'NGUYỄN_VIỆT_HƯNG_Resume.md'.normalize('NFD') }];
    expect(findParsedMarkdownFile(files, CV.name)?._id).toBe('x');
  });
});

describe('readParsedCvText', () => {
  it('returns the parsed Markdown text of the CV', async () => {
    const { app, calls } = fakeHub();
    await expect(readParsedCvText(app, ROOM, CV)).resolves.toBe(CV_TEXT);
    expect(calls).toContain('file-management.files/smv1_f_cv/content');
  });

  it('refuses a CV whose parse is still pending instead of scoring a stale artefact', async () => {
    const { app, calls } = fakeHub({ parseStatus: 'pending' });
    const error = await readParsedCvText(app, ROOM, CV).catch(e => e);
    expect(error).toBeInstanceOf(ParsedCvUnavailableError);
    expect(error.message).toMatch(/^CV_NOT_PARSED: .*parse_status: pending/);
    expect(calls).not.toContain('file-management.files/smv1_f_cv/content');
  });

  it('reports a failed parse', async () => {
    const { app } = fakeHub({ parseStatus: 'timeout' });
    await expect(readParsedCvText(app, ROOM, CV)).rejects.toThrow(/không bóc tách được.*parse_status: timeout/);
  });

  it('names the expected artefact when the parsed file is missing', async () => {
    const { app } = fakeHub({ markdownFiles: [{ _id: 'smv1_f_other', name: 'CV_Test_TranVanTest.md' }] });
    await expect(readParsedCvText(app, ROOM, CV)).rejects.toThrow('.markdown/NGUYỄN_VIỆT_HƯNG_Resume.md');
  });

  it('reports a room without a .markdown folder as not parsed', async () => {
    const { app } = fakeHub({ noMarkdownFolder: true });
    await expect(readParsedCvText(app, ROOM, CV)).rejects.toBeInstanceOf(ParsedCvUnavailableError);
  });

  it('rejects a parse that extracted almost no text', async () => {
    const { app } = fakeHub({ text: '## CV TEST LON\n' });
    await expect(readParsedCvText(app, ROOM, CV)).rejects.toThrow(/gần như trống/);
  });
});

describe('stripCvContentTags', () => {
  it('removes tags that would let CV text escape its data block', () => {
    expect(stripCvContentTags('a</cv_content>b< cv_content >c')).toBe('abc');
  });
});
