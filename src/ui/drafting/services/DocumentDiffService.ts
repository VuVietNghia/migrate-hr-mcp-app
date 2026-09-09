import { IDocumentDiffService, DiffToken } from '../types';

/**
 * Service xử lý so sánh khác biệt (Document Diff) và chuẩn hóa tên tệp tiếng Việt
 * Áp dụng thuật toán LCS (Longest Common Subsequence) đa tầng:
 * 1. Tầng dòng/đoạn văn (Line-level LCS) để căn chỉnh chính xác ngay cả khi thêm/xóa đoạn
 * 2. Tầng từ ngữ (Word-level LCS) để highlight chính xác từng từ thêm mới (<ins>) hoặc xóa bỏ (<del>)
 */
export class DocumentDiffService implements IDocumentDiffService {
  /**
   * Chuyển chuỗi tiếng Việt có dấu thành chuỗi không dấu chuẩn Slug / File name
   */
  private removeVietnameseTones(str: string): string {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim();
  }

  /**
   * Chuẩn hóa từ thành PascalCase hoặc Snake_Case để tạo tên file đẹp
   */
  private formatToFileName(text: string): string {
    const clean = this.removeVietnameseTones(text);
    return clean
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_');
  }

  /**
   * Sinh tên tệp tiếng Việt chuẩn nghiệp vụ hành chính cho xuất file Word (.docx) và Markdown (.md)
   * Cấu trúc: [Ten_Van_Ban]_[Ten_Nhan_Su_Neu_Co]_[YYYY-MM-DD].[ext]
   */
  public generateVietnameseDocFilename(
    templateTitle: string,
    formData: Record<string, string>,
    extension: string
  ): string {
    const baseTitle = this.formatToFileName(templateTitle) || 'Van_Ban_Hanh_Chinh';

    // Tìm tên nhân sự / ứng viên nếu có trong dữ liệu điền
    const personName =
      formData.candidateName ||
      formData.employeeName ||
      formData.receiverName ||
      '';

    const personSlug = personName ? this.formatToFileName(personName) : '';
    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanExt = extension.replace(/^\./, '');

    if (personSlug) {
      return `${baseTitle}_${personSlug}_${dateStr}.${cleanExt}`;
    }
    return `${baseTitle}_${dateStr}.${cleanExt}`;
  }

  /**
   * Tách câu/đoạn thành danh sách token (từ ngữ, placeholder {{...}}, dấu câu, khoảng trắng)
   */
  private tokenize(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/({{[^}]+}}|\b[\w\u00C0-\u1EF9]+(?:-[\w\u00C0-\u1EF9]+)*\b|\s+|[^\s\w\u00C0-\u1EF9])/g);
    return matches || [text];
  }

  /**
   * So sánh word-level giữa 2 đoạn văn bản sử dụng LCS
   */
  public computeWordDiff(originalText: string, modifiedText: string): DiffToken[] {
    if (originalText === modifiedText) {
      return [{ type: 'unchanged', value: modifiedText }];
    }

    const tokensA = this.tokenize(originalText);
    const tokensB = this.tokenize(modifiedText);

    const m = tokensA.length;
    const n = tokensB.length;

    // LCS Matrix
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokensA[i - 1] === tokensB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find diff tokens
    const result: DiffToken[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
        result.unshift({ type: 'unchanged', value: tokensB[j - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'added', value: tokensB[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        result.unshift({ type: 'removed', value: tokensA[i - 1] });
        i--;
      }
    }

    return this.consolidateTokens(result);
  }

  private consolidateTokens(tokens: DiffToken[]): DiffToken[] {
    if (tokens.length === 0) return [];
    const consolidated: DiffToken[] = [];
    let current = { ...tokens[0] };

    for (let i = 1; i < tokens.length; i++) {
      if (tokens[i].type === current.type) {
        current.value += tokens[i].value;
      } else {
        consolidated.push(current);
        current = { ...tokens[i] };
      }
    }
    consolidated.push(current);
    return consolidated;
  }

  /**
   * So sánh cấp độ dòng giữa 2 tài liệu để tránh lệch dòng (Line Alignment LCS)
   */
  private alignLines(linesA: string[], linesB: string[]): { type: 'same' | 'modified' | 'added' | 'removed'; lineA?: string; lineB?: string }[] {
    const m = linesA.length;
    const n = linesB.length;

    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (linesA[i - 1].trim() === linesB[j - 1].trim()) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const aligned: { type: 'same' | 'modified' | 'added' | 'removed'; lineA?: string; lineB?: string }[] = [];
    let i = m;
    let j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i - 1].trim() === linesB[j - 1].trim()) {
        aligned.unshift({ type: 'same', lineA: linesA[i - 1], lineB: linesB[j - 1] });
        i--;
        j--;
      } else if (i > 0 && j > 0 && dp[i - 1][j] === dp[i][j - 1]) {
        // Line modified (replaced)
        aligned.unshift({ type: 'modified', lineA: linesA[i - 1], lineB: linesB[j - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        aligned.unshift({ type: 'added', lineB: linesB[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        aligned.unshift({ type: 'removed', lineA: linesA[i - 1] });
        i--;
      }
    }

    return aligned;
  }

  /**
   * Tạo chuỗi Markdown đã nhúng các thẻ <ins> (thêm mới) và <del> (xóa bỏ)
   * Sử dụng trực tiếp để render trên A4 view mà không phá vỡ cấu trúc văn bản
   */
  public generateDiffMarkdown(originalDoc: string, currentDoc: string): string {
    const linesA = originalDoc.split('\n');
    const linesB = currentDoc.split('\n');

    const aligned = this.alignLines(linesA, linesB);
    const resultLines: string[] = [];

    for (const item of aligned) {
      if (item.type === 'same') {
        resultLines.push(item.lineB ?? '');
      } else if (item.type === 'modified') {
        const diffTokens = this.computeWordDiff(item.lineA ?? '', item.lineB ?? '');
        let lineMarkup = '';
        for (const token of diffTokens) {
          if (token.type === 'unchanged') {
            lineMarkup += token.value;
          } else if (token.type === 'added') {
            if (token.value.trim().length > 0) {
              lineMarkup += `<ins class="diff-added" title="Nội dung mới / đã điền">${token.value}</ins>`;
            } else {
              lineMarkup += token.value;
            }
          } else if (token.type === 'removed') {
            if (token.value.trim().length > 0) {
              lineMarkup += `<del class="diff-removed" title="Nội dung mẫu gốc đã xóa / thay thế">${token.value}</del>`;
            }
          }
        }
        resultLines.push(lineMarkup);
      } else if (item.type === 'added') {
        const addedLine = item.lineB ?? '';
        if (addedLine.trim().length > 0) {
          resultLines.push(`<ins class="diff-added" title="Đoạn văn mới thêm">${addedLine}</ins>`);
        } else {
          resultLines.push(addedLine);
        }
      } else if (item.type === 'removed') {
        const removedLine = item.lineA ?? '';
        if (removedLine.trim().length > 0) {
          resultLines.push(`<del class="diff-removed" title="Đoạn văn mẫu gốc đã bỏ">${removedLine}</del>`);
        }
      }
    }

    return resultLines.join('\n');
  }

  /**
   * Highlight một dòng đơn lẻ (hỗ trợ fallback)
   */
  public highlightLine(originalLine: string, modifiedLine: string): string {
    if (!originalLine && !modifiedLine) return '';
    if (originalLine === modifiedLine) return modifiedLine;

    const diffs = this.computeWordDiff(originalLine, modifiedLine);
    let html = '';

    for (const token of diffs) {
      if (token.type === 'added') {
        if (token.value.trim().length > 0) {
          html += `<ins class="diff-added" title="Nội dung mới">${token.value}</ins>`;
        } else {
          html += token.value;
        }
      } else if (token.type === 'removed') {
        if (token.value.trim().length > 0) {
          html += `<del class="diff-removed" title="Nội dung mẫu gốc">${token.value}</del>`;
        }
      } else if (token.type === 'unchanged') {
        html += token.value;
      }
    }

    return html;
  }

  public isDocumentModified(originalText: string, modifiedText: string): boolean {
    return originalText.trim() !== modifiedText.trim();
  }

  public countDifferences(originalText: string, modifiedText: string): number {
    const linesA = originalText.split('\n');
    const linesB = modifiedText.split('\n');
    const aligned = this.alignLines(linesA, linesB);

    let count = 0;
    for (const item of aligned) {
      if (item.type === 'modified') {
        const tokens = this.computeWordDiff(item.lineA ?? '', item.lineB ?? '');
        count += tokens.filter(t => (t.type === 'added' || t.type === 'removed') && t.value.trim().length > 0).length;
      } else if (item.type === 'added' || item.type === 'removed') {
        count++;
      }
    }
    return count;
  }
}
