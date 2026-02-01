/**
 * UK Tax Estimator - Calculation Logic
 * All tax calculations for 2025/26 tax year
 */

// Constants for 2025/26 tax year
// Use explicit year, month, day to avoid timezone parsing issues
export const TAX_YEAR_START = new Date(2025, 3, 6);  // April 6, 2025 (month is 0-indexed)
export const TAX_YEAR_END = new Date(2026, 3, 5);    // April 5, 2026
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
  monthsPaid?: number; // number of PAYE periods paid (replaces includeCurrentMonth)
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

/**
 * Helper to determine if an adjustment type represents taxable income (vs direct tax)
 */
export function isAdjustmentTaxableIncome(type: TaxAdjustment['type']): boolean {
  return type === 'untaxed_interest' || type === 'benefit_in_kind' || type === 'state_benefits';
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
  // PAYE period-based fields
  periodsWorked?: number;        // Equivalent periods worked (e.g., 5.387)
  totalPeriods?: number;         // Total periods in employment period
  monthlyRate?: number;          // Calculated monthly rate
  firstPeriodFraction?: number;  // Fraction of first period worked
  startPeriodNumber?: number;    // Which PAYE period employment started in
  // Legacy fields for backwards compatibility
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
 * Parse a date string safely, handling both ISO format (YYYY-MM-DD) and UK format (DD/MM/YYYY)
 */
export function parseDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return new Date(dateStr);
  }
  
  // If it contains a 'T', it's ISO format - parse directly
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // Check if it's in DD/MM/YYYY or similar format
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    const third = parseInt(parts[2], 10);
    
    // If first part is 4 digits, assume YYYY-MM-DD
    if (parts[0].length === 4) {
      return new Date(first, second - 1, third);
    }
    
    // If third part is 4 digits, assume DD/MM/YYYY or MM/DD/YYYY
    if (parts[2].length === 4) {
      // If first > 12, it must be DD/MM/YYYY
      if (first > 12) {
        return new Date(third, second - 1, first);
      }
      // If second > 12, it must be MM/DD/YYYY
      if (second > 12) {
        return new Date(third, first - 1, second);
      }
      // Ambiguous - assume ISO-like (YYYY-MM-DD) or DD/MM/YYYY based on context
      // For UK tax system, assume DD/MM/YYYY
      return new Date(third, second - 1, first);
    }
  }
  
  // Fallback to native parsing
  return new Date(dateStr);
}

// ============================================================================
// PAYE PERIOD HELPERS
// PAYE periods run from 6th of one month to 5th of the next month
// Period 1: April 6 - May 5, Period 2: May 6 - June 5, ..., Period 12: March 6 - April 5
// ============================================================================

export interface PAYEPeriod {
  periodNumber: number;  // 1-12
  startDate: Date;
  endDate: Date;
  daysInPeriod: number;
}

/**
 * Get the PAYE period information for a given date
 * PAYE periods run from 6th to 5th of the following month
 */
export function getPAYEPeriod(date: Date, taxYearStart: Date = TAX_YEAR_START): PAYEPeriod {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  
  // Determine which PAYE period this date falls into
  // If day >= 6, we're in the period that starts this month
  // If day <= 5, we're in the period that started last month
  
  let periodStartMonth: number;
  let periodStartYear: number;
  
  if (day >= 6) {
    periodStartMonth = month;
    periodStartYear = year;
  } else {
    // Day is 1-5, so we're in the period that started on the 6th of the previous month
    if (month === 0) {
      periodStartMonth = 11; // December
      periodStartYear = year - 1;
    } else {
      periodStartMonth = month - 1;
      periodStartYear = year;
    }
  }
  
  // Calculate period number (1-12)
  // Period 1 starts April 6, Period 2 starts May 6, etc.
  const taxYearStartMonth = taxYearStart.getMonth(); // April = 3
  const taxYearStartYear = taxYearStart.getFullYear();
  
  let periodNumber: number;
  if (periodStartYear === taxYearStartYear) {
    periodNumber = periodStartMonth - taxYearStartMonth + 1;
  } else {
    // We're in the next calendar year (Jan-Mar)
    periodNumber = periodStartMonth + 12 - taxYearStartMonth + 1;
  }
  
  // Clamp period number to 1-12
  periodNumber = Math.max(1, Math.min(12, periodNumber));
  
  // Calculate start and end dates for this period
  const startDate = new Date(periodStartYear, periodStartMonth, 6);
  
  // End date is the 5th of the following month
  let endMonth = periodStartMonth + 1;
  let endYear = periodStartYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear++;
  }
  const endDate = new Date(endYear, endMonth, 5);
  
  const daysInPeriod = daysBetween(startDate, endDate);
  
  return { periodNumber, startDate, endDate, daysInPeriod };
}

/**
 * Get the start and end dates for a specific PAYE period number (1-12)
 */
export function getPAYEPeriodDates(periodNumber: number, taxYearStart: Date = TAX_YEAR_START): { startDate: Date; endDate: Date; daysInPeriod: number } {
  const taxYearStartMonth = taxYearStart.getMonth(); // April = 3
  const taxYearStartYear = taxYearStart.getFullYear();
  
  // Calculate which month this period starts in
  let startMonth = taxYearStartMonth + periodNumber - 1;
  let startYear = taxYearStartYear;
  
  if (startMonth > 11) {
    startMonth -= 12;
    startYear++;
  }
  
  const startDate = new Date(startYear, startMonth, 6);
  
  // End date is 5th of the following month
  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear++;
  }
  const endDate = new Date(endYear, endMonth, 5);
  
  const daysInPeriod = daysBetween(startDate, endDate);
  
  return { startDate, endDate, daysInPeriod };
}

/**
 * Get the current PAYE period based on today's date
 */
export function getCurrentPAYEPeriod(today: Date = new Date()): PAYEPeriod {
  return getPAYEPeriod(today);
}

/**
 * Calculate equivalent PAYE periods worked, accounting for partial first period
 * Returns the number of periods as a decimal (e.g., 5.387 for 5 full + partial)
 * 
 * The key insight: we count whole periods from startPeriod to asOfPeriod (inclusive)
 * If started mid-period, the first period is fractional
 */
export function calculateEquivalentPeriods(
  startDate: Date,
  asOfDate: Date,
  taxYearStart: Date = TAX_YEAR_START
): { equivalentPeriods: number; firstPeriodFraction: number; fullPeriodsAfter: number; startPeriod: PAYEPeriod } {
  // Clamp start date to tax year start if earlier
  const effectiveStart = startDate < taxYearStart ? new Date(taxYearStart) : new Date(startDate);
  
  // Get the PAYE period the start date falls into
  const startPeriod = getPAYEPeriod(effectiveStart, taxYearStart);
  
  // Get the PAYE period the as-of date falls into
  const asOfPeriod = getPAYEPeriod(asOfDate, taxYearStart);
  
  // Calculate what fraction of the first period was worked
  // If started on the 6th (period start), this is 1.0
  // If started later, it's a fraction
  const startDay = effectiveStart.getDate();
  let firstPeriodFraction: number;
  
  if (startDay === 6) {
    // Started on period start date - count as full period
    firstPeriodFraction = 1.0;
  } else if (startDay > 6) {
    // Started mid-period - calculate fraction
    const daysWorkedInFirstPeriod = daysBetween(effectiveStart, startPeriod.endDate);
    firstPeriodFraction = daysWorkedInFirstPeriod / startPeriod.daysInPeriod;
  } else {
    // startDay < 6 means we're in previous period's territory - shouldn't happen after getPAYEPeriod
    // but handle it as full period to be safe
    firstPeriodFraction = 1.0;
  }
  
  // Count WHOLE periods from (startPeriod + 1) to asOfPeriod (inclusive)
  // This is simply the difference in period numbers
  let fullPeriodsAfter = 0;
  if (asOfPeriod.periodNumber > startPeriod.periodNumber) {
    // Number of complete periods after the start period, up to and including asOf period
    fullPeriodsAfter = asOfPeriod.periodNumber - startPeriod.periodNumber;
  } else if (asOfPeriod.periodNumber === startPeriod.periodNumber) {
    // Still in the same period we started - no full periods after
    fullPeriodsAfter = 0;
  }
  
  // Total equivalent periods = first period fraction + full periods after
  const equivalentPeriods = firstPeriodFraction + fullPeriodsAfter;
  
  return { equivalentPeriods, firstPeriodFraction, fullPeriodsAfter, startPeriod };
}

/**
 * Calculate total PAYE periods in employment period (start to end of tax year)
 */
export function calculateTotalPeriods(
  startDate: Date,
  endDate: Date = TAX_YEAR_END,
  taxYearStart: Date = TAX_YEAR_START
): { totalPeriods: number; firstPeriodFraction: number; fullPeriodsAfter: number } {
  // Clamp start date to tax year start if earlier
  const effectiveStart = startDate < taxYearStart ? new Date(taxYearStart) : new Date(startDate);
  
  // Clamp end date to tax year end if later
  const effectiveEnd = endDate > TAX_YEAR_END ? new Date(TAX_YEAR_END) : new Date(endDate);
  
  // Get the PAYE period the start date falls into
  const startPeriod = getPAYEPeriod(effectiveStart, taxYearStart);
  
  // Calculate what fraction of the first period will be worked
  const daysWorkedInFirstPeriod = daysBetween(effectiveStart, startPeriod.endDate);
  const firstPeriodFraction = daysWorkedInFirstPeriod / startPeriod.daysInPeriod;
  
  // Get the final period (Period 12 ends April 5)
  const endPeriod = getPAYEPeriod(effectiveEnd, taxYearStart);
  
  // Count full periods from (start period + 1) to end period
  const fullPeriodsAfter = endPeriod.periodNumber - startPeriod.periodNumber;
  
  const totalPeriods = firstPeriodFraction + fullPeriodsAfter;
  
  return { totalPeriods, firstPeriodFraction, fullPeriodsAfter };
}

/**
 * Get the "as of" date based on include/exclude current PAYE period toggle
 * If exclude: returns the last day of the previous PAYE period (5th of current month)
 * If include: returns today
 */
export function getAsOfDateForPAYE(
  includeCurrentPeriod: boolean,
  today: Date = new Date()
): Date {
  if (includeCurrentPeriod) {
    return new Date(today);
  }
  
  // Exclude current period - return the end of the previous period
  const currentPeriod = getPAYEPeriod(today);
  
  // The previous period ended on the day before this period started
  // Or we can calculate: if we're in period N, previous period ended on 5th of the month period N started
  const prevPeriodEnd = new Date(currentPeriod.startDate);
  prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 1); // Day before period start = 5th
  
  return prevPeriodEnd;
}

/**
 * Get the month name for a PAYE period number
 */
function getMonthNameForPeriod(periodNumber: number): string {
  const monthNames = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  return monthNames[periodNumber - 1] || '';
}

/**
 * Valid months paid option for dropdown
 */
export interface MonthsPaidOption {
  value: number;
  label: string;
  periodRange: string; // e.g., "Apr-Dec" or "Apr-Jan"
}

/**
 * Get the period number for a calendar month
 * People get paid at end of each calendar month, so Feb 1st means Feb pay is the question
 * Period 1 = April, Period 2 = May, ..., Period 10 = January, Period 11 = February, Period 12 = March
 */
function getCalendarMonthPeriod(date: Date, taxYearStart: Date = TAX_YEAR_START): number {
  const month = date.getMonth(); // 0-indexed (0 = Jan, 1 = Feb, etc.)
  const year = date.getFullYear();
  const taxYearStartMonth = taxYearStart.getMonth(); // April = 3
  const taxYearStartYear = taxYearStart.getFullYear();
  
  // Calculate period number based on calendar month
  // April (month 3) = Period 1, May (month 4) = Period 2, etc.
  let periodNumber: number;
  if (year === taxYearStartYear) {
    periodNumber = month - taxYearStartMonth + 1;
  } else {
    // We're in the next calendar year (Jan-Mar)
    periodNumber = month + 12 - taxYearStartMonth + 1;
  }
  
  return Math.max(1, Math.min(12, periodNumber));
}

/**
 * Calculate valid "months paid to date" options based on start date and today's date
 * Returns two options: N-1 months (haven't received current month's pay) and N months (have received it)
 * Uses calendar months because people get paid at end of each month, not on PAYE period boundaries
 */
export function getValidMonthsPaidOptions(
  startDate: string,
  today: Date = new Date(),
  taxYearStart: Date = TAX_YEAR_START
): MonthsPaidOption[] {
  const parsedStart = parseDate(startDate);
  
  // Clamp start date to tax year start if earlier
  const effectiveStart = parsedStart < taxYearStart ? new Date(taxYearStart) : parsedStart;
  
  // Get the PAYE period the start date falls into
  const startPeriod = getPAYEPeriod(effectiveStart, taxYearStart);
  
  // Get the current calendar month's period number (not PAYE period)
  // On Feb 1, this gives Period 11 (Feb), not Period 10 (Jan 6 - Feb 5)
  const currentCalendarPeriod = getCalendarMonthPeriod(today, taxYearStart);
  
  // Calculate how many complete periods from start to current (inclusive)
  // This is the maximum possible months paid
  const maxMonths = currentCalendarPeriod - startPeriod.periodNumber + 1;
  
  // The two valid options:
  // - maxMonths - 1: Haven't received current month's pay yet
  // - maxMonths: Have received current month's pay
  const options: MonthsPaidOption[] = [];
  
  const startMonthName = getMonthNameForPeriod(startPeriod.periodNumber);
  
  if (maxMonths > 1) {
    const prevMonthName = getMonthNameForPeriod(currentCalendarPeriod - 1);
    options.push({
      value: maxMonths - 1,
      label: `${maxMonths - 1} month${maxMonths - 1 !== 1 ? 's' : ''} (through ${prevMonthName})`,
      periodRange: `${startMonthName}-${prevMonthName}`
    });
  }
  
  const currentMonthName = getMonthNameForPeriod(currentCalendarPeriod);
  options.push({
    value: maxMonths,
    label: `${maxMonths} month${maxMonths !== 1 ? 's' : ''} (through ${currentMonthName})`,
    periodRange: `${startMonthName}-${currentMonthName}`
  });
  
  return options;
}

/**
 * Get the "as of" date based on months paid selection
 * Converts months paid count to an appropriate end date for the calculation
 */
export function getAsOfDateForMonthsPaid(
  monthsPaid: number,
  startDate: string,
  today: Date = new Date(),
  taxYearStart: Date = TAX_YEAR_START
): Date {
  const parsedStart = parseDate(startDate);
  
  // Clamp start date to tax year start if earlier
  const effectiveStart = parsedStart < taxYearStart ? new Date(taxYearStart) : parsedStart;
  
  // Get the start period
  const startPeriod = getPAYEPeriod(effectiveStart, taxYearStart);
  
  // Calculate which period number corresponds to the months paid
  // If started in Period 5 and monthsPaid is 3, that means through Period 7
  const targetPeriodNumber = startPeriod.periodNumber + monthsPaid - 1;
  
  // Get the end date of that period
  const { endDate } = getPAYEPeriodDates(targetPeriodNumber, taxYearStart);
  
  // Return the end date of the target period, but not beyond today
  return endDate < today ? endDate : today;
}

/**
 * Result of PAYE period-based income projection
 */
export interface PAYEProjectionResult {
  projected: number;
  periodsWorked: number;        // Equivalent periods worked (e.g., 5.387)
  totalPeriods: number;         // Total periods in employment period (e.g., 8.387)
  monthlyRate: number;          // Calculated monthly rate
  firstPeriodFraction: number;  // Fraction of first period worked (e.g., 0.387)
  startPeriodNumber: number;    // Which PAYE period employment started in
  // Legacy fields for backwards compatibility
  daysWorked: number;
  daysInYear: number;
}

/**
 * Calculate projected annual income for regular income sources
 * Uses PAYE periods (6th-5th) instead of calendar months
 * 
 * @param monthsPaid - Number of months of pay received (optional, auto-calculated if not provided)
 */
export function calculateProjectedIncome(
  incomeToDate: number,
  startDate: string,
  monthsPaid: number | undefined,
  today: Date = new Date(),
  endDate: string | Date = TAX_YEAR_END
): PAYEProjectionResult {
  const rawStart = parseDate(startDate);
  
  // Clamp start date to tax year start if earlier
  const start = rawStart < TAX_YEAR_START ? new Date(TAX_YEAR_START) : rawStart;
  
  // Get start period info
  const startPeriod = getPAYEPeriod(start);
  
  // Calculate total periods in employment period (for projection)
  const parsedEndDate = typeof endDate === 'string' ? parseDate(endDate) : endDate;
  const totalPeriodsResult = calculateTotalPeriods(start, parsedEndDate);
  const totalPeriods = totalPeriodsResult.totalPeriods;
  
  let periodsWorked: number;
  let firstPeriodFraction: number;
  
  // If monthsPaid is explicitly provided, use it directly
  if (monthsPaid !== undefined && monthsPaid > 0) {
    // User has told us exactly how many months of pay they've received
    // Use this directly as periods worked
    periodsWorked = monthsPaid;
    firstPeriodFraction = 1.0; // Assume full periods when user specifies
  } else {
    // Auto-calculate based on today's date
    const asOfDate = new Date(today);
    
    // If today is before or equal to start date, income hasn't started yet
    if (asOfDate <= start) {
      return {
        projected: incomeToDate,
        periodsWorked: 0.1,
        totalPeriods: totalPeriods,
        monthlyRate: incomeToDate,
        firstPeriodFraction: totalPeriodsResult.firstPeriodFraction,
        startPeriodNumber: startPeriod.periodNumber,
        daysWorked: 1,
        daysInYear: Math.round(totalPeriods * 30)
      };
    }
    
    // Calculate equivalent PAYE periods worked
    const periodsWorkedResult = calculateEquivalentPeriods(start, asOfDate);
    periodsWorked = Math.max(0.1, periodsWorkedResult.equivalentPeriods);
    firstPeriodFraction = periodsWorkedResult.firstPeriodFraction;
  }
  
  // Calculate monthly rate and project
  const monthlyRate = incomeToDate / periodsWorked;
  let projected = monthlyRate * totalPeriods;
  
  // Round to 2 decimal places
  projected = Math.round(projected * 100) / 100;
  
  // Validation: ensure we don't return NaN or Infinity
  if (!isFinite(projected) || isNaN(projected)) {
    projected = incomeToDate;
  }
  
  return {
    projected,
    periodsWorked: Math.round(periodsWorked * 1000) / 1000,
    totalPeriods: Math.round(totalPeriods * 1000) / 1000,
    monthlyRate: Math.round(monthlyRate * 100) / 100,
    firstPeriodFraction: Math.round(firstPeriodFraction * 1000) / 1000,
    startPeriodNumber: startPeriod.periodNumber,
    // Legacy fields (approximate conversion for backwards compatibility)
    daysWorked: Math.round(periodsWorked * 30),
    daysInYear: Math.round(totalPeriods * 30)
  };
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
 * Calculate the marginal tax rate for a given taxable income level
 * This determines what rate applies to the next pound of income
 */
export function calculateMarginalRate(taxableIncome: number, bands: TaxBand[] = TAX_BANDS): number {
  if (taxableIncome < 0) return 0;
  
  for (const band of bands) {
    // If the current taxable income falls within this band, this is the marginal rate
    if (taxableIncome < band.limit) {
      return band.rate;
    }
  }
  
  // If we've gone through all bands, return the highest rate
  return bands[bands.length - 1].rate;
}

/**
 * Calculate incremental tax on additional taxable income
 * This applies the marginal rate(s) to new income added on top of existing taxable income
 */
export function calculateIncrementalTax(
  existingTaxableIncome: number,
  additionalIncome: number,
  bands: TaxBand[] = TAX_BANDS
): number {
  if (additionalIncome <= 0) return 0;
  
  // Calculate tax with and without the additional income
  const taxWithout = calculateTaxDue(existingTaxableIncome, bands);
  const taxWith = calculateTaxDue(existingTaxableIncome + additionalIncome, bands);
  
  // The difference is the incremental tax
  return Math.round((taxWith - taxWithout) * 100) / 100;
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
    let periodsWorked: number | undefined;
    let totalPeriods: number | undefined;
    let monthlyRate: number | undefined;
    let firstPeriodFraction: number | undefined;
    let startPeriodNumber: number | undefined;
    // Legacy fields
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
          source.monthsPaid,
          today,
          source.endDate
        );
        finalIncome = projection.projected;
        periodsWorked = projection.periodsWorked;
        totalPeriods = projection.totalPeriods;
        monthlyRate = projection.monthlyRate;
        firstPeriodFraction = projection.firstPeriodFraction;
        startPeriodNumber = projection.startPeriodNumber;
        // Legacy
        daysWorked = projection.daysWorked;
        daysInYear = projection.daysInYear;
        
        const periodNote = source.monthsPaid ? `${source.monthsPaid} months paid` : 'auto-calculated';
        
        // Build calculation string with PAYE period info
        if (firstPeriodFraction !== undefined && firstPeriodFraction < 1) {
          calculation = `£${source.incomeToDate.toFixed(2)} ÷ ${periodsWorked?.toFixed(3)} periods (${(firstPeriodFraction * 100).toFixed(1)}% of Period ${startPeriodNumber} + ${Math.floor(periodsWorked! - firstPeriodFraction)} full periods) × ${totalPeriods?.toFixed(3)} total periods = £${finalIncome.toFixed(2)} (${periodNote})`;
        } else {
          calculation = `£${source.incomeToDate.toFixed(2)} ÷ ${periodsWorked?.toFixed(3)} periods × ${totalPeriods?.toFixed(3)} total periods = £${finalIncome.toFixed(2)} (${periodNote})`;
        }
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
      periodsWorked,
      totalPeriods,
      monthlyRate,
      firstPeriodFraction,
      startPeriodNumber,
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
  
  // Separate adjustments into income-type (needs tax calculation) vs direct tax
  let totalAdjustmentTax = 0;
  let totalAdditionalTaxableIncome = 0;
  let currentTaxableIncome = taxableIncomeAfterDeductions; // Track position for marginal rate
  
  if (adjustments.length > 0) {
    for (const adjustment of adjustments) {
      if (isAdjustmentTaxableIncome(adjustment.type)) {
        // This is taxable income - calculate the marginal tax on it
        const incrementalTax = calculateIncrementalTax(
          currentTaxableIncome,
          adjustment.amount,
          taxBands
        );
        totalAdjustmentTax += incrementalTax;
        totalAdditionalTaxableIncome += adjustment.amount;
        
        const marginalRate = calculateMarginalRate(currentTaxableIncome, taxBands);
        breakdown.steps.push(
          `${adjustment.description}: £${adjustment.amount.toFixed(2)} taxable income ` +
          `→ £${incrementalTax.toFixed(2)} tax (at ~${(marginalRate * 100).toFixed(0)}% marginal rate)`
        );
        
        // Update position for next adjustment (they stack)
        currentTaxableIncome += adjustment.amount;
      } else {
        // This is direct tax (e.g., underpayment from previous year)
        totalAdjustmentTax += adjustment.amount;
        breakdown.steps.push(`${adjustment.description}: +£${adjustment.amount.toFixed(2)} (direct tax)`);
      }
    }
    breakdown.steps.push(`Total Additional Tax: £${totalAdjustmentTax.toFixed(2)}`);
  } else {
    breakdown.steps.push('No additional tax owed');
  }
  breakdown.steps.push('');
  
  // Step 7: Final Summary
  breakdown.steps.push('=== STEP 7: Final Summary ===');
  
  const finalTaxDue = taxDueOnIncome + totalAdjustmentTax;
  const taxPaid = sourceDetails.reduce((sum, d) => sum + d.taxPaid, 0);
  const netPosition = taxPaid - finalTaxDue;
  
  breakdown.steps.push(`Total Income: £${totalIncome.toFixed(2)}`);
  breakdown.steps.push(`Personal Allowance: £${personalAllowance.toFixed(2)}`);
  breakdown.steps.push(`Taxable Income (before deductions): £${taxableIncomeBeforeDeductions.toFixed(2)}`);
  breakdown.steps.push(`Deductions: -£${totalDeductions.toFixed(2)}`);
  breakdown.steps.push(`Taxable Income (after deductions): £${taxableIncomeAfterDeductions.toFixed(2)}`);
  if (totalAdditionalTaxableIncome > 0) {
    breakdown.steps.push(`Additional Taxable Income: +£${totalAdditionalTaxableIncome.toFixed(2)}`);
    breakdown.steps.push(`Final Taxable Income: £${currentTaxableIncome.toFixed(2)}`);
  }
  breakdown.steps.push(`Tax Due on Income: £${taxDueOnIncome.toFixed(2)}`);
  breakdown.steps.push(`Additional Tax Owed: +£${totalAdjustmentTax.toFixed(2)}`);
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
    taxableIncomeAfterDeductions: safeRound(currentTaxableIncome), // Include additional taxable income
    taxDueOnIncome: safeRound(taxDueOnIncome),
    totalAdjustments: safeRound(totalAdjustmentTax),
    finalTaxDue: safeRound(finalTaxDue),
    taxPaid: safeRound(taxPaid),
    netPosition: safeRound(netPosition),
    breakdown,
    sourceDetails,
    // Legacy fields for backwards compatibility
    taxableIncome: safeRound(currentTaxableIncome),
    taxDue: safeRound(finalTaxDue)
  };
}


