import { describe, expect, it } from 'vitest';
import { ensureTemplatesExistGlobal } from '../src/ui/pipeline-service';

const ROOM = 'room-1';
const ALL_SKILLS = [
  'cv_processing_guidelines.md',
  'cv_md_template.md',
  'sang_loc_cv.md',
  'cv-evaluator-skill.md',
  'jd_template.md',
  'jd-generator-skill.md',
];
const APP_FOLDERS = ['raws-cv', 'outputs-cv', 'skills', 'jds', 'company'];

const toolText = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

/** A room whose `hr-miniapp/skills` folder holds `skillFiles`, recording every write the sync makes. */
function fakeRoom(options: { skillFiles?: Array<{ name: string; file_size?: number }>; failSkillListing?: boolean; noSkillsFolder?: boolean } = {}) {
  const uploads: string[] = [];
  const createdFolders: string[] = [];
  const childFolders = APP_FOLDERS.filter(name => !(options.noSkillsFolder && name === 'skills'));
  const app = {
    callServerTool: async ({ name, arguments: args }: { name: string; arguments: any }) => {
      if (name === 'mcpapp.folders.getByChannel') {
        if (!args.parentId) return toolText([{ _id: 'f-hr', name: 'hr-miniapp' }]);
        if (args.parentId === 'f-hr') return toolText(childFolders.map(folder => ({ _id: `f-${folder}`, name: folder })));
        return toolText([]);
      }
      if (name === 'mcpapp.files.getByChannel') {
        if (options.failSkillListing) throw new Error('Hub unavailable');
        return toolText(options.skillFiles ?? ALL_SKILLS.map(file => ({ name: file, file_size: 1000 })));
      }
      if (name === 'mcpapp.folders.create') {
        createdFolders.push(args.name);
        return toolText({ _id: `new-${args.name}`, name: args.name });
      }
      throw new Error(`Unexpected tool ${name}`);
    },
    uploadFile: async ({ fileName }: { fileName: string }) => {
      uploads.push(fileName);
      return { file: { _id: `u-${fileName}` } };
    },
  } as any;
  return { app, uploads, createdFolders };
}

describe('ensureTemplatesExistGlobal', () => {
  it('uploads nothing when every skill file already exists', async () => {
    const room = fakeRoom();
    await ensureTemplatesExistGlobal(room.app, ROOM);
    expect(room.uploads).toEqual([]);
    expect(room.createdFolders).toEqual([]);
  });

  it('uploads only the skill files that are missing or empty', async () => {
    const room = fakeRoom({
      skillFiles: [
        { name: 'cv_processing_guidelines.md', file_size: 7792 },
        { name: 'cv_md_template.md', file_size: 0 },
        { name: 'sang_loc_cv.md', file_size: 4007 },
        { name: 'cv-evaluator-skill.md', file_size: 4236 },
        { name: 'jd_template.md', file_size: 948 },
      ],
    });
    await ensureTemplatesExistGlobal(room.app, ROOM);
    expect(room.uploads).toEqual(['cv_md_template.md', 'jd-generator-skill.md']);
  });

  it('uploads every skill file into a newly created skills folder when the folder is missing', async () => {
    const room = fakeRoom({ noSkillsFolder: true });
    await ensureTemplatesExistGlobal(room.app, ROOM);
    expect(room.uploads).toEqual(ALL_SKILLS);
    expect(room.createdFolders).toContain('skills');
  });

  it('uploads nothing when the skills folder cannot be read', async () => {
    const room = fakeRoom({ failSkillListing: true });
    await ensureTemplatesExistGlobal(room.app, ROOM);
    expect(room.uploads).toEqual([]);
  });

  it('shares one run between concurrent callers for the same room', async () => {
    const room = fakeRoom({ skillFiles: [] });
    await Promise.all([ensureTemplatesExistGlobal(room.app, ROOM), ensureTemplatesExistGlobal(room.app, ROOM)]);
    expect(room.uploads).toEqual(ALL_SKILLS);
  });
});
