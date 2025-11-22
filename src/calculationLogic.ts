/**
 * UK Tax Estimator - Calculation Logic
 * All tax calculations for 2025/26 tax year
 */

// Constants for 2025/26 tax year
export const TAX_YEAR_START = new Date('2025-04-06');
export const TAX_YEAR_END = new Date('2026-04-05');
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_THRESHOLD = 100000;
export const TAPER_LIMIT = 125140;

export interface TaxBand {
  limit: number;
  rate: number;
  name: string;
}

// UK Tax Bands for 2025/26 (England, Wales, NI)
export const TAX_BANDS: TaxBand[] = [
  { limit: 37700, rate: 0.20, name: 'Basic Rate' },
  { limit: 125140, rate: 0.40, name: 'Higher Rate' },
  { limit: Infinity, rate: 0.45, name: 'Additional Rate' }
];

// Scottish Tax Bands for 2025/26 (non-savings, non-dividend)
export const SCOTTISH_TAX_BANDS: TaxBand[] = [
  { limit: 2306, rate: 0.19, name: 'Starter Rate' },
  { limit: 13991, rate: 0.20, name: 'Basic Rate' },
  { limit: 31092, rate: 0.21, name: 'Intermediate Rate' },
  { limit: 62430, rate: 0.42, name: 'Higher Rate' },
  { limit: 125140, rate: 0.45, name: 'Advanced Rate' },
  { limit: Infinity, rate: 0.48, name: 'Top Rate' }
];

export interface IncomeSource {
  id: string;
  name: string;
  incomeToDate: number;
  isRegular: boolean;
  startDate: string;
  endDate: string;
  includeCurrentMonth: boolean;
  projectedIncome?: number; // user can override
  taxPaid?: number; // actual tax paid (for one-offs or user override)
}

export interface Deduction {
  id: string;
  description: string;
  amount: number;
  category: 'job_expenses' | 'professional_subs' | 'fre' | 'marriage_allowance' | 'gift_aid' | 'other';
}

export interface TaxAdjustment {
  id: string;
  description: string;
  amount: number;
  type: 'underpayment' | 'untaxed_interest' | 'benefit_in_kind' | 'state_benefits' | 'other';
}

export interface SourceTaxDetail {
  name: string;
  income: number;
  paUsed: number;
  taxableIncome: number;
  taxDue: number;
  taxPaid: number;
  difference: number; // taxPaid - taxDue
  notes: string;
}

export interface CalculationResult {
  totalIncome: number;
  personalAllowance: number;
  totalDeductions: number;
  taxableIncomeBeforeDeductions: number;
  taxableIncomeAfterDeductions: number;
  taxDueOnIncome: number;
  totalAdjustments: number;
  finalTaxDue: number; // taxDueOnIncome + adjustments
  taxPaid: number;
  netPosition: number; // taxPaid - finalTaxDue
  breakdown: CalculationBreakdown;
  sourceDetails: SourceTaxDetail[];
  // Legacy fields for backwards compatibility
  taxableIncome: number; // alias for taxableIncomeAfterDeductions
  taxDue: number; // alias for finalTaxDue
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
 * Calculate projected annual income for regular income sources
 */
export function calculateProjectedIncome(
  incomeToDate: number,
  startDate: string,
  includeCurrentMonth: boolean,
  today: Date = new Date()
): { projected: number; daysWorked: number; daysInYear: number } {
  const start = new Date(startDate);
  
  // Determine the "as of" date for calculations
  let asOfDate = includeCurrentMonth
    ? new Date(today)
    : new Date(today.getFullYear(), today.getMonth(), 0); // last day of previous month

  // If start date is after the calculated asOfDate (e.g., started mid-month with "exclude current month"),
  // we should use today instead to have meaningful data
  if (asOfDate < start) {
    // Override to use today - we need at least some days worked for a reasonable projection
    asOfDate = new Date(today);
    
    // If today is also before or equal to start date, the income hasn't actually started yet
    if (asOfDate <= start) {
      // Not enough data for projection - return minimal values
      const endDate = new Date(TAX_YEAR_END);
      const daysInYear = Math.max(1, daysBetween(start, endDate));
      return { 
        projected: incomeToDate, // Just use what we have
        daysWorked: 1, 
        daysInYear 
      };
    }
  }
  
  // Calculate days worked from start date to as-of date
  const daysWorked = Math.max(1, daysBetween(start, asOfDate));
  
  // Validation: if daysWorked is very small (< 7 days), this might lead to unrealistic projections
  // In such cases, we should be more conservative
  const MIN_DAYS_FOR_PROJECTION = 7;
  
  // Calculate total days in employment period (start to end of tax year)
  const endDate = new Date(TAX_YEAR_END);
  const daysInYear = daysBetween(start, endDate);
  
  // Project annual income
  const dailyRate = incomeToDate / daysWorked;
  let projected = dailyRate * daysInYear;
  
  // If we have very few days of data, cap the projection to be more conservative
  // This prevents extreme annualization from a few days of data
  if (daysWorked < MIN_DAYS_FOR_PROJECTION && incomeToDate > 0) {
    // Use a more conservative approach: assume the income rate, but don't over-extrapolate
    // Cap at a reasonable multiple (e.g., 52x weekly income if we only have 1 week of data)
    const weeksWorked = daysWorked / 7;
    const weeklyRate = incomeToDate / weeksWorked;
    const weeksRemaining = daysInYear / 7;
    const conservativeProjection = weeklyRate * weeksRemaining;
    
    // Use the lower of the two projections to be conservative
    projected = Math.min(projected, conservativeProjection);
  }
  
  projected = Math.round(projected * 100) / 100;
  
  // Validation: ensure we don't return NaN or Infinity
  if (!isFinite(projected) || isNaN(projected)) {
    projected = incomeToDate; // Fallback to actual income
  }
  
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
 * Calculate tax due based on supplied tax bands
 */
export function calculateTaxDue(taxableIncome: number, bands: TaxBand[] = TAX_BANDS): number {
  if (taxableIncome <= 0) return 0;
  
  let tax = 0;
  let remainingIncome = taxableIncome;
  let previousLimit = 0;
  
  for (const band of bands) {
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
 * Calculate tax for a specific income slice, starting from a given taxable position
 * This allows sequential allocation through tax bands
 */
function calculateTaxForSlice(
  incomeAmount: number,
  startingPosition: number,
  bands: TaxBand[]
): number {
  if (incomeAmount <= 0) return 0;
  
  let tax = 0;
  let remaining = incomeAmount;
  let currentPosition = startingPosition;
  
  for (const band of bands) {
    if (remaining <= 0) break;
    
    // Determine where this band starts and ends
    const bandStart = currentPosition;
    const bandEnd = band.limit;
    
    // How much room is left in this band from our current position?
    const roomInBand = Math.max(0, bandEnd - bandStart);
    
    // How much of our remaining income fits in this band?
    const incomeInThisBand = Math.min(remaining, roomInBand);
    
    if (incomeInThisBand > 0) {
      tax += incomeInThisBand * band.rate;
      remaining -= incomeInThisBand;
      currentPosition += incomeInThisBand;
    }
    
    // If we've filled this band, move to the next one
    if (currentPosition >= bandEnd) {
      currentPosition = bandEnd;
    }
  }
  
  return Math.round(tax * 100) / 100;
}

/**
 * Allocate PA and tax sequentially through income sources
 * This mirrors HMRC's approach to calculating tax per source
 */
function allocateTaxSequentially(
  sources: IncomeSource[],
  projectedIncomes: number[],
  totalPA: number,
  taxBands: TaxBand[]
): SourceTaxDetail[] {
  let paRemaining = totalPA;
  let taxablePosition = 0; // Track where we are in the tax bands
  
  const details: SourceTaxDetail[] = [];
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const income = projectedIncomes[i];
    
    // Step 1: Allocate PA to this source
    const paForThisSource = Math.min(paRemaining, income);
    paRemaining -= paForThisSource;
    
    // Step 2: Calculate taxable income for this source
    const taxableIncome = income - paForThisSource;
    
    // Step 3: Calculate tax due (from current position in bands)
    const taxDue = calculateTaxForSlice(taxableIncome, taxablePosition, taxBands);
    
    // Move position forward for next source
    taxablePosition += taxableIncome;
    
    // Step 4: Determine tax paid
    let taxPaid: number;
    let notes: string;
    
    // Check if user has manually entered taxPaid
    if (source.taxPaid !== undefined && source.taxPaid !== null) {
      taxPaid = source.taxPaid;
      notes = source.isRegular ? 'User override' : 'Actual tax deducted';
    } else if (source.isRegular) {
      // Regular income - assume balanced PAYE (default)
      taxPaid = taxDue;
      notes = 'Balanced PAYE (ongoing)';
    } else {
      // One-off with no tax paid entered
      taxPaid = 0;
      notes = 'No tax information provided';
    }
    
    // Step 5: Calculate difference (refund/underpayment)
    const difference = taxPaid - taxDue;
    
    details.push({
      name: source.name,
      income: Math.round(income * 100) / 100,
      paUsed: Math.round(paForThisSource * 100) / 100,
      taxableIncome: Math.round(taxableIncome * 100) / 100,
      taxDue: Math.round(taxDue * 100) / 100,
      taxPaid: Math.round(taxPaid * 100) / 100,
      difference: Math.round(difference * 100) / 100,
      notes
    });
  }
  
  return details;
}

/**
 * Main calculation function
 */
export interface CalculateTaxOptions {
  today?: Date;
  useScottishBands?: boolean;
}

export function calculateTax(
  sources: IncomeSource[], 
  deductions: Deduction[] = [],
  adjustments: TaxAdjustment[] = [],
  options: CalculateTaxOptions = {}
): CalculationResult {
  const today = options.today ?? new Date();
  const taxBands = options.useScottishBands ? SCOTTISH_TAX_BANDS : TAX_BANDS;
  const regionLabel = options.useScottishBands ? 'Scottish' : 'rUK';

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
        const includeMonth = source.includeCurrentMonth ?? true;
        const projection = calculateProjectedIncome(
          source.incomeToDate,
          source.startDate,
          includeMonth,
          today
        );
        finalIncome = projection.projected;
        daysWorked = projection.daysWorked;
        daysInYear = projection.daysInYear;
        
        const monthNote = includeMonth ? 'including current month' : 'excluding current month';
        calculation = `£${source.incomeToDate.toFixed(2)} ÷ ${daysWorked} days worked × ${daysInYear} days in period = £${finalIncome.toFixed(2)} (${monthNote})`;
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
  
  // Step 3: Sequential allocation of PA and tax per source
  breakdown.steps.push('=== STEP 3: Allocate PA and Tax Per Source ===');
  breakdown.steps.push(`Using ${regionLabel} tax bands`);
  
  // Get projected incomes for sequential allocation
  const projectedIncomes = breakdown.sources.map(s => s.projectedOrActual);
  const sourceDetails = allocateTaxSequentially(sources, projectedIncomes, personalAllowance, taxBands);
  
  // Add detailed breakdown for each source
  for (const detail of sourceDetails) {
    breakdown.steps.push(`\n${detail.name}:`);
    breakdown.steps.push(`  Income: £${detail.income.toFixed(2)}`);
    breakdown.steps.push(`  PA Used: £${detail.paUsed.toFixed(2)}`);
    breakdown.steps.push(`  Taxable: £${detail.taxableIncome.toFixed(2)}`);
    breakdown.steps.push(`  Tax Due: £${detail.taxDue.toFixed(2)}`);
    breakdown.steps.push(`  Tax Paid: £${detail.taxPaid.toFixed(2)}`);
    breakdown.steps.push(`  Difference: £${detail.difference.toFixed(2)} (${detail.notes})`);
  }
  
  breakdown.steps.push('');
  
  // Step 4: Apply Deductions
  breakdown.steps.push('=== STEP 4: Apply Deductions ===');
  
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const taxableIncomeBeforeDeductions = totalIncome - personalAllowance;
  
  if (deductions.length > 0) {
    for (const deduction of deductions) {
      breakdown.steps.push(`${deduction.description}: -£${deduction.amount.toFixed(2)}`);
    }
    breakdown.steps.push(`Total Deductions: £${totalDeductions.toFixed(2)}`);
  } else {
    breakdown.steps.push('No deductions');
  }
  
  const taxableIncomeAfterDeductions = Math.max(0, taxableIncomeBeforeDeductions - totalDeductions);
  breakdown.steps.push(`Taxable Income (after deductions): £${taxableIncomeAfterDeductions.toFixed(2)}`);
  breakdown.steps.push('');
  
  // Step 5: Calculate tax on adjusted taxable income
  breakdown.steps.push('=== STEP 5: Calculate Tax on Income ===');
  
  // Recalculate tax based on reduced taxable income
  const taxDueOnIncome = calculateTaxDue(taxableIncomeAfterDeductions, taxBands);
  breakdown.steps.push(`Region (${regionLabel}) tax due on £${taxableIncomeAfterDeductions.toFixed(2)}: £${taxDueOnIncome.toFixed(2)}`);
  breakdown.steps.push('');
  
  // Step 6: Apply Adjustments (additional tax owed)
  breakdown.steps.push('=== STEP 6: Additional Tax Owed ===');
  
  const totalAdjustments = adjustments.reduce((sum, a) => sum + a.amount, 0);
  
  if (adjustments.length > 0) {
    for (const adjustment of adjustments) {
      breakdown.steps.push(`${adjustment.description}: +£${adjustment.amount.toFixed(2)}`);
    }
    breakdown.steps.push(`Total Additional Tax: £${totalAdjustments.toFixed(2)}`);
  } else {
    breakdown.steps.push('No additional tax owed');
  }
  breakdown.steps.push('');
  
  // Step 7: Final Summary
  breakdown.steps.push('=== STEP 7: Final Summary ===');
  
  const finalTaxDue = taxDueOnIncome + totalAdjustments;
  const taxPaid = sourceDetails.reduce((sum, d) => sum + d.taxPaid, 0);
  const netPosition = taxPaid - finalTaxDue;
  
  breakdown.steps.push(`Total Income: £${totalIncome.toFixed(2)}`);
  breakdown.steps.push(`Personal Allowance: £${personalAllowance.toFixed(2)}`);
  breakdown.steps.push(`Taxable Income (before deductions): £${taxableIncomeBeforeDeductions.toFixed(2)}`);
  breakdown.steps.push(`Deductions: -£${totalDeductions.toFixed(2)}`);
  breakdown.steps.push(`Taxable Income (after deductions): £${taxableIncomeAfterDeductions.toFixed(2)}`);
  breakdown.steps.push(`Tax Due on Income: £${taxDueOnIncome.toFixed(2)}`);
  breakdown.steps.push(`Additional Tax Owed: +£${totalAdjustments.toFixed(2)}`);
  breakdown.steps.push(`Final Tax Due: £${finalTaxDue.toFixed(2)}`);
  breakdown.steps.push(`Total Tax Paid: £${taxPaid.toFixed(2)}`);
  breakdown.steps.push(`Net Position: £${netPosition.toFixed(2)} ${netPosition > 0 ? '(Refund)' : netPosition < 0 ? '(Owed)' : '(Balanced)'}`);
  
  // Helper function to safely round and validate numbers
  const safeRound = (num: number): number => {
    if (!isFinite(num) || isNaN(num)) return 0;
    return Math.round(num * 100) / 100;
  };
  
  return {
    totalIncome: safeRound(totalIncome),
    personalAllowance: safeRound(personalAllowance),
    totalDeductions: safeRound(totalDeductions),
    taxableIncomeBeforeDeductions: safeRound(taxableIncomeBeforeDeductions),
    taxableIncomeAfterDeductions: safeRound(taxableIncomeAfterDeductions),
    taxDueOnIncome: safeRound(taxDueOnIncome),
    totalAdjustments: safeRound(totalAdjustments),
    finalTaxDue: safeRound(finalTaxDue),
    taxPaid: safeRound(taxPaid),
    netPosition: safeRound(netPosition),
    breakdown,
    sourceDetails,
    // Legacy fields for backwards compatibility
    taxableIncome: safeRound(taxableIncomeAfterDeductions),
    taxDue: safeRound(finalTaxDue)
  };
}


