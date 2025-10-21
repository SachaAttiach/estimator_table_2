/**
 * UK Tax Estimator - Calculation Logic
 * All tax calculations for 2025/26 tax year
 */

// Constants for 2025/26 tax year
export const TAX_YEAR_START = new Date('2025-04-06');
export const TAX_YEAR_END = new Date('2026-04-05');
export const TAX_YEAR_DAYS = 366; // 2025/26 includes leap year day
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_THRESHOLD = 100000;
export const TAPER_LIMIT = 125140;

// UK Tax Bands for 2025/26 (England, Wales, NI)
export const TAX_BANDS = [
  { limit: 37700, rate: 0.20, name: 'Basic Rate' },
  { limit: 125140, rate: 0.40, name: 'Higher Rate' },
  { limit: Infinity, rate: 0.45, name: 'Additional Rate' }
];

export interface IncomeSource {
  id: string;
  name: string;
  incomeToDate: number;
  isRegular: boolean;
  startDate: string;
  endDate: string;
  payrollDate: number; // day of month (1-31)
  projectedIncome?: number; // user can override
}

export interface CalculationResult {
  totalIncome: number;
  personalAllowance: number;
  taxableIncome: number;
  taxDue: number;
  breakdown: CalculationBreakdown;
}

export interface CalculationBreakdown {
  steps: string[];
  sources: SourceBreakdown[];
}

export interface SourceBreakdown {
  name: string;
  incomeToDate: number;
  isRegular: boolean;
  projectedOrActual: number;
  daysWorked?: number;
  daysInYear?: number;
  calculation: string;
}

/**
 * Calculate number of days between two dates (inclusive)
 */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

/**
 * Check if current month's payroll should be included in "income to date"
 * If today < payroll date this month, payroll hasn't happened yet, so exclude current month
 */
export function shouldIncludeCurrentMonth(payrollDay: number, today: Date = new Date()): boolean {
  const currentDay = today.getDate();
  return currentDay >= payrollDay;
}

/**
 * Calculate projected annual income for regular income sources
 */
export function calculateProjectedIncome(
  incomeToDate: number,
  startDate: string,
  payrollDay: number,
  today: Date = new Date()
): { projected: number; daysWorked: number; daysInYear: number } {
  const start = new Date(startDate);
  
  // Determine the "as of" date for calculations
  let asOfDate = new Date(today);
  
  // If payroll hasn't happened this month, use end of last month
  if (!shouldIncludeCurrentMonth(payrollDay, today)) {
    asOfDate = new Date(today.getFullYear(), today.getMonth(), 0); // last day of previous month
  }
  
  // Calculate days worked from start date to as-of date
  const daysWorked = daysBetween(start, asOfDate);
  
  // Calculate total days in employment period (start to end of tax year)
  const endDate = new Date(TAX_YEAR_END);
  const daysInYear = daysBetween(start, endDate);
  
  // Project annual income
  const dailyRate = incomeToDate / daysWorked;
  const projected = dailyRate * daysInYear;
  
  return { projected, daysWorked, daysInYear };
}

/**
 * Calculate personal allowance with taper for high earners
 */
export function calculatePersonalAllowance(totalIncome: number): number {
  if (totalIncome <= TAPER_THRESHOLD) {
    return PERSONAL_ALLOWANCE;
  }
  
  if (totalIncome >= TAPER_LIMIT) {
    return 0;
  }
  
  // Reduce by £1 for every £2 over £100k
  const reduction = (totalIncome - TAPER_THRESHOLD) / 2;
  return Math.max(0, PERSONAL_ALLOWANCE - reduction);
}

/**
 * Calculate tax due based on UK tax bands
 */
export function calculateTaxDue(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  
  let tax = 0;
  let remainingIncome = taxableIncome;
  let previousLimit = 0;
  
  for (const band of TAX_BANDS) {
    const bandWidth = band.limit - previousLimit;
    const incomeInBand = Math.min(remainingIncome, bandWidth);
    
    if (incomeInBand > 0) {
      tax += incomeInBand * band.rate;
      remainingIncome -= incomeInBand;
    }
    
    if (remainingIncome <= 0) break;
    previousLimit = band.limit;
  }
  
  return Math.round(tax * 100) / 100; // round to 2dp
}

/**
 * Main calculation function
 */
export function calculateTax(sources: IncomeSource[], today: Date = new Date()): CalculationResult {
  const breakdown: CalculationBreakdown = {
    steps: [],
    sources: []
  };
  
  let totalIncome = 0;
  
  // Step 1: Calculate total income
  breakdown.steps.push('=== STEP 1: Calculate Total Income ===');
  
  for (const source of sources) {
    let finalIncome: number;
    let calculation: string;
    let daysWorked: number | undefined;
    let daysInYear: number | undefined;
    
    if (source.isRegular) {
      // Check if user has overridden projection
      if (source.projectedIncome !== undefined && source.projectedIncome !== null) {
        finalIncome = source.projectedIncome;
        calculation = `User override: £${finalIncome.toFixed(2)}`;
      } else {
        const projection = calculateProjectedIncome(
          source.incomeToDate,
          source.startDate,
          source.payrollDate,
          today
        );
        finalIncome = projection.projected;
        daysWorked = projection.daysWorked;
        daysInYear = projection.daysInYear;
        
        const dailyRate = source.incomeToDate / daysWorked;
        calculation = `£${source.incomeToDate.toFixed(2)} ÷ ${daysWorked} days worked × ${daysInYear} days in period = £${finalIncome.toFixed(2)}`;
      }
    } else {
      // One-off payment - use actual income
      finalIncome = source.incomeToDate;
      calculation = `One-off payment: £${finalIncome.toFixed(2)} (actual)`;
    }
    
    totalIncome += finalIncome;
    
    breakdown.sources.push({
      name: source.name,
      incomeToDate: source.incomeToDate,
      isRegular: source.isRegular,
      projectedOrActual: finalIncome,
      daysWorked,
      daysInYear,
      calculation
    });
    
    breakdown.steps.push(`${source.name}: ${calculation}`);
  }
  
  breakdown.steps.push(`Total Income: £${totalIncome.toFixed(2)}`);
  breakdown.steps.push('');
  
  // Step 2: Calculate Personal Allowance
  breakdown.steps.push('=== STEP 2: Calculate Personal Allowance ===');
  const personalAllowance = calculatePersonalAllowance(totalIncome);
  
  if (totalIncome <= TAPER_THRESHOLD) {
    breakdown.steps.push(`Income £${totalIncome.toFixed(2)} ≤ £${TAPER_THRESHOLD.toFixed(2)}`);
    breakdown.steps.push(`Full Personal Allowance: £${personalAllowance.toFixed(2)}`);
  } else if (totalIncome >= TAPER_LIMIT) {
    breakdown.steps.push(`Income £${totalIncome.toFixed(2)} ≥ £${TAPER_LIMIT.toFixed(2)}`);
    breakdown.steps.push(`Personal Allowance fully withdrawn: £0`);
  } else {
    const excess = totalIncome - TAPER_THRESHOLD;
    const reduction = excess / 2;
    breakdown.steps.push(`Income £${totalIncome.toFixed(2)} exceeds £${TAPER_THRESHOLD.toFixed(2)}`);
    breakdown.steps.push(`Excess: £${excess.toFixed(2)}`);
    breakdown.steps.push(`Reduction (£1 per £2): £${reduction.toFixed(2)}`);
    breakdown.steps.push(`Personal Allowance: £${PERSONAL_ALLOWANCE.toFixed(2)} - £${reduction.toFixed(2)} = £${personalAllowance.toFixed(2)}`);
  }
  breakdown.steps.push('');
  
  // Step 3: Calculate Taxable Income
  breakdown.steps.push('=== STEP 3: Calculate Taxable Income ===');
  const taxableIncome = Math.max(0, totalIncome - personalAllowance);
  breakdown.steps.push(`Taxable Income = Total Income - Personal Allowance`);
  breakdown.steps.push(`£${totalIncome.toFixed(2)} - £${personalAllowance.toFixed(2)} = £${taxableIncome.toFixed(2)}`);
  breakdown.steps.push('');
  
  // Step 4: Calculate Tax Due
  breakdown.steps.push('=== STEP 4: Calculate Tax Due ===');
  
  if (taxableIncome === 0) {
    breakdown.steps.push(`No taxable income, tax due: £0`);
  } else {
    let remainingIncome = taxableIncome;
    let previousLimit = 0;
    let totalTax = 0;
    
    for (const band of TAX_BANDS) {
      const bandWidth = band.limit === Infinity ? Infinity : band.limit - previousLimit;
      const incomeInBand = Math.min(remainingIncome, bandWidth);
      
      if (incomeInBand > 0) {
        const taxInBand = incomeInBand * band.rate;
        totalTax += taxInBand;
        
        const bandLabel = band.limit === Infinity ? `over £${previousLimit.toFixed(2)}` : `£${previousLimit.toFixed(2)} - £${band.limit.toFixed(2)}`;
        breakdown.steps.push(`${band.name} (${bandLabel}): £${incomeInBand.toFixed(2)} × ${(band.rate * 100).toFixed(0)}% = £${taxInBand.toFixed(2)}`);
        
        remainingIncome -= incomeInBand;
      }
      
      if (remainingIncome <= 0) break;
      previousLimit = band.limit;
    }
    
    breakdown.steps.push(`Total Tax Due: £${totalTax.toFixed(2)}`);
  }
  
  const taxDue = calculateTaxDue(taxableIncome);
  
  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    personalAllowance: Math.round(personalAllowance * 100) / 100,
    taxableIncome: Math.round(taxableIncome * 100) / 100,
    taxDue,
    breakdown
  };
}

