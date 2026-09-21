import type { CVBoardData } from './CVScoredTab';
import type { ListItemPagingApp } from '../list-item-paging';
import { fetchScreeningListItems } from './cv-list-reader';
import { mapItemsToCVProfiles } from './cv-item-mapper';
import { INVITE_MAIL_SENT_FIELD_ID } from './invite-mail-persistence';

/**
 * Dựng board của một list SCREENING: stage, field, thẻ CV. Dùng chung cho loadData (lần tải đầu,
 * nút Làm mới) và poll (list vừa tạo trên Hub), để list mới hiện lên mà không cần bấm Làm mới.
 * Nếu list chưa có field "Đã gửi mail phỏng vấn" thì thêm vào.
 */
export async function loadScreeningBoard(
  app: ListItemPagingApp,
  // List thô từ mcpapp.lists.getAll: Hub không có kiểu cho payload, stages/fieldDefinitions tuỳ phiên bản.
  targetList: any,
): Promise<CVBoardData> {
  const lId = targetList._id || targetList.id;

  const sMap: Record<string, string> = {};
  const fMap: Record<string, string> = {};
  let hasInviteMailSentField = false;

  try {
    const detailRes: any = await app.callServerTool({
      name: 'mcpapp.lists.get',
      arguments: { listId: lId }
    });
    const detailParsed = JSON.parse(detailRes?.content?.[0]?.text || '{}');

    let stagesArr = detailParsed.stages || detailParsed.list?.stages || targetList.stages || [];

    if (!stagesArr || stagesArr.length === 0) {
      // Try to find the system config item
      const searchRes: any = await app.callServerTool({
        name: 'mcpapp.lists.searchItems',
        arguments: { listId: lId, query: '[Hệ thống] Không xoá' }
      });
      const searchParsed = JSON.parse(searchRes?.content?.[0]?.text || '[]');
      const configItem = searchParsed.find((i: any) => (i.name || i.title || '').includes('[Hệ thống] Không xoá'));
      if (configItem && configItem.description) {
        try { stagesArr = JSON.parse(configItem.description); } catch (e) {}
      }
    }

    if (Array.isArray(stagesArr)) {
      stagesArr.forEach((s: any) => sMap[s._id || s.id] = s.name);
    }

    const fieldsArr = detailParsed.fieldDefinitions || detailParsed.list?.fieldDefinitions || targetList.fieldDefinitions || [];
    if (Array.isArray(fieldsArr)) {
      fieldsArr.forEach((fd: any) => {
        const fieldId = fd._id || fd.id;
        fMap[fieldId] = fd.name;
        if (fieldId === INVITE_MAIL_SENT_FIELD_ID) hasInviteMailSentField = true;
      });

      if (!hasInviteMailSentField) {
        try {
          await app.callServerTool({
            name: 'mcpapp.lists.addField',
            arguments: {
              listId: lId,
              fieldId: INVITE_MAIL_SENT_FIELD_ID,
              name: 'Đã gửi mail phỏng vấn',
              type: 'CHECKBOX',
            },
          });
          fMap[INVITE_MAIL_SENT_FIELD_ID] = 'Đã gửi mail phỏng vấn';
        } catch (fieldError) {
          console.warn('Không thể thêm field trạng thái gửi mail', fieldError);
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch full list details for stages", err);
  }

  const items = await fetchScreeningListItems(app, lId);
  const mapped = mapItemsToCVProfiles(items, fMap, sMap);

  return {
    listId: lId,
    listName: targetList.name,
    stagesMap: mapped.stagesMap,
    fieldsMap: fMap,
    cvs: mapped.cvs,
  };
}
