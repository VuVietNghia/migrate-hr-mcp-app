/**
 * A CV file name is the applicant's full name, which makes it personal data. These paths get
 * logged on every pipeline run — sixteen probe attempts per CV — so the name must not reach the
 * console. The directory chain and the extension are what an operator actually debugs with, so
 * those stay and only the basename goes.
 */
export function redactFileName(pathOrName: string): string {
  const separator = Math.max(pathOrName.lastIndexOf('/'), pathOrName.lastIndexOf('\\'));
  const directory = separator >= 0 ? pathOrName.slice(0, separator + 1) : '';
  const base = pathOrName.slice(separator + 1);
  const dot = base.lastIndexOf('.');
  const extension = dot > 0 ? base.slice(dot) : '';
  return `${directory}***${extension}`;
}
