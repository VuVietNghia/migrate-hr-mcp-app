/**
 * Formats a numeric amount into Vietnamese currency format (e.g. 15.000.000 đ)
 */
export function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '0 đ';
  return `${amount.toLocaleString('vi-VN')} đ`;
}

/**
 * Checks if a given contract type represents a probation contract
 */
export function isProbationContract(contractType?: string): boolean {
  if (!contractType) return false;
  return contractType.toLowerCase().includes('thử việc');
}

export interface NetSalaryCalculation {
  netSalary: number;
  effectiveRate: number; // e.g. 85 or 100
  isProbationDiscounted: boolean;
}

/**
 * Calculates the actual payable net salary based on base salary, contract type, and probation rate control
 */
export function calculateNetSalary(
  baseSalary: number,
  contractType?: string,
  applyProbationRate: boolean = true,
  probationRate: number = 85
): NetSalaryCalculation {
  if (!baseSalary || isNaN(baseSalary) || baseSalary <= 0) {
    return { netSalary: 0, effectiveRate: 100, isProbationDiscounted: false };
  }

  const isProbation = isProbationContract(contractType);

  if (isProbation && applyProbationRate) {
    const rate = probationRate > 0 && probationRate <= 100 ? probationRate : 85;
    const net = Math.round((baseSalary * rate) / 100);
    return {
      netSalary: net,
      effectiveRate: rate,
      isProbationDiscounted: true,
    };
  }

  return {
    netSalary: baseSalary,
    effectiveRate: 100,
    isProbationDiscounted: false,
  };
}

/**
 * Generates real-time live preview text for salary input while user types
 */
export function formatCurrencyPreview(rawSalary: string | number | undefined): string | null {
  if (rawSalary === undefined || rawSalary === null || rawSalary === '') return null;
  const cleaned = String(rawSalary).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num <= 0) return null;
  return `≈ ${num.toLocaleString('vi-VN')} đ`;
}
