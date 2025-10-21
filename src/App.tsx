import { useState } from 'react';
import './App.css';
import {
  IncomeSource,
  calculateTax,
  CalculationResult,
  TAX_YEAR_START,
  TAX_YEAR_END
} from './calculationLogic';

// Preloaded scenarios
const SCENARIOS = {
  empty: {
    name: 'Empty',
    sources: []
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
        payrollDate: 30
      }
    ]
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
        payrollDate: 30
      },
      {
        id: '2',
        name: 'Secondary Job',
        incomeToDate: 8000,
        isRegular: true,
        startDate: '2025-06-01',
        endDate: '2026-04-05',
        payrollDate: 15
      }
    ]
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
        payrollDate: 30
      },
      {
        id: '2',
        name: 'Scottish Widows Pension',
        incomeToDate: 11250,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        payrollDate: 1,
        taxPaid: 3452.06  // Emergency 0T code over-taxation
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
        payrollDate: 28
      },
      {
        id: '2',
        name: 'Bonus Payment',
        incomeToDate: 25000,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        payrollDate: 1,
        taxPaid: 11250  // 45% emergency tax rate
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
        payrollDate: 1
      },
      {
        id: '2',
        name: 'Private Pension 1',
        incomeToDate: 15000,
        isRegular: true,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        payrollDate: 15
      },
      {
        id: '3',
        name: 'One-off Pension Drawdown',
        incomeToDate: 20000,
        isRegular: false,
        startDate: '2025-04-06',
        endDate: '2026-04-05',
        payrollDate: 1,
        taxPaid: 9000  // 45% emergency tax
      }
    ]
  }
};

function App() {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Calculate whenever sources change
  const recalculate = (newSources: IncomeSource[]) => {
    setSources(newSources);
    if (newSources.length > 0) {
      const calculationResult = calculateTax(newSources);
      setResult(calculationResult);
    } else {
      setResult(null);
    }
  };

  // Load a scenario
  const loadScenario = (scenarioKey: keyof typeof SCENARIOS) => {
    const scenario = SCENARIOS[scenarioKey];
    recalculate(scenario.sources as IncomeSource[]);
  };

  // Add new income source
  const addSource = () => {
    const newSource: IncomeSource = {
      id: Date.now().toString(),
      name: 'New Income Source',
      incomeToDate: 0,
      isRegular: true,
      startDate: TAX_YEAR_START.toISOString().split('T')[0],
      endDate: TAX_YEAR_END.toISOString().split('T')[0],
      payrollDate: 30
    };
    recalculate([...sources, newSource]);
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
    recalculate(newSources);
  };

  // Delete a source
  const deleteSource = (id: string) => {
    recalculate(sources.filter(s => s.id !== id));
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
      </section>

      <section className="table-section">
        <div className="table-header">
          <h2>Income Sources</h2>
          <button onClick={addSource} className="add-btn">+ Add Income Source</button>
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
                  <th>Income Name</th>
                  <th>Income Earned So Far (£)</th>
                  <th>Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Payroll Date (Day)</th>
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
                  const breakdown = result?.breakdown.sources.find(s => s.name === source.name);
                  const detail = result?.sourceDetails[idx];
                  const projectedOrActual = breakdown?.projectedOrActual || 0;

                  return (
                    <tr key={source.id}>
                      <td>
                        <input
                          type="text"
                          value={source.name}
                          onChange={(e) => updateSource(source.id, 'name', e.target.value)}
                          className="input-field"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={source.incomeToDate}
                          onChange={(e) => updateSource(source.id, 'incomeToDate', parseFloat(e.target.value) || 0)}
                          className="input-field numeric"
                          step="0.01"
                        />
                      </td>
                      <td>
                        <select
                          value={source.isRegular ? 'regular' : 'one-off'}
                          onChange={(e) => updateSource(source.id, 'isRegular', e.target.value === 'regular')}
                          className="input-field"
                        >
                          <option value="regular">Regular</option>
                          <option value="one-off">One-off</option>
                        </select>
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
                          <input
                            type="number"
                            value={source.payrollDate}
                            onChange={(e) => updateSource(source.id, 'payrollDate', parseInt(e.target.value) || 1)}
                            className="input-field numeric"
                            min="1"
                            max="31"
                          />
                        ) : (
                          <span className="disabled-cell">N/A</span>
                        )}
                      </td>
                      <td>
                        <div className="projected-cell">
                          <input
                            type="number"
                            value={source.projectedIncome !== undefined ? source.projectedIncome : projectedOrActual}
                            onChange={(e) => updateSource(source.id, 'projectedIncome', parseFloat(e.target.value) || 0)}
                            className="input-field numeric projected"
                            step="0.01"
                            placeholder="Auto-calculated"
                          />
                          <span className="cell-label">
                            {source.isRegular ? '(Projected)' : '(Actual)'}
                          </span>
                        </div>
                      </td>
                      {/* NEW: Tax Paid */}
                      <td>
                        {!source.isRegular ? (
                          <input
                            type="number"
                            value={source.taxPaid || 0}
                            onChange={(e) => updateSource(source.id, 'taxPaid', parseFloat(e.target.value) || 0)}
                            className="input-field numeric"
                            step="0.01"
                            placeholder="Enter tax paid"
                          />
                        ) : (
                          <span className="calculated-value">
                            {detail?.taxPaid.toFixed(2) || '0.00'}
                          </span>
                        )}
                      </td>
                      {/* NEW: PA Used */}
                      <td className="calculated-cell">
                        {detail?.paUsed.toFixed(2) || '0.00'}
                      </td>
                      {/* NEW: Tax Due */}
                      <td className="calculated-cell">
                        {detail?.taxDue.toFixed(2) || '0.00'}
                      </td>
                      {/* NEW: Over/(Under) */}
                      <td className={`calculated-cell ${
                        detail && detail.difference > 0 ? 'positive' : 
                        detail && detail.difference < 0 ? 'negative' : ''
                      }`}>
                        {detail ? (
                          <>
                            {detail.difference > 0 ? '+' : ''}
                            {detail.difference.toFixed(2)}
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
                    <td><strong>TOTAL</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td><strong>£{result.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.taxPaid.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.personalAllowance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td><strong>£{result.taxDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
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

      {result && (
        <>
          <section className="summary">
            <h2>Tax Summary</h2>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="label">Total Income:</span>
                <span className="value">£{result.totalIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="summary-item">
                <span className="label">Personal Allowance:</span>
                <span className="value">£{result.personalAllowance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="summary-item">
                <span className="label">Taxable Income:</span>
                <span className="value">£{result.taxableIncome.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="summary-item">
                <span className="label">Tax Due:</span>
                <span className="value">£{result.taxDue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="summary-item">
                <span className="label">Tax Paid:</span>
                <span className="value">£{result.taxPaid.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className={`summary-item highlight ${result.netPosition > 0 ? 'refund' : result.netPosition < 0 ? 'owed' : ''}`}>
                <span className="label">Net Position:</span>
                <span className="value">
                  {result.netPosition > 0 ? '+' : ''}£{Math.abs(result.netPosition).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="position-label">
                    {result.netPosition > 0 ? ' (Refund)' : result.netPosition < 0 ? ' (Owed)' : ' (Balanced)'}
                  </span>
                </span>
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


