import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType
} from 'docx';

/**
 * Service xuất file Word (.docx) chuẩn thể thức văn bản hành chính Việt Nam (Nghị định 30/2020/NĐ-CP).
 * Tái tạo chính xác cấu trúc OOXML từ file mẫu Ke_hoach_tri_khai_app_2026.docx:
 * - Khổ giấy A4, Căn lề: Trái 3.0cm, Trên 2.0cm, Dưới 2.0cm, Phải 2.0cm
 * - Font: Times New Roman 13pt/14pt
 * - Header 2 cột không viền (Cơ quan ban hành & Quốc hiệu tiêu ngữ) với đường kẻ trang trí ngắn chuẩn NĐ 30
 * - Căn cứ pháp lý in nghiêng, thụt dòng 1.25cm, chuẩn hóa dấu kết thúc ; và .
 * - Phân cấp đề mục (1., a), - )
 * - Footer 2 cột không viền (Nơi nhận & Chữ ký người có thẩm quyền)
 */
export class DocxExportService {
  /**
   * Tạo Document OOXML từ nội dung văn bản Markdown
   */
  public static createDocumentFromMarkdown(markdownText: string): Document {
    const lines = markdownText.split('\n').map(l => l.trimEnd());
    const docChildren: (Paragraph | Table)[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line) {
        i++;
        continue;
      }

      // 1. Bảng Markdown (Header 2 cột, Footer 2 cột, hoặc Bảng dữ liệu)
      if (line.startsWith('|') && line.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }

        const tableNode = this.parseMarkdownTable(tableLines);
        if (tableNode) {
          docChildren.push(tableNode);
        }
        continue;
      }

      // 2. Tiêu đề chính (# ...)
      if (line.startsWith('# ')) {
        const titleText = line.replace('# ', '').trim();
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 100, line: 300 },
            children: [
              new TextRun({
                text: titleText,
                font: 'Times New Roman',
                size: 28, // 14pt
                bold: true,
                color: '000000'
              })
            ]
          })
        );
        i++;
        continue;
      }

      // 3. Trích yếu hoặc Đề mục cấp 2/3 (## ..., ### ...)
      if (line.startsWith('### ') || line.startsWith('## ')) {
        const subText = line.replace(/^#{2,3}\s+/, '').trim();
        const isSubject = this.isSubjectLine(subText);

        docChildren.push(
          new Paragraph({
            alignment: isSubject ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 100, after: isSubject ? 40 : 100, line: 300 },
            children: [
              new TextRun({
                text: subText,
                font: 'Times New Roman',
                size: 26, // 13pt
                bold: true,
                color: '000000'
              })
            ]
          })
        );

        // Bổ sung đường kẻ trang trí ngắn dưới Trích yếu (dài 1/3 - 1/2 dòng chữ)
        if (isSubject) {
          docChildren.push(this.createDecorativeLineParagraph('subject'));
        }

        i++;
        continue;
      }

      // 4. Đường phân cách ngang (---)
      if (line === '---' || line === '***') {
        i++;
        continue;
      }

      // 5. Khối Căn cứ pháp lý (Tự động gom nhóm & chuẩn hóa dấu kết thúc ; và .)
      if (this.isLegalBasisLine(line)) {
        const rawLegalLines: string[] = [];
        while (i < lines.length && this.isLegalBasisLine(lines[i].trim())) {
          rawLegalLines.push(lines[i].trim());
          i++;
        }

        const normalizedLegalLines = this.normalizeLegalBases(rawLegalLines);
        for (const legalText of normalizedLegalLines) {
          docChildren.push(
            new Paragraph({
              alignment: AlignmentType.BOTH,
              indent: { firstLine: 708 }, // 1.25 cm
              spacing: { before: 30, after: 30, line: 280 },
              children: [
                new TextRun({
                  text: legalText,
                  font: 'Times New Roman',
                  size: 26, // 13pt
                  italics: true,
                  color: '000000'
                })
              ]
            })
          );
        }
        continue;
      }

      // 6. Phân cấp đề mục cấp 2: a), b), c)...
      if (/^[a-z]\)\s+/.test(line)) {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.BOTH,
            indent: { left: 566 }, // 1.0 cm
            spacing: { before: 80, after: 40, line: 300 },
            children: this.parseInlineFormatting(line, { size: 26, font: 'Times New Roman' })
          })
        );
        i++;
        continue;
      }

      // 7. Gạch đầu dòng phụ: - ... hoặc * ...
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const bulletText = line.replace(/^[-*]\s+/, '');
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.BOTH,
            indent: { left: 566, firstLine: 708 }, // Thụt lề phân cấp
            spacing: { before: 40, after: 40, line: 300 },
            children: [
              new TextRun({ text: '- ', font: 'Times New Roman', size: 26 }),
              ...this.parseInlineFormatting(bulletText, { size: 26, font: 'Times New Roman' })
            ]
          })
        );
        i++;
        continue;
      }

      // 8. Ký hiệu kết thúc văn bản ./.
      if (line === './.') {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.BOTH,
            indent: { firstLine: 708 },
            spacing: { before: 100, after: 100, line: 300 },
            children: [
              new TextRun({
                text: './.',
                font: 'Times New Roman',
                size: 26,
                bold: true
              })
            ]
          })
        );
        i++;
        continue;
      }

      // 9. Nơi nhận hoặc Kính gửi
      if (line.startsWith('Kính gửi:') || line.startsWith('**Kính gửi:**')) {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 60, line: 300 },
            children: this.parseInlineFormatting(line, { size: 26, font: 'Times New Roman' })
          })
        );
        i++;
        continue;
      }

      // 10. Đoạn văn thông thường có thụt đầu dòng 1.25cm chuẩn NĐ 30
      docChildren.push(
        new Paragraph({
          alignment: AlignmentType.BOTH,
          indent: { firstLine: 708 }, // 1.25 cm
          spacing: { before: 60, after: 60, line: 300 },
          children: this.parseInlineFormatting(line, { size: 26, font: 'Times New Roman' })
        })
      );
      i++;
    }

    // Build Document với Khổ A4 và căn lề chuẩn Nghị định 30
    return new Document({
      creator: 'PrivOS AI HRM Suite',
      styles: {
        default: {
          document: {
            run: {
              font: 'Times New Roman',
              size: 26, // 13pt
              color: '000000'
            },
            paragraph: {
              spacing: { line: 300, lineRule: 'atLeast' }
            }
          }
        }
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 11905, // A4 Width (210mm)
                height: 16837 // A4 Height (297mm)
              },
              margin: {
                top: 1133, // 2.0 cm
                bottom: 1133, // 2.0 cm
                left: 1700, // 3.0 cm (Lề trái lưu trữ chuẩn)
                right: 1133 // 2.0 cm
              }
            }
          },
          children: docChildren
        }
      ]
    });
  }

  /**
   * Kiểm tra dòng có phải là Căn cứ pháp lý
   */
  public static isLegalBasisLine(line: string): boolean {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('- Căn cứ') ||
      trimmed.startsWith('* Căn cứ') ||
      trimmed.startsWith('Căn cứ') ||
      trimmed.startsWith('Xét đề nghị') ||
      trimmed.startsWith('Theo đề nghị')
    );
  }

  /**
   * Kiểm tra dòng có phải là Trích yếu văn bản
   */
  public static isSubjectLine(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return lower.startsWith('về việc') || lower.startsWith('v/v') || lower.startsWith('(về việc');
  }

  /**
   * Chuẩn hóa danh sách căn cứ pháp lý:
   * - Xóa dấu chấm phẩy, chấm, dấu phẩy thừa ở cuối
   * - Gán dấu chấm phẩy (;) cho các căn cứ từ 0 đến n-2
   * - Gán dấu chấm (.) cho căn cứ cuối cùng (n-1)
   * - Chuẩn hóa tiền tố "- "
   */
  public static normalizeLegalBases(rawLines: string[]): string[] {
    if (rawLines.length === 0) return [];

    return rawLines.map((raw, index) => {
      let content = raw.replace(/^[-*]\s*/, '').trim();
      // Xóa dấu câu thừa ở cuối dòng
      content = content.replace(/[;.,:\s]+$/, '').trim();

      const isLast = index === rawLines.length - 1;
      const endChar = isLast ? '.' : ';';

      // Đảm bảo bắt đầu bằng "- "
      const prefix = content.startsWith('- ') ? '' : '- ';
      return `${prefix}${content}${endChar}`;
    });
  }

  /**
   * Tạo Paragraph chứa đường kẻ trang trí ngắn chuẩn NĐ 30
   */
  public static createDecorativeLineParagraph(type: 'org' | 'motto' | 'subject'): Paragraph {
    let lineStr = '───────'; // Mặc định cho Tên CQ ban hành
    if (type === 'motto') {
      lineStr = '───────────'; // Dài bằng tiêu ngữ
    } else if (type === 'subject') {
      lineStr = '───────'; // Dài 1/3 - 1/2 trích yếu
    }

    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 60, line: 200 },
      children: [
        new TextRun({
          text: lineStr,
          font: 'Times New Roman',
          size: 18,
          bold: true,
          color: '000000'
        })
      ]
    });
  }

  /**
   * Parse Markdown Table to docx Table
   * Hỗ trợ tự động ẩn viền nếu là Bảng Header 2 cột hoặc Bảng Ký Footer 2 cột
   * Tự động bổ sung đường kẻ trang trí cho Tên cơ quan và Tiêu ngữ trong Header
   */
  private static parseMarkdownTable(tableLines: string[]): Table | null {
    if (tableLines.length < 2) return null;

    const parseRow = (rowLine: string) => {
      return rowLine
        .split('|')
        .map(c => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    };

    const headerCells = parseRow(tableLines[0]);
    const isDivider = (line: string) => /^\|[\s-:]+\|$/.test(line.replace(/\|/g, '|'));
    const dataLines = tableLines.slice(1).filter(l => !isDivider(l));

    const allRows: string[][] = [headerCells, ...dataLines.map(parseRow)];
    const isTwoColLayout = headerCells.length === 2;
    const isBorderHidden = isTwoColLayout;

    const noBorders = {
      top: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
    };

    // Kiểm tra xem bảng có phải là Header (chứa Quốc hiệu / Tiêu ngữ)
    const isHeaderTable = isTwoColLayout && tableLines.some(l => l.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') || l.includes('Độc lập - Tự do - Hạnh phúc'));

    const tableRows = allRows.map((rowCells) => {
      const children = rowCells.map((cellText, cellIdx) => {
        const cellLines = cellText.split(/<br\s*\/?>/gi).map(s => s.trim());
        const cellParagraphs: Paragraph[] = [];

        cellLines.forEach((line) => {
          if (!line) return;

          // Kiểm tra nếu là dòng phân cách gạch ngang giả trong cell
          if (/^[─\-_=]+$/.test(line)) {
            return;
          }

          const isLeftColumn = cellIdx === 0;
          const isRightColumn = cellIdx === 1;

          // Căn lề trong bảng 2 cột: Cột chữ ký bên phải canh giữa; Cột nơi nhận bên trái canh trái; Header cả 2 canh giữa
          let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.CENTER;
          if (isTwoColLayout && !isHeaderTable) {
            alignment = isLeftColumn ? AlignmentType.LEFT : AlignmentType.CENTER;
          }

          cellParagraphs.push(
            new Paragraph({
              alignment,
              spacing: { before: 20, after: 20, line: 260 },
              children: this.parseInlineFormatting(line, { size: 24, font: 'Times New Roman' })
            })
          );

          // Bổ sung đường kẻ trang trí ngắn chuẩn NĐ 30 trong Header
          if (isHeaderTable) {
            // Dưới Tên CQ ban hành (dòng in hoa đậm ở cột trái)
            if (isLeftColumn && (line.includes('**') || line.toUpperCase() === line) && !line.startsWith('Số:')) {
              cellParagraphs.push(this.createDecorativeLineParagraph('org'));
            }
            // Dưới Tiêu ngữ (cột phải)
            if (isRightColumn && line.includes('Độc lập - Tự do - Hạnh phúc')) {
              cellParagraphs.push(this.createDecorativeLineParagraph('motto'));
            }
          }
        });

        return new TableCell({
          width: {
            size: isTwoColLayout ? (cellIdx === 0 ? 38 : 62) : Math.round(100 / rowCells.length),
            type: WidthType.PERCENTAGE
          },
          borders: isBorderHidden ? noBorders : undefined,
          children: cellParagraphs.length > 0 ? cellParagraphs : [new Paragraph('')]
        });
      });

      return new TableRow({ children });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    });
  }

  /**
   * Parse inline Markdown formatting (**bold**, *italic*, bold-italic)
   */
  private static parseInlineFormatting(
    text: string,
    defaultOpts: { size: number; font: string }
  ): TextRun[] {
    const runs: TextRun[] = [];
    const regex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|[^*]+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const part = match[0];
      if (part.startsWith('***') && part.endsWith('***')) {
        runs.push(
          new TextRun({
            text: part.slice(3, -3),
            font: defaultOpts.font,
            size: defaultOpts.size,
            bold: true,
            italics: true,
            color: '000000'
          })
        );
      } else if (part.startsWith('**') && part.endsWith('**')) {
        runs.push(
          new TextRun({
            text: part.slice(2, -2),
            font: defaultOpts.font,
            size: defaultOpts.size,
            bold: true,
            color: '000000'
          })
        );
      } else if (part.startsWith('*') && part.endsWith('*')) {
        runs.push(
          new TextRun({
            text: part.slice(1, -1),
            font: defaultOpts.font,
            size: defaultOpts.size,
            italics: true,
            color: '000000'
          })
        );
      } else {
        runs.push(
          new TextRun({
            text: part,
            font: defaultOpts.font,
            size: defaultOpts.size,
            color: '000000'
          })
        );
      }
    }

    return runs.length > 0 ? runs : [new TextRun({ text, ...defaultOpts })];
  }

  /**
   * Tạo Blob và tải trực tiếp file .docx về máy người dùng
   */
  public static async downloadDocx(filename: string, markdownText: string): Promise<void> {
    const doc = this.createDocumentFromMarkdown(markdownText);
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Tạo ArrayBuffer để upload trực tiếp lên PrivOS Room Files
   */
  public static async toArrayBuffer(markdownText: string): Promise<ArrayBuffer> {
    const doc = this.createDocumentFromMarkdown(markdownText);
    return await Packer.toArrayBuffer(doc);
  }
}
