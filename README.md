# UK Tax Estimator 2025/26

A frontend-only tax calculation tool that estimates UK income tax for the 2025/26 tax year.

## Features

- ✅ **Real-time calculations** - Updates instantly as you type
- ✅ **CRUD operations** - Add, edit, and delete income sources
- ✅ **5 preloaded scenarios** - Test with common income situations
- ✅ **Advanced tax logic** - Includes personal allowance taper for high earners (>£100k)
- ✅ **Detailed breakdown** - See exactly how calculations are performed
- ✅ **Day-based annualisation** - Accurate projections based on days worked
- ✅ **Payroll date handling** - Intelligently includes/excludes current month based on payroll date

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will start at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## How It Works

### Tax Calculations

The calculator follows UK HMRC guidelines for 2025/26:

- **Tax Year**: 6 April 2025 - 5 April 2026 (366 days)
- **Personal Allowance**: £12,570
- **Tax Bands** (England, Wales, NI):
  - Basic Rate (20%): £0 - £37,700
  - Higher Rate (40%): £37,701 - £125,140
  - Additional Rate (45%): Over £125,140

### Personal Allowance Taper

For incomes over £100,000, the personal allowance is reduced:
- Reduction: £1 for every £2 over £100,000
- Fully withdrawn at £125,140

### Income Types

**Regular Income:**
- Projected to year-end based on days worked
- Takes into account start date, end date, and payroll date
- Can be manually overridden

**One-off Income:**
- Uses actual amount received
- Not projected or annualised

### Payroll Date Logic

The calculator intelligently handles payroll dates:
- If today's date < payroll date of current month: **Current month excluded** from "income to date"
- If today's date ≥ payroll date: **Current month included**

Example: If payroll is on the 30th and today is the 21st, the system assumes October's pay hasn't been received yet, so projects for the remaining period including October.

## File Structure

```
src/
├── calculationLogic.ts  # All tax calculation functions
├── App.tsx              # UI and table components
├── App.css              # Styling
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Preloaded Scenarios

1. **Empty** - Start with a blank slate
2. **Single Employment** - Basic PAYE employment
3. **Two Jobs** - Multiple concurrent employments
4. **Employment + One-off Pension** - Regular income plus lump sum
5. **High Earner (>£100k)** - Demonstrates personal allowance taper
6. **Multiple Pensions** - State pension, private pensions, and drawdown

## Testing the Calculator

To verify calculations:

1. Load a scenario or add income sources
2. Check the **Calculation Breakdown** section at the bottom
3. Review step-by-step workings including:
   - Income projection calculations
   - Personal allowance adjustments
   - Tax band applications
   - Final tax due

## Tax Calculation Logic

### Step 1: Calculate Projected/Actual Income
- Regular: `(income_to_date / days_worked) × days_in_period`
- One-off: `income_to_date` (actual)

### Step 2: Calculate Personal Allowance
- If total income ≤ £100k: Full £12,570 allowance
- If total income > £100k: Reduce by £1 per £2 over threshold
- If total income ≥ £125,140: No allowance (£0)

### Step 3: Calculate Taxable Income
- `Total Income - Personal Allowance = Taxable Income`

### Step 4: Apply Tax Bands
- First £37,700 at 20%
- Next £87,440 (to £125,140) at 40%
- Remainder at 45%

## Notes

- This is a frontend-only implementation with no backend or database
- All calculations are performed in the browser
- Data is not saved between sessions
- Tax calculations are for England, Wales & Northern Ireland only
- Scotland and Wales have different tax bands (not yet implemented)

## Future Enhancements

- [ ] Save scenarios to local storage
- [ ] Export to PDF/CSV
- [ ] Scottish/Welsh tax bands
- [ ] National Insurance calculations
- [ ] Multiple tax year support
- [ ] Historical data comparison

## License

MIT

## Disclaimer

This calculator is for estimation purposes only. For official tax calculations, please consult HMRC or a qualified tax advisor.


