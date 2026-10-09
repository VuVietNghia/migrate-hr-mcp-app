import { describe, expect, it } from 'vitest';

import {
  AppDbRecruitmentJobFileRepository,
  RECRUITMENT_JOB_FILES_COLLECTION,
} from '../src/ui/recruitment/recruitment-job-file-repository';

type Call = { name: string; arguments?: Record<string, unknown> };
type Row = Record<string, unknown> & { _id: string };

const ok = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: 'text', text: message }] });

function createDb(registered = true) {
  const calls: Call[] = [];
  const rows: Row[] = [];
  let exists = registered;
  const app = {
    async callServerTool(call: Call) {
      calls.push(call);
      const args = call.arguments ?? {};
      if (call.name === 'mcpapp.db.registerCollection') {
        if (exists) return fail('Collection is already registered');
        exists = true;
        return ok({});
      }
      if (!exists) return fail(`Collection "${RECRUITMENT_JOB_FILES_COLLECTION}" not found`);
      if (call.name === 'mcpapp.db.query') {
        const where = args.where as Array<{ field: string; value: string }>;
        return ok({ records: rows.filter((row) => where.every((item) => row[item.field] === item.value)) });
      }
      if (call.name === 'mcpapp.db.create') {
        const row = { _id: `row-${rows.length + 1}`, ...(args.data as object) };
        rows.push(row);
        return ok(row);
      }
      if (call.name === 'mcpapp.db.update') {
        const row = rows.find((item) => item._id === args.id)!;
        Object.assign(row, args.data);
        return ok(row);
      }
      throw new Error(`Unexpected call ${call.name}`);
    },
  };
  return { app: app as never, calls, rows };
}

const metadata = {
  fileId: 'file-1',
  fileName: 'role.pdf',
  departmentKey: 'it',
  source: 'uploaded' as const,
  createdAt: '2026-10-09T02:00:00.000Z',
};

describe('AppDbRecruitmentJobFileRepository', () => {
  it('returns an empty list for a missing collection without registering it', async () => {
    const { app, calls } = createDb(false);
    await expect(new AppDbRecruitmentJobFileRepository(app, 'room-1').list()).resolves.toEqual([]);
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.db.query']);
  });

  it('registers the exact room schema on first upsert and creates the row', async () => {
    const { app, calls, rows } = createDb(false);
    await new AppDbRecruitmentJobFileRepository(app, 'room-1').upsert(metadata);
    const registration = calls.find((call) => call.name === 'mcpapp.db.registerCollection')!;
    expect(registration.arguments).toMatchObject({
      collection: RECRUITMENT_JOB_FILES_COLLECTION,
      scope: 'room',
      indexes: [{ fields: { roomId: 1, fileId: 1 }, unique: true }],
    });
    expect(rows[0]).toMatchObject({ roomId: 'room-1', ...metadata });
  });

  it('updates by stable roomId and fileId identity', async () => {
    const { app, rows } = createDb();
    const repository = new AppDbRecruitmentJobFileRepository(app, 'room-1');
    await repository.upsert(metadata);
    await repository.upsert({ ...metadata, fileName: 'renamed.pdf', departmentKey: 'marketing' });
    expect(rows).toHaveLength(1);
    await expect(repository.list()).resolves.toEqual([{ ...metadata, fileName: 'renamed.pdf', departmentKey: 'marketing' }]);
  });

  it('strictly parses valid uploaded rows and isolates rooms', async () => {
    const { app, rows } = createDb();
    rows.push(
      { _id: 'a', roomId: 'room-1', ...metadata },
      { _id: 'b', roomId: 'room-2', ...metadata, fileId: 'file-2' },
      { _id: 'bad', roomId: 'room-1', ...metadata, source: 'manual' },
    );
    await expect(new AppDbRecruitmentJobFileRepository(app, 'room-1').list()).resolves.toEqual([metadata]);
    await expect(new AppDbRecruitmentJobFileRepository(app, 'room-2').list()).resolves.toEqual([{ ...metadata, fileId: 'file-2' }]);
  });

  it('rejects invalid metadata before writing', async () => {
    const { app, calls } = createDb();
    await expect(new AppDbRecruitmentJobFileRepository(app, 'room-1').upsert({ ...metadata, fileId: '' })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('rejects a malformed query response containing another room', async () => {
    const app = {
      callServerTool: async () => ok({ records: [{ _id: 'bad', roomId: 'room-2', ...metadata }] }),
    } as never;
    await expect(new AppDbRecruitmentJobFileRepository(app, 'room-1').list()).resolves.toEqual([]);
  });
});
