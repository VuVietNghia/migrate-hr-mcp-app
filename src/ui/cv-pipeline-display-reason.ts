export function getCvPipelineDisplayReason(reason: string): string {
  const evidenceSection = reason.search(/\r?\n\s*\[BẰNG CHỨNG TỪ CV\]\s*(?:\r?\n|$)/i);
  return evidenceSection >= 0 ? reason.slice(0, evidenceSection).trimEnd() : reason;
}
