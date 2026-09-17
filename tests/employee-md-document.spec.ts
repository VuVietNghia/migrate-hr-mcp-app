import { describe, expect, it } from 'vitest';
import employeeTemplateRaw from '../src/ui/data/employee_template.md?raw';
import {
  EmployeeMdDocument,
  createEmptyEmployeeMdDocument,
  parseEmployeeMd,
  renderEmployeeMd,
} from '../src/ui/lifecycle/employee-md-document';

function filledDoc(): EmployeeMdDocument {
  return {
    localId: 'NV123456',
    createDate: '16/9/2026',
    fullName: 'Nguyen Van A',
    position: 'Developer',
    department: 'IT',
    startDate: '2026-09-01',
    phone: '0901234567',
    email: 'a@example.com',
    telegram: '@nva',
    emergency: 'Vo - 0988888888',
    dob: '1995-05-15',
    idNumber: '001095123456',
    idDate: '2020-01-01',
    idPlace: 'Cuc canh sat QLHC',
    permAddress: '123 Duong ABC, Quan 1',
    curAddress: '456 Duong DEF, Quan 3',
    bankAccount: '1903456789',
    bankName: 'Techcombank',
    taxCode: '8392134589',
    socialInsurance: '1234567890',
    vehicleType: 'Honda Airblade',
    vehiclePlate: '59P1-123.45',
    imageLink: '*Chua co anh dinh kem*',
  };
}

describe('renderEmployeeMd', () => {
  it('thay het placeholder, khong con dau ngoac vuong nao sot lai', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw);
    expect(text).not.toMatch(/\[[A-Z_]+\]/);
    expect(text).toContain('**Mã nhân sự:** NV123456');
    expect(text).toContain('- **Họ và Tên:** Nguyen Van A');
  });

  it('khong dien giai $& trong gia tri thanh pattern thay the', () => {
    // `String.replace` voi chuoi thay the se coi `$&` la "toan bo phan khop".
    // Mot dia chi hay ten chua `$` se bi bien dang neu dung chuoi thay vi ham.
    const doc = { ...filledDoc(), permAddress: 'So 1 $& duong $1' };
    const text = renderEmployeeMd(doc, employeeTemplateRaw);
    expect(text).toContain('- **Địa chỉ thường trú:** So 1 $& duong $1');
  });

  it('placeholder trong gia tri khong bi thay the lai', () => {
    // Bug: neu permAddress chua "[CUR_ADDRESS]", loop replace se thay no va khong
    // thay placeholder [CUR_ADDRESS] thuc. Fix: single pass.
    const doc = { ...filledDoc(), permAddress: 'So 1 [CUR_ADDRESS] duong' };
    const text = renderEmployeeMd(doc, employeeTemplateRaw);
    expect(text).toContain('- **Địa chỉ thường trú:** So 1 [CUR_ADDRESS] duong');
    expect(text).toContain('- **Chỗ ở hiện tại:** 456 Duong DEF, Quan 3');
    // Round-trip
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc).toEqual(doc);
  });
});

describe('parseEmployeeMd', () => {
  it('doc lai dung tung truong tu van ban da render', () => {
    const doc = filledDoc();
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed).not.toBeNull();
    expect(parsed!.doc).toEqual(doc);
    expect(parsed!.missingLabels).toEqual([]);
  });

  it('round-trip: render(parse(x)) tra ve dung x', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw);
    const parsed = parseEmployeeMd(text);
    expect(renderEmployeeMd(parsed!.doc, employeeTemplateRaw)).toBe(text);
  });

  it('round-trip van dung khi moi truong deu rong', () => {
    // Truong hop nay la bay: dong ngan hang rong se thanh ` - `, neu trim truoc khi
    // tach thi mat dau tach va hai truong bi gop lam mot.
    const empty = createEmptyEmployeeMdDocument();
    const text = renderEmployeeMd(empty, employeeTemplateRaw);
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc).toEqual(empty);
    expect(renderEmployeeMd(parsed!.doc, employeeTemplateRaw)).toBe(text);
  });

  it('tra null khi van ban khong phai ho so theo mau', () => {
    // Quan trong: form sua render lai TOAN BO tu template, nen mo form tren mot file
    // khong doc duoc se xoa sach file do khi bam luu. Phai chan ngay tu day.
    expect(parseEmployeeMd('# Ghi chu linh tinh\nmot hai ba')).toBeNull();
    expect(parseEmployeeMd('')).toBeNull();
  });

  it('tach dung ten ngan hang co chua dau gach ngang', () => {
    const doc = { ...filledDoc(), bankName: 'Techcombank - Chi nhanh Q1' };
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed!.doc.bankAccount).toBe('1903456789');
    expect(parsed!.doc.bankName).toBe('Techcombank - Chi nhanh Q1');
  });

  it('tach dung noi cap CCCD co chua dau ngoac don', () => {
    const doc = { ...filledDoc(), idPlace: 'Cuc CS (QLHC)' };
    const parsed = parseEmployeeMd(renderEmployeeMd(doc, employeeTemplateRaw));
    expect(parsed!.doc.idNumber).toBe('001095123456');
    expect(parsed!.doc.idDate).toBe('2020-01-01');
    expect(parsed!.doc.idPlace).toBe('Cuc CS (QLHC)');
  });

  it('bao ten nhan khong doc duoc thay vi am tham tra ve rong', () => {
    // File co H1 nhung thieu dong: nguoi dung phai duoc canh bao truoc khi luu,
    // vi luu se ghi chuoi rong de len truong do.
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw)
      .split(/\r?\n/)
      .filter(line => !line.includes('**Sổ BHXH:**') && !line.includes('**Telegram:**'))
      .join('\r\n');
    const parsed = parseEmployeeMd(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.missingLabels).toEqual(['Telegram', 'Sổ BHXH']);
    expect(parsed!.doc.socialInsurance).toBe('');
    expect(parsed!.doc.fullName).toBe('Nguyen Van A');
  });

  it('doc duoc file dung LF thay vi CRLF', () => {
    const text = renderEmployeeMd(filledDoc(), employeeTemplateRaw).replace(/\r\n/g, '\n');
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc.vehiclePlate).toBe('59P1-123.45');
    expect(parsed!.missingLabels).toEqual([]);
  });

  it('nhan hang trong gia tri khong bi misparse thanh nhan khac', () => {
    // Bug: readLabelBody dung indexOf, nen fullName chua "**Vị trí công việc:**"
    // se bi nhap nhan thanh position. Fix: check line.startsWith(marker).
    const doc = { ...filledDoc(), fullName: 'Nguyen Van A**Vị trí công việc:** Fake' };
    const text = renderEmployeeMd(doc, employeeTemplateRaw);
    const parsed = parseEmployeeMd(text);
    expect(parsed!.doc).toEqual(doc);
    expect(parsed!.missingLabels).toEqual([]);
  });
});
