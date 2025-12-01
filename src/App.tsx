import { useEffect, useState } from 'react';
import './App.css';
import {
  IncomeSource,
  Deduction,
  TaxAdjustment,
  calculateTax,
  CalculationResult,
  TAX_YEAR_START,
  TAX_YEAR_END,
  isAdjustmentTaxableIncome
} from './calculationLogic';

// Preloaded scenarios
const SCENARIOS = {
  empty: {
    name: 'Empty',
    sources: [],
    deductions: [],
    adjustments: []
  },
  singleEmployment: {
    name: 'Single Employment',
    sources: [
      {
        id: '1',
        name: 'Main Employment',
        incomeToDate: 18106.06,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      }
    ],
    deductions: [],
    adjustments: []
  },
  twoJobs: {
    name: 'Two Jobs',
    sources: [
      {
        id: '1',
        name: 'Primary Job',
        incomeToDate: 15000,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '2',
        name: 'Secondary Job',
        incomeToDate: 8000,
        isRegular: true,
        startDate: '2025-06-01',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      }
    ],
    deductions: [
      {
        id: 'd1',
        description: 'Job Expenses',
        amount: 1200,
        category: 'job_expenses' as const
      },
      {
        id: 'd2',
        description: 'Professional Subscriptions',
        amount: 240,
        category: 'professional_subs' as const
      }
    ],
    adjustments: []
  },
  employmentPlusPension: {
    name: 'Employment + One-off Pension',
    sources: [
      {
        id: '1',
        name: 'Tesco Employment',
        incomeToDate: 18106.06,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '2',
        name: 'Scottish Widows Pension',
        incomeToDate: 11250,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true,
        taxPaid: 3452.06  // Emergency 0T code over-taxation
      }
    ],
    deductions: [],
    adjustments: [
      {
        id: 'a1',
        description: '2024/25 Underpayment',
        amount: 850,
        type: 'underpayment' as const
      }
    ]
  },
  highEarner: {
    name: 'High Earner (>£100k)',
    sources: [
      {
        id: '1',
        name: 'Senior Position',
        incomeToDate: 65000,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '2',
        name: 'Bonus Payment',
        incomeToDate: 25000,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true,
        taxPaid: 11250  // 45% emergency tax rate
      }
    ],
    deductions: [
      {
        id: 'd1',
        description: 'Flat Rate Expenses',
        amount: 140,
        category: 'fre' as const
      }
    ],
    adjustments: [
      {
        id: 'a1',
        description: 'Untaxed Interest',
        amount: 65,
        type: 'untaxed_interest' as const
      }
    ]
  },
  multiplePensions: {
    name: 'Multiple Pensions',
    sources: [
      {
        id: '1',
        name: 'State Pension',
        incomeToDate: 5800,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '2',
        name: 'Private Pension 1',
        incomeToDate: 15000,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '3',
        name: 'One-off Pension Drawdown',
        incomeToDate: 20000,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true,
        taxPaid: 9000  // 45% emergency tax
      }
    ],
    deductions: [],
    adjustments: []
  },
  scottishEarner: {
    name: 'Scottish Earner',
    useScottishBands: true,
    sources: [
      {
        id: '1',
        name: 'Scottish Employment',
        incomeToDate: 20000,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true
      },
      {
        id: '2',
        name: 'Seasonal Overtime',
        incomeToDate: 4000,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        includeCurrentMonth: true,
        taxPaid: 800
      }
    ],
    deductions: [],
    adjustments: []
  }
};

function App() {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [adjustments, setAdjustments] = useState<TaxAdjustment[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [useScottishBands, setUseScottishBands] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true);

  useEffect(() => {
    if (sources.length > 0) {
      const recalculated = calculateTax(sources, deductions, adjustments, {
        useScottishBands
      });
      setResult(recalculated);
    } else {
      setResult(null);
    }
  }, [sources, deductions, adjustments, useScottishBands]);

  // Calculate whenever sources, deductions, or adjustments change
  const recalculate = (
    newSources: IncomeSource[],
    newDeductions: Deduction[] = deductions,
    newAdjustments: TaxAdjustment[] = adjustments
  ) => {
    setSources(newSources);
    setDeductions(newDeductions);
    setAdjustments(newAdjustments);
  };

  // Load a scenario
  const loadScenario = (scenarioKey: keyof typeof SCENARIOS) => {
    const scenario = SCENARIOS[scenarioKey];
    const nextScottish = (scenario as { useScottishBands?: boolean }).useScottishBands ?? false;
    setUseScottishBands(nextScottish);
    recalculate(
      scenario.sources as IncomeSource[], 
      scenario.deductions as Deduction[], 
      scenario.adjustments as TaxAdjustment[]
    );
  };

  // Add new income source
  const addSource = () => {
    const newSource: IncomeSource = {
      id: Date.now().toString(),
      name: '',
      incomeToDate: 0,
      isRegular: true,
      startDate: TAX_YEAR_START.toISOString().split('T')[0],
      endDate: TAX_YEAR_END.toISOString().split('T')[0],
      includeCurrentMonth: true
    };
    recalculate([...sources, newSource], deductions, adjustments);
  };

  // Clear all data
  const clearAllData = () => {
    if (window.confirm('Are you sure you want to clear all data? This will remove all income sources, deductions, and adjustments.')) {
      setSources([]);
      setDeductions([]);
      setAdjustments([]);
      setResult(null);
    }
  };

  // Update a source
  const updateSource = (id: string, field: keyof IncomeSource, value: any) => {
    const newSources = sources.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };
        // Clear projected income override if user changes calculation inputs
        if (field !== 'projectedIncome' && field !== 'name') {
          delete updated.projectedIncome;
        }
        return updated;
      }
      return s;
    });
    recalculate(newSources, deductions, adjustments);
  };

  // Delete a source
  const deleteSource = (id: string) => {
    recalculate(sources.filter(s => s.id !== id), deductions, adjustments);
  };

  // Helper function to get description from deduction category
  const getDeductionDescription = (category: Deduction['category']): string => {
    const descriptions: Record<Deduction['category'], string> = {
      job_expenses: 'Job Expenses',
      professional_subs: 'Professional Subscriptions',
      fre: 'Flat Rate Expenses',
      marriage_allowance: 'Marriage Allowance',
      gift_aid: 'Gift Aid',
      other: ''
    };
    return descriptions[category];
  };

  // Deduction CRUD
  const addDeduction = () => {
    const newDeduction: Deduction = {
      id: Date.now().toString(),
      description: '',
      amount: 0,
      category: 'other'
    };
    const newDeductions = [...deductions, newDeduction];
    recalculate(sources, newDeductions, adjustments);
  };

  const updateDeduction = (id: string, field: keyof Deduction, value: any) => {
    const newDeductions = deductions.map(d => {
      if (d.id === id) {
        const updated = { ...d, [field]: value };
        // Auto-populate description when category changes
        if (field === 'category') {
          updated.description = getDeductionDescription(value);
        }
        return updated;
      }
      return d;
    });
    recalculate(sources, newDeductions, adjustments);
  };

  const deleteDeduction = (id: string) => {
    const newDeductions = deductions.filter(d => d.id !== id);
    recalculate(sources, newDeductions, adjustments);
  };

  // Helper function to get description from adjustment type
  const getAdjustmentDescription = (type: TaxAdjustment['type']): string => {
    const descriptions: Record<TaxAdjustment['type'], string> = {
      underpayment: 'Prior Year Underpayment',
      untaxed_interest: 'Untaxed Interest',
      benefit_in_kind: 'Benefit in Kind',
      state_benefits: 'State Benefits',
      other: ''
    };
    return descriptions[type];
  };

  // Adjustment CRUD
  const addAdjustment = () => {
    const newAdjustment: TaxAdjustment = {
      id: Date.now().toString(),
      description: '',
      amount: 0,
      type: 'other'
    };
    const newAdjustments = [...adjustments, newAdjustment];
    recalculate(sources, deductions, newAdjustments);
  };

  const updateAdjustment = (id: string, field: keyof TaxAdjustment, value: any) => {
    const newAdjustments = adjustments.map(a => {
      if (a.id === id) {
        const updated = { ...a, [field]: value };
        // Auto-populate description when type changes
        if (field === 'type') {
          updated.description = getAdjustmentDescription(value);
        }
        return updated;
      }
      return a;
    });
    recalculate(sources, deductions, newAdjustments);
  };

  const deleteAdjustment = (id: string) => {
    const newAdjustments = adjustments.filter(a => a.id !== id);
    recalculate(sources, deductions, newAdjustments);
  };

  return (
    <div className="app">
      <header>
        <h1>🧾 UK Tax Estimator 2025/26</h1>
        <p>Calculate your in-year tax position</p>
      </header>

      <section className="scenarios">
        <h3>Load Scenario:</h3>
        <div className="scenario-buttons">
          {Object.entries(SCENARIOS).map(([key, scenario]) => (
            <button
              key={key}
              onClick={() => loadScenario(key as keyof typeof SCENARIOS)}
              className="scenario-btn"
            >
              {scenario.name}
            </button>
          ))}
        </div>
        {(sources.length > 0 || deductions.length > 0 || adjustments.length > 0) && (
          <div className="clear-all-container">
            <button onClick={clearAllData} className="clear-all-btn">
              🗑️ Clear All Data
            </button>
          </div>
        )}
      </section>

      <section className="table-section">
        <div className="table-header">
          <h2>Income Sources</h2>
          <div className="table-actions">
            <label className="region-toggle">
              <input
                type="checkbox"
                checked={useScottishBands}
                onChange={(e) => setUseScottishBands(e.target.checked)}
              />
              <span>Use Scottish tax bands</span>
            </label>
            <button onClick={addSource} className="add-btn">+ Add Income Source</button>
          </div>
        </div>

        {sources.length === 0 ? (
          <div className="empty-state">
            <p>No income sources yet. Add one or load a scenario to get started.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="income-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Income Name</th>
                  <th>Income Earned So Far (£)</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Include Current Month?</th>
                  <th>Projected/Actual Income (£)</th>
                  <th>Tax Paid (£)</th>
                  <th>PA Used (£)</th>
                  <th>Tax Due (£)</th>
                  <th>Over/(Under) (£)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source, idx) => {
                  // Use index to match breakdown and detail (not name, as names can be duplicated)
                  const breakdown = result?.breakdown.sources[idx];
                  const detail = result?.sourceDetails[idx];
                  const projectedOrActual = breakdown?.projectedOrActual || 0;

                  return (
                    <tr key={source.id}>
                      {/* Type - First Column */}
                      <td>
                        <select
                          value={source.isRegular ? 'regular' : 'one-off'}
                          onChange={(e) => updateSource(source.id, 'isRegular', e.target.value === 'regular')}
                          className="input-field type-select"
                        >
                          <option value="regular">Regular</option>
                          <option value="one-off">One-off</option>
                        </select>
                      </td>
                      {/* Income Name */}
                      <td>
                        <input
                          type="text"
                          value={source.name}
                          onChange={(e) => updateSource(source.id, 'name', e.target.value)}
                          className="input-field"
                        />
                      </td>
                      {/* Income Earned So Far */}
                      <td>
                        <input
                          type="number"
                          value={source.incomeToDate || ''}
                          onChange={(e) => updateSource(source.id, 'incomeToDate', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          className="input-field numeric"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        {source.isRegular ? (
                          <input
                            type="date"
                            value={source.startDate}
                            onChange={(e) => updateSource(source.id, 'startDate', e.target.value)}
                            className="input-field"
                          />
                        ) : (
                          <span className="disabled-cell">N/A</span>
                        )}
                      </td>
                      <td>
                        {source.isRegular ? (
                          <input
                            type="date"
                            value={source.endDate}
                            onChange={(e) => updateSource(source.id, 'endDate', e.target.value)}
                            className="input-field"
                          />
                        ) : (
                          <span className="disabled-cell">N/A</span>
                        )}
                      </td>
                      <td>
                        {source.isRegular ? (
                          <button
                            type="button"
                            onClick={() => updateSource(source.id, 'includeCurrentMonth', !source.includeCurrentMonth)}
                            className={`include-toggle ${source.includeCurrentMonth ? 'on' : 'off'}`}
                            aria-pressed={source.includeCurrentMonth}
                            title={source.includeCurrentMonth ? 'Click to exclude current month from projection' : 'Click to include current month in projection'}
                          >
                            {source.includeCurrentMonth ? 'Include' : 'Exclude'}
                          </button>
                        ) : (
                          <span className="disabled-cell">N/A</span>
                        )}
                      </td>
                      <td>
                        <div className="projected-cell">
                          <input
                            type="number"
                            value={source.projectedIncome !== undefined && source.projectedIncome !== 0 ? 
                              source.projectedIncome : 
                              (projectedOrActual !== 0 ? projectedOrActual : '')
                            }
                            onChange={(e) => updateSource(source.id, 'projectedIncome', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            className="input-field numeric projected"
                            step="0.01"
                            placeholder="Auto-calculated"
                          />
                          <span className="cell-label">
                            {source.isRegular ? '(Projected)' : '(Actual)'}
                          </span>
                        </div>
                      </td>
                      {/* Tax Paid - Editable for all sources */}
                      <td>
                        <input
                          type="number"
                          value={source.taxPaid !== undefined && source.taxPaid !== 0 ? 
                            source.taxPaid : 
                            (detail?.taxPaid && detail.taxPaid !== 0 ? detail.taxPaid : '')
                          }
                          onChange={(e) => updateSource(source.id, 'taxPaid', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          className="input-field numeric"
                          step="0.01"
                          placeholder={source.isRegular ? "Auto-balanced" : "Enter tax paid"}
                        />
                      </td>
                      {/* PA Used */}
                      <td className="calculated-cell">
                        {detail ? detail.paUsed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      </td>
                      {/* Tax Due */}
                      <td className="calculated-cell">
                        {detail ? detail.taxDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                      </td>
                      {/* Over/(Under) */}
                      <td className={`calculated-cell ${
                        detail && detail.difference > 0 ? 'positive' : 
                        detail && detail.difference < 0 ? 'negative' : ''
                      }`}>
                        {detail ? (
                          <>
                            {detail.difference > 0 ? '+' : ''}
                            {detail.difference.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </>
                        ) : '0.00'}
                      </td>
                      <td>
                        <button
                          onClick={() => deleteSource(source.id)}
                          className="delete-btn"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {/* TOTALS ROW */}
                {result && sources.length > 0 && (
                  <tr className="totals-row">
                    <td></td>
                    <td><strong>TOTAL</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td><strong>£{result.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.taxPaid.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.personalAllowance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.finalTaxDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td className={`totals-difference ${result.netPosition > 0 ? 'positive' : result.netPosition < 0 ? 'negative' : ''}`}>
                      <strong>
                        {result.netPosition > 0 ? '+' : ''}£{Math.abs(result.netPosition).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                      <span className="net-label">
                        {result.netPosition > 0 ? ' (Refund)' : result.netPosition < 0 ? ' (Owed)' : ' (Balanced)'}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Allowances Section (formerly Deductions) */}
      <section className="deductions-section">
        <div className="section-header-static">
          <h2>
            Allowances
            {deductions.length > 0 && (
              <span className="section-count">
                ({deductions.length} item{deductions.length !== 1 ? 's' : ''} · 
                -£{deductions.reduce((sum, d) => sum + d.amount, 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            )}
          </h2>
          <button onClick={addDeduction} className="add-btn-small">
            + Add Allowance
          </button>
        </div>

        <div className="subsection-content">
          {deductions.length === 0 ? (
            <p className="empty-message">No allowances. Click "+ Add Allowance" to add job expenses, professional subscriptions, etc.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount (£)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((deduction) => (
                    <tr key={deduction.id}>
                      <td>
                        <input
                          type="text"
                          value={deduction.description}
                          onChange={(e) => updateDeduction(deduction.id, 'description', e.target.value)}
                          className="input-field"
                          placeholder="e.g., Job Expenses"
                        />
                      </td>
                      <td>
                        <select
                          value={deduction.category}
                          onChange={(e) => updateDeduction(deduction.id, 'category', e.target.value)}
                          className="input-field"
                        >
                          <option value="job_expenses">Job Expenses</option>
                          <option value="professional_subs">Professional Subscriptions</option>
                          <option value="fre">Flat Rate Expenses</option>
                          <option value="marriage_allowance">Marriage Allowance</option>
                          <option value="gift_aid">Gift Aid</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={deduction.amount || ''}
                          onChange={(e) => updateDeduction(deduction.id, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          className="input-field numeric"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => deleteDeduction(deduction.id)}
                          className="delete-btn-small"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </section>

      {/* Deductions Section (formerly Additional Tax Owed) */}
      <section className="adjustments-section">
        <div className="section-header-static">
          <h2>
            Deductions
            {adjustments.length > 0 && (
              <span className="section-count">
                ({adjustments.length} item{adjustments.length !== 1 ? 's' : ''} · 
                +£{adjustments.reduce((sum, a) => sum + a.amount, 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            )}
          </h2>
          <button onClick={addAdjustment} className="add-btn-small">
            + Add Deduction
          </button>
        </div>

        <div className="subsection-content">
          {adjustments.length === 0 ? (
            <p className="empty-message">No deductions. Click "+ Add Deduction" to add prior underpayments, untaxed interest, etc.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount (£) <span style={{ fontWeight: 'normal', fontSize: '0.85em' }}>*</span></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                    <tr key={adjustment.id}>
                      <td>
                        <input
                          type="text"
                          value={adjustment.description}
                          onChange={(e) => updateAdjustment(adjustment.id, 'description', e.target.value)}
                          className="input-field"
                          placeholder="e.g., 2024/25 Underpayment"
                        />
                      </td>
                      <td>
                        <select
                          value={adjustment.type}
                          onChange={(e) => updateAdjustment(adjustment.id, 'type', e.target.value)}
                          className="input-field"
                        >
                          <option value="underpayment">Prior Year Underpayment</option>
                          <option value="untaxed_interest">Untaxed Interest</option>
                          <option value="benefit_in_kind">Benefit in Kind</option>
                          <option value="state_benefits">State Benefits</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={adjustment.amount || ''}
                          onChange={(e) => updateAdjustment(adjustment.id, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                          className="input-field numeric"
                          step="0.01"
                          placeholder={isAdjustmentTaxableIncome(adjustment.type) ? "Income amount" : "Tax amount"}
                          title={isAdjustmentTaxableIncome(adjustment.type) 
                            ? "Enter the taxable income amount (tax will be calculated at your marginal rate)" 
                            : "Enter the additional tax amount directly"}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => deleteAdjustment(adjustment.id)}
                          className="delete-btn-small"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: '0.9em', marginTop: '10px', fontStyle: 'italic', color: '#666' }}>
              * For <strong>Untaxed Interest, Benefits in Kind, and State Benefits</strong>: enter the income amount (tax will be calculated at your marginal rate). 
              For <strong>Prior Year Underpayments and Other</strong>: enter the tax amount directly.
            </p>
        </div>
      </section>

      {result && (
        <>
          <section className="summary">
            <h2>Final Tax Summary</h2>
            
            <div className="summary-detailed">
              <div className="summary-section">
                <h3>Income & Allowances</h3>
                <div className="summary-line">
                  <span className="summary-label">Total Income</span>
                  <span className="summary-value">£{result.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-line deduction">
                  <span className="summary-label">Personal Allowance</span>
                  <span className="summary-value">-£{result.personalAllowance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-line subtotal">
                  <span className="summary-label">Taxable (before deductions)</span>
                  <span className="summary-value">£{result.taxableIncomeBeforeDeductions.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {result.totalDeductions > 0 && (
                <div className="summary-section">
                  <h3>Allowances</h3>
                  {deductions.map((d) => (
                    <div key={d.id} className="summary-line">
                      <span className="summary-label">{d.description}</span>
                      <span className="summary-value">-£{d.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="summary-line subtotal">
                    <span className="summary-label">Total Allowances</span>
                    <span className="summary-value">-£{result.totalDeductions.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              <div className="summary-section">
                <h3>Tax Calculation</h3>
                <div className="summary-line">
                  <span className="summary-label">Tax Region</span>
                  <span className="summary-value textual">{useScottishBands ? 'Scotland (NSND rates)' : 'England / Wales / Northern Ireland'}</span>
                </div>
                <div className="summary-line highlight-line">
                  <span className="summary-label">Final Taxable Income</span>
                  <span className="summary-value">£{result.taxableIncomeAfterDeductions.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-line">
                  <span className="summary-label">Tax Due on Income</span>
                  <span className="summary-value">£{result.taxDueOnIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {result.totalAdjustments > 0 && (
                <div className="summary-section">
                  <h3>Deductions</h3>
                  {adjustments.map((a) => (
                    <div key={a.id} className="summary-line">
                      <span className="summary-label">{a.description}</span>
                      <span className="summary-value">+£{a.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="summary-line subtotal">
                    <span className="summary-label">Total Deductions</span>
                    <span className="summary-value">+£{result.totalAdjustments.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              <div className="summary-section final-section">
                <div className="summary-line total-line">
                  <span className="summary-label">Total Tax Due</span>
                  <span className="summary-value">£{result.finalTaxDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-line total-line">
                  <span className="summary-label">Total Tax Paid</span>
                  <span className="summary-value">£{result.taxPaid.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className={`summary-line net-position-line ${result.netPosition > 0 ? 'refund' : result.netPosition < 0 ? 'owed' : 'balanced'}`}>
                  <span className="summary-label">NET POSITION</span>
                  <span className="summary-value">
                    {result.netPosition > 0 ? '+' : ''}£{Math.abs(result.netPosition).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="position-status">
                      {result.netPosition > 0 ? ' (REFUND DUE)' : result.netPosition < 0 ? ' (TAX OWED)' : ' (BALANCED)'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="breakdown">
            <div className="breakdown-header">
              <h2>Calculation Breakdown</h2>
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="toggle-btn"
              >
                {showBreakdown ? '▼ Hide' : '▶ Show'}
              </button>
            </div>

            {showBreakdown && (
              <div className="breakdown-content">
                <div className="breakdown-section">
                  <h3>Income Calculations</h3>
                  {result.breakdown.sources.map((source, idx) => (
                    <div key={idx} className="breakdown-item">
                      <strong>{source.name}:</strong>
                      <div className="breakdown-detail">
                        {source.calculation}
                      </div>
                      {source.daysWorked && (
                        <div className="breakdown-meta">
                          Days worked: {source.daysWorked} | Days in period: {source.daysInYear}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="breakdown-section">
                  <h3>Step-by-Step Tax Calculation</h3>
                  <div className="breakdown-steps">
                    {result.breakdown.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className={step.startsWith('===') ? 'step-header' : 'step-line'}
                      >
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <footer>
        <p>
          Tax Year: 6 April 2025 - 5 April 2026 | 
          This calculator uses UK tax rates for England, Wales & Northern Ireland
        </p>
      </footer>
    </div>
  );
}

export default App;


