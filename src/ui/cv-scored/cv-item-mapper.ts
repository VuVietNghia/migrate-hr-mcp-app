import type { CVProfile } from './CVScoredTab';
import { wasInviteMailSent } from './invite-mail-persistence';

export interface MappedBoardCVs {
  cvs: CVProfile[];
  /** Bản sao stagesMap đầu vào, cộng các stage đoán theo phân loại cho stageId chưa biết. */
  stagesMap: Record<string, string>;
}

/**
 * Item Hub -> thẻ CV. Dùng chung cho lần tải đầu (loadData) và mỗi lần poll, để poll làm mới
 * được cả thẻ mới, thẻ bị xoá và mọi field chứ không chỉ cột.
 * stagesMap đầu vào không bị sửa: stage đoán được ghi vào bản sao trả về, và các item phía sau
 * trong cùng lần gọi dùng lại stage đã đoán, giống hành vi cũ trong loadData.
 */
export function mapItemsToCVProfiles(
  // Item thô từ mcpapp.lists.getItems: Hub không có kiểu cho payload, customFields có thể là mảng
  // hoặc object tuỳ phiên bản Hub.
  items: ReadonlyArray<any>,
  fieldsMap: Readonly<Record<string, string>>,
  stagesMap: Readonly<Record<string, string>>,
): MappedBoardCVs {
  const sMap: Record<string, string> = { ...stagesMap };

  const cvs: CVProfile[] = items.map((item: any) => {
    let score, category, reason, email, sdt;
    const inviteMailSent = wasInviteMailSent(item.customFields);
    if (Array.isArray(item.customFields)) {
      item.customFields.forEach((cf: any) => {
        const fieldIdStr = cf.fieldId || cf.fieldDefinitionId;
        const fieldName = (fieldsMap[fieldIdStr] || fieldIdStr || '').toLowerCase();
        if (fieldName.includes('tổng điểm') || fieldName.includes('tong_diem') || fieldName.includes('điểm')) score = cf.value;
        else if (fieldName.includes('phân loại') || fieldName.includes('phan_loai') || fieldName.includes('loại')) category = cf.value;
        else if (fieldName.includes('lý do') || fieldName.includes('ly_do') || fieldName.includes('nhận xét')) reason = cf.value;
        else if (fieldName.includes('email') || fieldName.includes('thu_dien_tu')) email = cf.value;
        else if (fieldName.includes('sdt') || fieldName.includes('sđt') || fieldName.includes('phone') || fieldName.includes('điện thoại')) sdt = cf.value;
      });
    } else if (item.customFields && typeof item.customFields === 'object') {
      Object.keys(item.customFields).forEach(key => {
        const fieldName = (fieldsMap[key] || key || '').toLowerCase();
        const val = item.customFields[key];
        if (fieldName.includes('tổng điểm') || fieldName.includes('tong_diem') || fieldName.includes('điểm')) score = val;
        else if (fieldName.includes('phân loại') || fieldName.includes('phan_loai') || fieldName.includes('loại')) category = val;
        else if (fieldName.includes('lý do') || fieldName.includes('ly_do') || fieldName.includes('nhận xét')) reason = val;
        else if (fieldName.includes('email') || fieldName.includes('thu_dien_tu')) email = val;
        else if (fieldName.includes('sdt') || fieldName.includes('sđt') || fieldName.includes('phone') || fieldName.includes('điện thoại')) sdt = val;
      });
    }

    // Fallback: scanner for candidate email if not present in customFields
    const textToScan = `${item.name || ''} ${item.title || ''} ${reason || ''} ${item.description || ''}`;
    if (!email) {
      const gmailMatch = textToScan.match(/[a-zA-Z0-9._%+-]+@gmail\.com/i);
      if (gmailMatch) {
        email = gmailMatch[0].toLowerCase();
      } else {
        const generalMatch = textToScan.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
        if (generalMatch) {
          email = generalMatch[0].toLowerCase();
        }
      }
    }

    if (!sdt) {
      const phoneMatch = textToScan.match(/(?:\+84|84|0)[35789][0-9\s\.\-]{8,12}\b/);
      if (phoneMatch) {
        sdt = phoneMatch[0].replace(/[^\d+]/g, '');
      }
    }

    // Fallback deduce stageId if sMap is missing this specific stageId
    if (!sMap[item.stageId] && item.stageId && category) {
      const normalized = String(category || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D').trim();
      if (normalized.includes('SAI JD')) {
        sMap[item.stageId] = '06_Sai_JD';
      } else if (normalized.includes('KHONG DAT') || normalized.includes('KHONG TUYEN')) {
        sMap[item.stageId] = '02_Loai_CV';
      } else if (normalized.includes('DAT') || normalized.includes('CAN NHAC')) {
        sMap[item.stageId] = '03_Tiem_Nang';
      } else {
        sMap[item.stageId] = '01_Dau_Vao';
      }
    }

    return {
      _id: item._id || item.id,
      name: item.name || item.title || 'Không tên',
      status: sMap[item.stageId] || item.stage || item.status || '01_Dau_Vao',
      score,
      category,
      reason,
      email: email || '',
      sdt: sdt || '',
      customFields: item.customFields,
      inviteMailSent,
    };
  });

  return { cvs, stagesMap: sMap };
}
