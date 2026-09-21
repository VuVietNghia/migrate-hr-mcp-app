import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tab = readFileSync(resolve(__dirname, '../src/ui/cv-scored/CVScoredTab.tsx'), 'utf8');
const reader = readFileSync(resolve(__dirname, '../src/ui/cv-scored/cv-list-reader.ts'), 'utf8');
const loader = readFileSync(resolve(__dirname, '../src/ui/cv-scored/cv-board-loader.ts'), 'utf8');

describe('CVScoredTab — poll làm mới đầy đủ board', () => {
  it('lần tải đầu và poll dùng chung một mapper', () => {
    expect(loader).toContain('mapItemsToCVProfiles(items, fMap, sMap)');
    expect(tab).toContain('mapItemsToCVProfiles(items, board.fieldsMap, board.stagesMap)');
  });

  it('poll đọc toàn bộ item, không còn chỉ đọc cột', () => {
    expect(tab).not.toContain('readBoardStatuses');
    expect(reader).not.toContain('readBoardStatuses');
    expect(tab).toContain('await fetchScreeningListItems(app, board.listId)');
  });

  it('chỉ thay board khi có khác biệt', () => {
    expect(tab).toContain('areCvListsEqual(board.cvs, snapshot.cvs)');
    expect(tab).toContain('areStageMapsEqual(board.stagesMap, snapshot.stagesMap)');
  });

  it('luồng gửi mail mời chặn poll trong lúc ghi', () => {
    expect(tab).toContain('pollingGuardRef.current.beginMove(inviteCvId)');
    expect(tab).toContain('pollingGuardRef.current.endMove(inviteCvId)');
  });
});

describe('CVScoredTab — list bị xoá ngoài app', () => {
  it('poll hỏi Hub list nào còn và gỡ board của list đã bị xoá', () => {
    expect(tab).toContain("name: 'mcpapp.lists.getAll'");
    expect(tab).toContain('readScreeningListIds(');
    expect(tab).toContain('splitRemovedBoards(boards, liveIds)');
  });

  it('một list lỗi không chặn cập nhật các board khác', () => {
    expect(tab).toContain('Promise.allSettled(');
  });

  it('báo cho người dùng biết list đã bị xoá', () => {
    expect(tab).toContain('đã bị xoá khỏi Hub nên đã được gỡ khỏi màn hình.');
    expect(tab).toContain('{boardNotice && (');
  });
});

describe('CVScoredTab — list mới tạo trên Hub', () => {
  it('poll dựng board cho list chưa có trên màn hình, dùng chung loader với loadData', () => {
    expect(tab).toContain('findNewLists(liveLists, boards)');
    expect(tab).toContain('loadScreeningBoard(app, list)');
    expect(tab).toContain('loadedBoards.push(await loadScreeningBoard(app, targetList));');
  });

  it('room chưa có board nào vẫn poll để phát hiện list đầu tiên', () => {
    expect(tab).not.toContain('if (!app || boards.length === 0) return;');
  });

  it('báo list mới đã được thêm', () => {
    expect(tab).toContain('vừa được tạo trên Hub.');
  });
});
