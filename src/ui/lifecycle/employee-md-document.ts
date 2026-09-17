/**
 * Đọc và sinh lại file hồ sơ nhân sự dạng Markdown.
 *
 * File được sinh từ `src/ui/data/employee_template.md` — 23 chỗ trống `[TÊN]`. Module
 * này thuần: không chạm `app`, nhận template làm tham số để test được mà không cần
 * dựng môi trường Vite.
 *
 * Template dùng CRLF, nên mọi phép tách dòng ở đây dùng `/\r?\n/`.
 */

export interface EmployeeMdDocument {
  localId: string;
  createDate: string;
  fullName: string;
  position: string;
  department: string;
  startDate: string;
  phone: string;
  email: string;
  telegram: string;
  emergency: string;
  dob: string;
  idNumber: string;
  idDate: string;
  idPlace: string;
  permAddress: string;
  curAddress: string;
  bankAccount: string;
  bankName: string;
  taxCode: string;
  socialInsurance: string;
  vehicleType: string;
  vehiclePlate: string;
  imageLink: string;
}

export interface ParsedEmployeeMd {
  doc: EmployeeMdDocument;
  /** Nhãn tiếng Việt của những trường không đọc được, để UI cảnh báo trước khi ghi đè. */
  missingLabels: string[];
}

export const EMPLOYEE_MD_HEADER = '# HỒ SƠ NHÂN SỰ';

const IMAGE_LINK_ANCHOR = '*Ảnh chụp giấy tờ/Chân dung (nếu có):*';

const PLACEHOLDERS: ReadonlyArray<readonly [string, keyof EmployeeMdDocument]> = [
  ['[LOCAL_ID]', 'localId'],
  ['[CREATE_DATE]', 'createDate'],
  ['[FULL_NAME]', 'fullName'],
  ['[POSITION]', 'position'],
  ['[DEPARTMENT]', 'department'],
  ['[START_DATE]', 'startDate'],
  ['[PHONE]', 'phone'],
  ['[EMAIL]', 'email'],
  ['[TELEGRAM]', 'telegram'],
  ['[EMERGENCY]', 'emergency'],
  ['[DOB]', 'dob'],
  ['[ID_NUMBER]', 'idNumber'],
  ['[ID_DATE]', 'idDate'],
  ['[ID_PLACE]', 'idPlace'],
  ['[PERM_ADDRESS]', 'permAddress'],
  ['[CUR_ADDRESS]', 'curAddress'],
  ['[BANK_ACCOUNT]', 'bankAccount'],
  ['[BANK_NAME]', 'bankName'],
  ['[TAX_CODE]', 'taxCode'],
  ['[SOCIAL_INSURANCE]', 'socialInsurance'],
  ['[VEHICLE_TYPE]', 'vehicleType'],
  ['[VEHICLE_PLATE]', 'vehiclePlate'],
  ['[IMAGE_LINK]', 'imageLink'],
];

/** Nhãn của những dòng chỉ chứa đúng một giá trị, theo đúng thứ tự trong template. */
const SIMPLE_LABELS: ReadonlyArray<readonly [string, keyof EmployeeMdDocument]> = [
  ['Mã nhân sự', 'localId'],
  ['Ngày tạo hồ sơ', 'createDate'],
  ['Họ và Tên', 'fullName'],
  ['Vị trí công việc', 'position'],
  ['Phòng ban', 'department'],
  ['Ngày bắt đầu làm việc', 'startDate'],
  ['Số điện thoại', 'phone'],
  ['Email công việc', 'email'],
  ['Telegram', 'telegram'],
  ['Liên hệ khẩn cấp', 'emergency'],
  ['Ngày sinh', 'dob'],
  ['Địa chỉ thường trú', 'permAddress'],
  ['Chỗ ở hiện tại', 'curAddress'],
  ['Mã số thuế (PIT)', 'taxCode'],
  ['Sổ BHXH', 'socialInsurance'],
];

/**
 * Nhóm cuối tham lam (`(.*)` chứ không phải `(.*?)`) để nơi cấp chứa được dấu `)`:
 * "Cuc CS (QLHC)" vẫn phải về nguyên vẹn.
 */
const ID_LINE = /^(.*?)\s*\(Cấp ngày:\s*(.*?)\s*tại\s*(.*)\)$/;
const VEHICLE_LINE = /^(.*?)\s*\(Biển số:\s*(.*)\)$/;

export function createEmptyEmployeeMdDocument(): EmployeeMdDocument {
  return {
    localId: '',
    createDate: '',
    fullName: '',
    position: '',
    department: '',
    startDate: '',
    phone: '',
    email: '',
    telegram: '',
    emergency: '',
    dob: '',
    idNumber: '',
    idDate: '',
    idPlace: '',
    permAddress: '',
    curAddress: '',
    bankAccount: '',
    bankName: '',
    taxCode: '',
    socialInsurance: '',
    vehicleType: '',
    vehiclePlate: '',
    imageLink: '',
  };
}

/**
 * Thay chỗ trống bằng hàm replacer chứ không phải chuỗi, trong MỘT lần quét template.
 * `String.replace` với chuỗi thay thế sẽ diễn giải `$&`, `$1`... thành pattern, nên
 * một địa chỉ hay tên chứa `$` sẽ bị biến dạng. Single-pass regex /\[[A-Z_]+\]/g
 * đảm bảo text thay thế không bị quét lại: "[CUR_ADDRESS]" trong permAddress sẽ
 * không bị thay thế khi xử lý [CUR_ADDRESS] placeholder.
 */
export function renderEmployeeMd(doc: EmployeeMdDocument, template: string): string {
  const tokenToKey = new Map(PLACEHOLDERS);
  return template.replace(/\[[A-Z_]+\]/g, (match) => {
    const key = tokenToKey.get(match);
    return key ? (doc[key] ?? '') : match;
  });
}

/**
 * Phần còn lại của dòng sau `**Nhãn:**`, đã bỏ đúng MỘT khoảng trắng phân cách.
 * CHỈ chấp nhận dòng bắt đầu bằng marker hoặc "- " + marker (template có cả hai format).
 * Không `indexOf()`: một giá trị chứa "**Nhãn:**" sẽ không bị nhầm với trường khác.
 *
 * Không `trim()` ở đây: dòng ngân hàng khi cả hai giá trị đều rỗng là ` - `, mà
 * `trim()` biến nó thành `-` và làm mất dấu tách.
 */
function readLabelBody(lines: string[], label: string): string | undefined {
  const marker = `**${label}:**`;
  const dashMarker = `- ${marker}`;
  for (const line of lines) {
    let rest: string | undefined;
    if (line.startsWith(marker)) {
      rest = line.slice(marker.length);
    } else if (line.startsWith(dashMarker)) {
      rest = line.slice(dashMarker.length);
    } else {
      continue;
    }
    return rest.startsWith(' ') ? rest.slice(1) : rest;
  }
  return undefined;
}

export function parseEmployeeMd(text: string): ParsedEmployeeMd | null {
  if (!text.includes(EMPLOYEE_MD_HEADER)) return null;

  const lines = text.split(/\r?\n/);
  const doc = createEmptyEmployeeMdDocument();
  const missingLabels: string[] = [];

  for (const [label, key] of SIMPLE_LABELS) {
    const body = readLabelBody(lines, label);
    if (body === undefined) {
      missingLabels.push(label);
      continue;
    }
    doc[key] = body.trim();
  }

  const idBody = readLabelBody(lines, 'Số CMND/CCCD');
  const idMatch = idBody === undefined ? null : ID_LINE.exec(idBody);
  if (idMatch) {
    doc.idNumber = idMatch[1].trim();
    doc.idDate = idMatch[2].trim();
    doc.idPlace = idMatch[3].trim();
  } else {
    missingLabels.push('Số CMND/CCCD');
    if (idBody !== undefined) doc.idNumber = idBody.trim();
  }

  const vehicleBody = readLabelBody(lines, 'Phương tiện đi lại');
  const vehicleMatch = vehicleBody === undefined ? null : VEHICLE_LINE.exec(vehicleBody);
  if (vehicleMatch) {
    doc.vehicleType = vehicleMatch[1].trim();
    doc.vehiclePlate = vehicleMatch[2].trim();
  } else {
    missingLabels.push('Phương tiện đi lại');
    if (vehicleBody !== undefined) doc.vehicleType = vehicleBody.trim();
  }

  // Tách ở ` - ` ĐẦU TIÊN: số tài khoản không chứa dấu gạch, còn tên ngân hàng thì
  // có ("Techcombank - Chi nhanh Q1"), nên tách ở lần cuối hoặc tách hết là sai.
  const bankBody = readLabelBody(lines, 'Số tài khoản NH');
  const bankSep = bankBody === undefined ? -1 : bankBody.indexOf(' - ');
  if (bankBody !== undefined && bankSep !== -1) {
    doc.bankAccount = bankBody.slice(0, bankSep).trim();
    doc.bankName = bankBody.slice(bankSep + 3).trim();
  } else {
    missingLabels.push('Số tài khoản NH');
    if (bankBody !== undefined) doc.bankAccount = bankBody.trim();
  }

  const anchorIdx = lines.findIndex(line => line.trim() === IMAGE_LINK_ANCHOR);
  if (anchorIdx !== -1 && anchorIdx + 1 < lines.length) {
    doc.imageLink = lines[anchorIdx + 1].trim();
  }

  return { doc, missingLabels };
}
