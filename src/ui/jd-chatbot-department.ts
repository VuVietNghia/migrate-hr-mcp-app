import type { RecruitmentDepartment } from './recruitment-departments';
import type { JDGeneratedMetadata } from './jd-chatbot-view-model';

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
  metadata: JDGeneratedMetadata = {},
): string {
  const trimmed = content.trim();
  const title = positionName.trim();
  const titled = /^#\s+\S[^\r\n]*(?:\r?\n|$)/u.test(trimmed)
    ? trimmed.replace(/^#\s+[^\r\n]*(?=\r?\n|$)/u, `# ${title}`)
    : `# ${title}\n\n${trimmed}`;
  const normalized = applyJDDepartment(titled, department)
    .replace(/\s*<!--\s*JD_(?:LOCATION|EMPLOYMENT_TYPE|SALARY):[^\r\n]*-->\s*/giu, '\n\n')
    .replace(/\s*<!--\s*SUMMARY:[^\r\n]*-->\s*/giu, '\n\n')
    .replace(/\s*<!--\s*JD_DESCRIPTION:[\s\S]*?-->\s*/giu, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const comments = [
    metadata.location ? `<!-- JD_LOCATION: ${safeMetadata(metadata.location)} -->` : '',
    metadata.employmentType ? `<!-- JD_EMPLOYMENT_TYPE: ${safeMetadata(metadata.employmentType)} -->` : '',
    metadata.salary ? `<!-- JD_SALARY: ${safeMetadata(metadata.salary)} -->` : '',
    metadata.summary ? `<!-- SUMMARY: ${safeMetadata(metadata.summary)} -->` : '',
    metadata.description ? `<!-- JD_DESCRIPTION:\n${safeMetadata(metadata.description)}\n-->` : '',
  ].filter(Boolean).join('\n');

  if (!comments) return normalized;
  return normalized.replace(
    /(<!--\s*DEPARTMENT_ID:[^\r\n]*-->)/iu,
    `$1\n${comments}`,
  );
}
