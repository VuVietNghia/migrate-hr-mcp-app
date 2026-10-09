import type { RecruitmentDepartment } from './recruitment-departments';

type JDDepartment = Pick<RecruitmentDepartment, 'key' | 'label'>;

function safeMetadata(value: string): string {
  return value.replace(/-->/g, '—>').trim();
}

export function applyJDDepartment(content: string, department: JDDepartment): string {
  const metadata = `<!-- DEPARTMENT_ID: ${safeMetadata(department.key)} -->`;
  const withoutMetadata = content
    .replace(/\s*<!--\s*DEPARTMENT_ID:\s*[^>]+?\s*-->\s*/giu, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const firstLineEnd = withoutMetadata.indexOf('\n');
  let normalized = firstLineEnd >= 0
    ? `${withoutMetadata.slice(0, firstLineEnd)}\n\n${metadata}\n\n${withoutMetadata.slice(firstLineEnd + 1).replace(/^\s+/, '')}`
    : `${withoutMetadata}\n\n${metadata}`;

  let replaced = false;
  normalized = normalized.replace(
    /(\|\s*\*\*Phòng ban\*\*\s*\|)\s*.*?\s*(\|)/iu,
    (_match, prefix: string, suffix: string) => {
      replaced = true;
      return `${prefix} ${department.label} ${suffix}`;
    },
  );
  normalized = normalized.replace(
    /^(\s*[-*]\s+\*\*Phòng ban:\*\*\s*).*$/imu,
    (_match, prefix: string) => {
      replaced = true;
      return `${prefix}${department.label}`;
    },
  );
  normalized = normalized.replace(
    /^(\s*[-*]\s+Phòng ban:\s*).*$/imu,
    (_match, prefix: string) => {
      replaced = true;
      return `${prefix}${department.label}`;
    },
  );

  return replaced
    ? normalized
    : normalized.replace(metadata, `${metadata}\n\n- **Phòng ban:** ${department.label}`);
}

export function prepareCreatedJD(
  content: string,
  positionName: string,
  department: JDDepartment,
): string {
  const trimmed = content.trim();
  const titled = /^#\s+\S/mu.test(trimmed)
    ? trimmed
    : `# THÔNG TIN TUYỂN DỤNG: ${positionName.trim().toLocaleUpperCase('vi')}\n\n${trimmed}`;
  return applyJDDepartment(titled, department);
}
