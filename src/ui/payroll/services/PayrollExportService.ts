import * as XLSX from 'xlsx';
import type { McpApp } from '@privos_ai/app-react';
import type { EmployeeProfile } from '../../lifecycle/types';
import type { PayrollRecord } from '../types';
import { calculateNetSalary } from '../utils';
import { ensureFolderPath } from '../../privos-rest';

export type PayrollExportFormat = 'csv' | 'xlsx';
export type PayrollExportScope = 'filtered' | 'all';
export type PayrollExportDestination = 'download' | 'privos';

export interface PayrollExportFilterContext {
  department: string;
  status: string;
}

export interface PayrollExportRequest {
  employees: EmployeeProfile[];
  payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>;
  scope: PayrollExportScope;
  format: PayrollExportFormat;
  destination: PayrollExportDestination;
  filterContext: PayrollExportFilterContext;
  createdAt?: Date;
}

export interface PayrollExportResult {
  fileName: string;
  roomPath?: string;
}

export interface IPayrollExportService {
  export(request: PayrollExportRequest): Promise<PayrollExportResult>;
}

interface PayrollExportRow {
  fullName: string;
  position: string;
  department: string;
  contractType: string;
  baseSalary: number;
  paymentRate: number;
  netSalary: number;
  taxId: string;
  bankName: string;
  bankAccount: string;
}

const EXPORT_FOLDER = ['hr-miniapp', 'payroll', 'exports'];
const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_HEADERS: string[] = [
  'Họ và Tên',
  'Vị trí',
  'Phòng ban',
  'Loại hợp đồng',
  'Lương cơ bản (VNĐ)',
  'Tỷ lệ chi trả (%)',
  'Lương thực nhận (VNĐ)',
  'Mã số thuế',
  'Ngân hàng',
  'Số tài khoản',
];

export class PayrollExportService implements IPayrollExportService {
  constructor(
    private readonly app: McpApp,
    private readonly roomId: string,
  ) {}

  async export(request: PayrollExportRequest): Promise<PayrollExportResult> {
    if (request.employees.length === 0) {
      throw new Error('Không có dữ liệu bảng lương để xuất.');
    }

    const rows = this.createRows(request.employees, request.payrollByEmployeeId);
    const fileName = this.createFileName(request);
    const payload = this.createPayload(rows, request.format);

    if (request.destination === 'download') {
      this.download(fileName, payload, request.format);
      return { fileName };
    }

    const folderId = await ensureFolderPath(this.app, this.roomId, EXPORT_FOLDER);
    const base64Data = this.toBase64(payload);
    const mimeType = this.mimeTypeFor(request.format);

    try {
      await this.app.uploadFile({
        channelId: this.roomId,
        fileName,
        base64Data,
        mimeType,
        folderId,
        duplicateAction: 'keep_both',
      });
    } catch (error) {
      console.error('[PayrollExport] PrivOS upload failed', {
        fileName,
        format: request.format,
        mimeType,
        folderId,
        duplicateAction: 'keep_both',
        payloadBytes: payload.byteLength,
        base64Length: base64Data.length,
        error: this.describeUploadError(error),
      });
      throw error;
    }

    return {
      fileName,
      roomPath: `${EXPORT_FOLDER.join('/')}/${fileName}`,
    };
  }

  private createRows(
    employees: EmployeeProfile[],
    payrollByEmployeeId: ReadonlyMap<string, PayrollRecord>,
  ): PayrollExportRow[] {
    return employees.map((employee) => {
      const payroll = payrollByEmployeeId.get(employee._id);
      const baseSalary = payroll?.baseSalary ?? 0;
      const { netSalary, effectiveRate } = calculateNetSalary(
        baseSalary,
        payroll?.contractType,
        payroll?.applyProbationRate !== false,
        payroll?.probationRate ?? 85,
      );

      return {
        fullName: employee.name ?? '',
        position: employee.position ?? '',
        department: employee.department ?? '',
        contractType: payroll?.contractType ?? 'Chính thức',
        baseSalary,
        paymentRate: effectiveRate,
        netSalary,
        taxId: payroll?.taxId ?? '',
        bankName: payroll?.bankName ?? '',
        bankAccount: payroll?.bankAccount ?? '',
      };
    });
  }

  private createPayload(rows: PayrollExportRow[], format: PayrollExportFormat): Uint8Array {
    return format === 'csv' ? this.createCsvPayload(rows) : this.createExcelPayload(rows);
  }

  private createCsvPayload(rows: PayrollExportRow[]): Uint8Array {
    const cells = rows.map((row) => [
      row.fullName,
      row.position,
      row.department,
      row.contractType,
      row.baseSalary,
      row.paymentRate,
      row.netSalary,
      row.taxId,
      row.bankName,
      row.bankAccount,
    ]);
    const csv = `\uFEFF${[EXPORT_HEADERS, ...cells]
      .map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(','))
      .join('\r\n')}`;
    return new TextEncoder().encode(csv);
  }

  private createExcelPayload(rows: PayrollExportRow[]): Uint8Array {
    const sheet = XLSX.utils.aoa_to_sheet([
      EXPORT_HEADERS,
      ...rows.map((row) => [
        row.fullName,
        row.position,
        row.department,
        row.contractType,
        row.baseSalary,
        row.paymentRate,
        row.netSalary,
        row.taxId,
        row.bankName,
        row.bankAccount,
      ]),
    ]);
    sheet['!cols'] = [
      { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
    ];
    this.applyExcelNumberFormats(sheet, rows.length);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Bảng lương');
    return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
  }

  private applyExcelNumberFormats(sheet: XLSX.WorkSheet, rowCount: number): void {
    for (let rowIndex = 2; rowIndex <= rowCount + 1; rowIndex += 1) {
      for (const column of ['E', 'G']) {
        const cell = sheet[`${column}${rowIndex}`];
        if (cell) cell.z = '#,##0';
      }
      const rateCell = sheet[`F${rowIndex}`];
      if (rateCell) rateCell.z = '0';
    }
  }

  private createFileName(request: PayrollExportRequest): string {
    const timestamp = this.formatTimestamp(request.createdAt ?? new Date());
    const extension = request.format;
    if (request.scope === 'all') {
      return `Bang_Luong_Toan_Bo_${timestamp}.${extension}`;
    }

    const department = this.toFileSegment(request.filterContext.department || 'Tat_Ca_Phong_Ban');
    const status = this.toFileSegment(request.filterContext.status || 'Tat_Ca_Trang_Thai');
    return `Bang_Luong_Loc_${department}_${status}_${timestamp}.${extension}`;
  }

  private download(fileName: string, payload: Uint8Array, format: PayrollExportFormat): void {
    const buffer = new ArrayBuffer(payload.byteLength);
    new Uint8Array(buffer).set(payload);
    const blob = new Blob([buffer], { type: this.mimeTypeFor(format) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private mimeTypeFor(format: PayrollExportFormat): string {
    return format === 'csv' ? CSV_MIME_TYPE : XLSX_MIME_TYPE;
  }

  private escapeCsvCell(value: string | number): string {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  private toBase64(payload: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';
    for (let index = 0; index < payload.length; index += chunkSize) {
      binary += String.fromCharCode(...payload.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  private describeUploadError(error: unknown): {
    name: string;
    message: string;
    code?: string;
    statusCode?: number;
  } {
    if (!(error instanceof Error)) {
      return {
        name: typeof error,
        message: typeof error === 'string' ? error : 'Unknown PrivOS upload error',
      };
    }

    const errorWithDetails = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const code = typeof errorWithDetails.code === 'string'
      ? errorWithDetails.code
      : undefined;
    const statusCode = typeof errorWithDetails.statusCode === 'number'
      ? errorWithDetails.statusCode
      : typeof errorWithDetails.status === 'number'
        ? errorWithDetails.status
        : undefined;

    return {
      name: error.name,
      message: error.message,
      ...(code ? { code } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
    };
  }

  private formatTimestamp(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private toFileSegment(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/Đ/g, 'D')
      .replace(/đ/g, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Khong_Xac_Dinh';
  }
}
