# Tax Calculation Reference

## Quick Reference for UK Tax 2025/26

### Constants
- **Tax Year**: 6 April 2025 → 5 April 2026
- **Days in Year**: 366 (leap year)
- **Personal Allowance**: £12,570
- **Taper Threshold**: £100,000
- **Taper Limit**: £125,140

### Tax Bands (England, Wales, NI)

| Income Range | Rate | Band Name |
|--------------|------|-----------|
| £0 - £37,700 | 20% | Basic Rate |
| £37,701 - £125,140 | 40% | Higher Rate |
| £125,141+ | 45% | Additional Rate |

### Personal Allowance Taper

```
IF total_income ≤ £100,000:
    PA = £12,570

ELSE IF total_income ≥ £125,140:
    PA = £0

ELSE:
    excess = total_income - £100,000
    reduction = excess ÷ 2
    PA = £12,570 - reduction
```

**Example**: Income of £110,000
- Excess: £110,000 - £100,000 = £10,000
- Reduction: £10,000 ÷ 2 = £5,000
- PA: £12,570 - £5,000 = **£7,570**

### Income Projection (Regular Sources)

#### Step 1: Determine "As Of" Date

```
IF today < payroll_date_this_month:
    as_of_date = last_day_of_previous_month
ELSE:
    as_of_date = today
```

**Example**: Today is Oct 21, payroll is 30th of each month
- Oct 21 < Oct 30 → Use Sept 30 as "as of" date
- Income to date does NOT include October's pay

#### Step 2: Calculate Days Worked

```
days_worked = (as_of_date - start_date) + 1
```

**Example**: Started April 6, as of Sept 30
- Days: (Sept 30 - April 6) + 1 = 178 days

#### Step 3: Project Annual Income

```
daily_rate = income_to_date ÷ days_worked
days_in_period = (end_date - start_date) + 1
projected_income = daily_rate × days_in_period
```

**Example**: £18,106.06 earned in 178 days, working until April 5 (366 days total)
- Daily rate: £18,106.06 ÷ 178 = £101.72
- Projected: £101.72 × 366 = **£37,229.52**

### Tax Calculation

#### Step 1: Calculate Total Income
```
total_income = SUM(all_projected_or_actual_incomes)
```

#### Step 2: Apply Personal Allowance
```
personal_allowance = calculate_PA(total_income)
taxable_income = total_income - personal_allowance
```

#### Step 3: Calculate Tax by Bands
```
tax = 0
remaining = taxable_income

# Basic Rate (20%)
IF remaining > 0:
    basic_taxable = MIN(remaining, £37,700)
    tax += basic_taxable × 0.20
    remaining -= basic_taxable

# Higher Rate (40%)
IF remaining > 0:
    higher_taxable = MIN(remaining, £125,140 - £37,700)
    tax += higher_taxable × 0.40
    remaining -= higher_taxable

# Additional Rate (45%)
IF remaining > 0:
    tax += remaining × 0.45

RETURN tax
```

## Example Calculations

### Example 1: Single Employment (Under PA)

**Input:**
- Income to date: £5,000
- Start: 6 April 2025
- Payroll: 30th
- Today: 21 Oct 2025 (178 days worked)
- Type: Regular

**Calculation:**
1. Days worked: 178 (Apr 6 - Sept 30)
2. Daily rate: £5,000 ÷ 178 = £28.09
3. Projected: £28.09 × 366 = £10,281.74
4. Personal allowance: £12,570 (full)
5. Taxable: £10,281.74 - £12,570 = **£0**
6. **Tax due: £0**

---

### Example 2: Two Jobs

**Input:**
- Job A: £20,000 (projected)
- Job B: £15,000 (projected)

**Calculation:**
1. Total income: £35,000
2. Personal allowance: £12,570 (full)
3. Taxable: £35,000 - £12,570 = £22,430
4. Tax: £22,430 × 20% = **£4,486**

---

### Example 3: High Earner with Taper

**Input:**
- Employment: £90,000 (projected)
- Bonus: £25,000 (one-off)

**Calculation:**
1. Total income: £115,000
2. Taper calculation:
   - Excess: £115,000 - £100,000 = £15,000
   - Reduction: £15,000 ÷ 2 = £7,500
   - PA: £12,570 - £7,500 = £5,070
3. Taxable: £115,000 - £5,070 = £109,930
4. Tax calculation:
   - Basic: £37,700 × 20% = £7,540
   - Higher: £72,230 × 40% = £28,892
   - **Total tax: £36,432**

---

### Example 4: Employment + One-off Pension

**Input:**
- Employment: £36,000 (projected, ongoing)
- Pension: £11,250 (one-off, actual)

**Calculation:**
1. Total income: £47,250
2. Personal allowance: £12,570 (full)
3. Taxable: £47,250 - £12,570 = £34,680
4. Tax: £34,680 × 20% = **£6,936**

---

## Edge Cases

### Case 1: Income Exactly £100,000
- Excess: £0
- Reduction: £0
- PA: £12,570 (full allowance)

### Case 2: Income Exactly £125,140
- Excess: £25,140
- Reduction: £12,570
- PA: £0 (fully withdrawn)

### Case 3: Started Mid-Year
- Only count days from actual start date
- Don't use full tax year (366 days)
- Use: `(end_date - start_date) + 1`

### Case 4: One-off Payment
- No projection needed
- Use actual income received
- Still counts toward total for PA taper

## Common Mistakes to Avoid

❌ **Using months instead of days**
- HMRC uses day-based calculations
- Always calculate: `(date2 - date1) + 1`

❌ **Including current month when payroll hasn't occurred**
- Check: `today < payroll_date`
- If true, exclude current month

❌ **Applying PA to each source separately**
- PA applies to total income once
- Calculate total first, then apply PA

❌ **Forgetting the taper**
- Always check if income > £100k
- Taper dramatically increases effective tax rate

❌ **Rounding too early**
- Keep full precision during calculations
- Round only at final display

## Verification Checklist

✓ Days calculated correctly (inclusive of both start and end dates)
✓ Payroll date logic applied (current month included/excluded)
✓ All income sources summed
✓ PA taper applied correctly for high earners
✓ Tax bands applied in correct order
✓ Final amounts rounded to 2 decimal places
✓ One-off payments not projected
✓ Regular payments projected to year-end

## Testing Scenarios

Use these to verify your calculations:

1. **£0 income** → £0 tax
2. **£12,570 income** → £0 tax (full PA used)
3. **£50,000 income** → £7,486 tax
4. **£100,000 income** → £27,486 tax
5. **£125,140 income** → £43,307.60 tax (PA fully withdrawn)
6. **£150,000 income** → £54,493.60 tax

## Reference Links

- [HMRC PAYE Manual](https://www.gov.uk/hmrc-internal-manuals/paye-manual)
- [Tax rates 2025/26](https://www.gov.uk/income-tax-rates)
- [Personal Allowance reduction](https://www.gov.uk/income-tax-rates/income-over-100000)


