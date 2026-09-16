import { describe, expect, it } from 'vitest';
import { redactFileName } from '../src/ui/log-redaction';

describe('redactFileName', () => {
  it('giu thu muc va duoi, xoa ten file', () => {
    expect(redactFileName('room/hr-miniapp/jds/Nguyen Van A_CV.md')).toBe('room/hr-miniapp/jds/***.md');
  });

  it('xu ly ten tran khong co thu muc', () => {
    expect(redactFileName('Nguyen Van A.pdf')).toBe('***.pdf');
  });

  it('xu ly file khong co duoi', () => {
    expect(redactFileName('a/b/NguyenVanA')).toBe('a/b/***');
  });

  it('xu ly dau gach nguoc kieu Windows', () => {
    expect(redactFileName('a\\b\\Nguyen Van A.docx')).toBe('a\\b\\***.docx');
  });

  it('khong bao gio de lot ten nguoi ra ngoai', () => {
    const redacted = redactFileName('outputs-cv/2026-09/02-passed_screening/Tran Thi Bich Ngoc.md');
    expect(redacted).not.toMatch(/Tran|Thi|Bich|Ngoc/);
  });

  it('chiu duoc chuoi rong', () => {
    expect(redactFileName('')).toBe('***');
  });
});
