import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, BarChart3, Check, ChevronDown, CircleAlert, ClipboardCheck, FileCheck2, FileText, FolderUp, Info, Landmark, Printer, RotateCcw, ShieldCheck, Trash2, Upload, WalletCards } from 'lucide-react'

type Kind = 'budget' | 'expenses' | 'results'
type Status = 'attached' | 'missing' | 'incomplete'
type Source = { file: string; row: number }
type Budget = { category: string; amount: number; currency: string; source: Source }
type Expense = { id: string; date: string; category: string; amount: number; currency: string; vendor: string; description: string; status: Status; evidence: string; source: Source }
type Result = { id: string; indicator: string; target: number; actual: number; unit: string; status: Status; evidence: string; source: Source }
type StageRow = { id: string; line: number; values: Record<string, string>; extras: string[]; applied: boolean }
type Stage = { kind: Kind; fileName: string; headers: string[]; rows: StageRow[]; blankLines: number; headerErrors: string[]; rawText: string }
type Workspace = { budgets: Budget[]; expenses: Expense[]; results: Result[]; stage: Stage | null; sample: boolean }
type Screen = 'overview' | 'imports' | 'report'
type Validation<T> = { record: T | null; errors: string[] }

const KEY = 'sahaya-funder-report-demo-v1'
const required: Record<Kind, string[]> = {
  budget: ['category', 'amount', 'currency'],
  expenses: ['expense_id', 'date', 'category', 'amount', 'currency', 'vendor', 'description', 'evidence_status', 'evidence_ref'],
  results: ['result_id', 'indicator', 'target', 'actual', 'unit', 'evidence_status', 'evidence_ref'],
}

const sampleWorkspace: Workspace = {
  budgets: [
    { category: 'Learning materials', amount: 150000, currency: 'INR', source: { file: 'budget.csv (sample)', row: 2 } },
    { category: 'Educator stipends', amount: 210000, currency: 'INR', source: { file: 'budget.csv (sample)', row: 3 } },
    { category: 'Community sessions', amount: 90000, currency: 'INR', source: { file: 'budget.csv (sample)', row: 4 } },
  ],
  expenses: [
    { id: 'EX-101', date: '2026-04-08', category: 'Learning materials', amount: 68000, currency: 'INR', vendor: 'Northstar Books', description: 'Term 1 workbooks and reading kits', status: 'attached', evidence: 'INV-104', source: { file: 'expenses.csv (sample)', row: 2 } },
    { id: 'EX-102', date: '2026-04-18', category: 'Educator stipends', amount: 72000, currency: 'INR', vendor: 'Programme team', description: 'April educator stipends', status: 'attached', evidence: 'PAY-APR', source: { file: 'expenses.csv (sample)', row: 3 } },
    { id: 'EX-103', date: '2026-05-06', category: 'Community sessions', amount: 29000, currency: 'INR', vendor: 'Neighbourhood Hall', description: 'May learning circle venue', status: 'incomplete', evidence: 'Unsigned venue receipt', source: { file: 'expenses.csv (sample)', row: 4 } },
    { id: 'EX-104', date: '2026-05-15', category: 'Learning materials', amount: 47000, currency: 'INR', vendor: 'Northstar Books', description: 'Supplementary readers', status: 'missing', evidence: '', source: { file: 'expenses.csv (sample)', row: 5 } },
    { id: 'EX-105', date: '2026-06-01', category: 'Educator stipends', amount: 63000, currency: 'INR', vendor: 'Programme team', description: 'May educator stipends', status: 'attached', evidence: 'PAY-MAY', source: { file: 'expenses.csv (sample)', row: 6 } },
    { id: 'EX-106', date: '2026-06-16', category: 'Community sessions', amount: 28000, currency: 'INR', vendor: 'Neighbourhood Hall', description: 'June learning circle venue', status: 'attached', evidence: 'INV-233', source: { file: 'expenses.csv (sample)', row: 7 } },
  ],
  results: [
    { id: 'R-01', indicator: 'Children attending weekly learning circles', target: 200, actual: 180, unit: 'children', status: 'attached', evidence: 'Quarterly attendance register', source: { file: 'results.csv (sample)', row: 2 } },
    { id: 'R-02', indicator: 'Learning circles held', target: 24, actual: 18, unit: 'sessions', status: 'incomplete', evidence: 'Facilitator log missing week 11', source: { file: 'results.csv (sample)', row: 3 } },
    { id: 'R-03', indicator: 'Caregiver workshops', target: 8, actual: 6, unit: 'workshops', status: 'missing', evidence: '', source: { file: 'results.csv (sample)', row: 4 } },
  ],
  stage: null,
  sample: true,
}

function initialWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved) as Workspace
  } catch { /* start with the fictional example if browser storage is unavailable */ }
  return sampleWorkspace
}

function parseCsv(text: string) {
  const input = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  const rawHeaders = (rows.shift() ?? []).map((h) => h.trim())
  const headers = rawHeaders.map(normalizeHeader)
  let blankLines = 0
  const parsedRows = rows.flatMap((values, index) => {
    if (values.every((v) => !v.trim())) { blankLines += 1; return [] }
    const mapped: Record<string, string> = {}
    headers.forEach((header, i) => { if (header) mapped[header] = values[i] ?? '' })
    return [{ line: index + 2, values: mapped, extras: values.slice(headers.length).filter((v) => v.length > 0) }]
  })
  return { headers, rows: parsedRows, blankLines }
}

function normalizeHeader(value: string) { return value.trim().toLowerCase().replace(/[\s-]+/g, '_') }
function numberValue(value: string) { const normalized = value.trim().replace(/,/g, ''); return normalized ? Number(normalized) : Number.NaN }
function statusValue(value: string): Status | null {
  const normalized = value.trim().toLowerCase()
  return normalized === 'attached' || normalized === 'missing' || normalized === 'incomplete' ? normalized : null
}
function validate<T>(kind: Kind, values: Record<string, string>, extras: string[], file: string, line: number): Validation<T> {
  const errors: string[] = []
  for (const header of required[kind]) if (!Object.prototype.hasOwnProperty.call(values, header)) errors.push(`Missing required column “${header}”`)
  if (extras.length) errors.push(`Extra value(s) need attention: ${extras.join(', ')}`)
  const source = { file, row: line }
  const amount = numberValue(values.amount ?? '')
  const currency = (values.currency ?? '').trim().toUpperCase()
  if (kind === 'budget') {
    if (!values.category?.trim()) errors.push('Category is required')
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Amount must be a number greater than zero')
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a 3-letter code, such as INR')
    return { record: errors.length ? null : { category: values.category.trim(), amount, currency, source } as T, errors }
  }
  const status = statusValue(values.evidence_status ?? '')
  if (!status) errors.push('Evidence status must be attached, missing, or incomplete')
  if (status === 'attached' && !values.evidence_ref?.trim()) errors.push('Add an evidence reference when status is attached')
  if (kind === 'expenses') {
    const date = (values.date ?? '').trim()
    if (!values.expense_id?.trim()) errors.push('Expense ID is required')
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN
    if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== date) errors.push('Date must be a valid calendar date in YYYY-MM-DD format')
    if (!values.category?.trim()) errors.push('Category is required')
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Amount must be a number greater than zero')
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a 3-letter code, such as INR')
    if (!values.vendor?.trim()) errors.push('Vendor or payee is required')
    if (!values.description?.trim()) errors.push('Description is required')
    return { record: errors.length ? null : { id: values.expense_id.trim(), date, category: values.category.trim(), amount, currency, vendor: values.vendor.trim(), description: values.description.trim(), status: status!, evidence: values.evidence_ref.trim(), source } as T, errors }
  }
  const target = numberValue(values.target ?? '')
  const actual = numberValue(values.actual ?? '')
  if (!values.result_id?.trim()) errors.push('Result ID is required')
  if (!values.indicator?.trim()) errors.push('Indicator is required')
  if (!Number.isFinite(target) || target < 0) errors.push('Target must be zero or greater')
  if (!Number.isFinite(actual) || actual < 0) errors.push('Actual must be zero or greater')
  if (!values.unit?.trim()) errors.push('Unit is required')
  return { record: errors.length ? null : { id: values.result_id.trim(), indicator: values.indicator.trim(), target, actual, unit: values.unit.trim(), status: status!, evidence: values.evidence_ref.trim(), source } as T, errors }
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount) }
  catch { return `${currency} ${amount.toLocaleString('en-IN')}` }
}
function sourceText(source: Source) { return `${source.file} · row ${source.row}` }
function percent(actual: number, target: number) { return target > 0 ? Math.round(actual / target * 100) : 0 }
function kindLabel(kind: Kind) { return kind === 'budget' ? 'Budget' : kind === 'expenses' ? 'Expenses' : 'Programme results' }

function IconMark({ children }: { children: React.ReactNode }) { return <span className="icon-mark">{children}</span> }

export default function App() {
  const [data, setData] = useState<Workspace>(initialWorkspace)
  const [screen, setScreen] = useState<Screen>('overview')
  const [clearArmed, setClearArmed] = useState(false)
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const fileKind = useRef<Kind>('budget')
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* app remains usable for this tab */ } }, [data])

  const budgetTotal = data.budgets.reduce((sum, row) => sum + row.amount, 0)
  const actualTotal = data.expenses.reduce((sum, row) => sum + row.amount, 0)
  const currencies = Array.from(new Set([...data.budgets.map((r) => r.currency), ...data.expenses.map((r) => r.currency)]))
  const gaps = [...data.expenses.map((r) => ({ kind: 'Expense' as const, id: r.id, label: r.description, status: r.status, evidence: r.evidence, source: r.source })), ...data.results.map((r) => ({ kind: 'Result' as const, id: r.id, label: r.indicator, status: r.status, evidence: r.evidence, source: r.source }))].filter((r) => r.status !== 'attached')
  const completeCount = data.expenses.length + data.results.length - gaps.length

  const categoryRows = useMemo(() => {
    const keys = new Map<string, { category: string; currency: string; budget: number; actual: number; budgetSource?: Source; expenseSources: Source[] }>()
    for (const row of data.budgets) {
      const key = `${row.category}::${row.currency}`
      const current = keys.get(key) ?? { category: row.category, currency: row.currency, budget: 0, actual: 0, expenseSources: [] }
      current.budget += row.amount; current.budgetSource = row.source; keys.set(key, current)
    }
    for (const row of data.expenses) {
      const key = `${row.category}::${row.currency}`
      const current = keys.get(key) ?? { category: row.category, currency: row.currency, budget: 0, actual: 0, expenseSources: [] }
      current.actual += row.amount; current.expenseSources.push(row.source); keys.set(key, current)
    }
    return Array.from(keys.values()).sort((a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency))
  }, [data.budgets, data.expenses])

  function updateStage(callback: (stage: Stage) => Stage) {
    setData((previous) => previous.stage ? { ...previous, stage: callback(previous.stage) } : previous)
  }
  async function readFile(file: File, kind: Kind) {
    const rawText = await file.text()
    const parsed = parseCsv(rawText)
    const headerErrors = required[kind].filter((column) => !parsed.headers.includes(column)).map((column) => `Missing required column: ${column}`)
    const stage: Stage = {
      kind, fileName: file.name, headers: parsed.headers, blankLines: parsed.blankLines, headerErrors, rawText,
      rows: parsed.rows.map(({ line, values, extras }) => ({ id: `${Date.now()}-${kind}-${line}-${Math.random().toString(16).slice(2)}`, line, values, extras, applied: false })),
    }
    setData((previous) => ({ ...previous, stage }))
    setScreen('imports')
    setNotice(`${file.name} is ready to review. ${stage.rows.length} non-empty row(s) found.`)
  }
  function applyRows() {
    if (!data.stage || data.stage.headerErrors.length) return
    const stage = data.stage
    const validRows = stage.rows.filter((r) => !r.applied && validate(stage.kind, r.values, r.extras, stage.fileName, r.line).record)
    if (!validRows.length) { setNotice('No unreviewed valid rows to add. Correct the highlighted rows first.'); return }
    setData((previous) => {
      const current = previous.stage
      if (!current) return previous
      const base: Workspace = previous.sample ? { budgets: [], expenses: [], results: [], stage: current, sample: false } : { ...previous }
      if (stage.kind === 'budget') base.budgets = [...base.budgets, ...validRows.map((r) => validate<Budget>(stage.kind, r.values, r.extras, stage.fileName, r.line).record!).filter(Boolean)]
      if (stage.kind === 'expenses') base.expenses = [...base.expenses, ...validRows.map((r) => validate<Expense>(stage.kind, r.values, r.extras, stage.fileName, r.line).record!).filter(Boolean)]
      if (stage.kind === 'results') base.results = [...base.results, ...validRows.map((r) => validate<Result>(stage.kind, r.values, r.extras, stage.fileName, r.line).record!).filter(Boolean)]
      base.stage = { ...current, rows: current.rows.map((r) => validRows.some((used) => used.id === r.id) ? { ...r, applied: true } : r) }
      return base
    })
    setNotice(`${validRows.length} valid ${kindLabel(stage.kind).toLowerCase()} row(s) added. Any invalid rows remain in the review queue.`)
  }
  function editStageRow(id: string, header: string, value: string) {
    updateStage((stage) => ({ ...stage, rows: stage.rows.map((row) => row.id === id ? { ...row, values: { ...row.values, [header]: value } } : row) }))
  }
  function editExtras(id: string, value: string) {
    updateStage((stage) => ({ ...stage, rows: stage.rows.map((row) => row.id === id ? { ...row, extras: value ? [value] : [] } : row) }))
  }
  function resetToBlank() {
    setData({ budgets: [], expenses: [], results: [], stage: null, sample: false }); setClearArmed(false); setNotice('Session data cleared from this browser.')
  }
  function restoreSample() { setData(sampleWorkspace); setNotice('Fictional sample records restored.') }
  function printReport() { window.print() }
  function onChooseFile(kind: Kind) {
    if (data.stage && (data.stage.headerErrors.length > 0 || data.stage.rows.some((row) => !row.applied))) {
      setNotice('Finish or explicitly close the current review queue before opening another CSV. Unresolved rows will not be replaced silently.')
      setScreen('imports')
      return
    }
    fileKind.current = kind; fileInput.current?.click()
  }
  const stagePending = data.stage?.rows.some((row) => !row.applied) ?? false

  return <div className="app-shell">
    <aside className="sidebar no-print">
      <div className="brand"><div className="brand-symbol"><Landmark size={20} /></div><div><div className="brand-name">fieldnote</div><div className="brand-caption">GRANT REPORTS</div></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={screen === 'overview' ? 'nav-item selected' : 'nav-item'} onClick={() => setScreen('overview')}><BarChart3 size={17} /> Report overview</button>
        <button className={screen === 'imports' ? 'nav-item selected' : 'nav-item'} onClick={() => setScreen('imports')}><FolderUp size={17} /> Import records{stagePending && <i className="nav-dot" />}</button>
        <button className={screen === 'report' ? 'nav-item selected' : 'nav-item'} onClick={() => setScreen('report')}><FileText size={17} /> Draft report</button>
      </nav>
      <div className="sidebar-card">
        <div className="sidebar-card-top"><span className="eyebrow">CURRENT GRANT</span><span className="live-dot" /></div>
        <strong>Learning Access</strong>
        <span>Bright Futures Foundation</span>
        <span className="grant-period">01 Apr — 30 Jun 2026</span>
        <span className="grant-id">REF · LF-2026-04</span>
      </div>
      <div className="sidebar-bottom">
        <div className="privacy-note"><ShieldCheck size={16} /><span>Local demo<br /><b>Your files stay in this browser.</b></span></div>
        <button className="clear-link" onClick={() => clearArmed ? resetToBlank() : setClearArmed(true)}><Trash2 size={14} />{clearArmed ? 'Confirm clear session' : 'Clear session data'}</button>
        {clearArmed && <button className="cancel-clear" onClick={() => setClearArmed(false)}>Cancel</button>}
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar no-print">
        <div className="breadcrumbs">Sahaya Learning Collective <span>/</span> Grants <span>/</span> <b>Learning Access</b></div>
        <div className="topbar-right"><span className="fictional-tag"><i /> FICTIONAL SAMPLE NGO</span><span className="avatar">SC</span></div>
      </header>
      <div className="page-wrap">
        {notice && <div className="toast no-print" role="status"><Check size={15} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
        <section className="page-heading">
          <div><div className="eyebrow teal-eyebrow">REPORT PREPARATION <span>·</span> Q2 2026</div><h1>{screen === 'report' ? 'Draft funder report' : screen === 'imports' ? 'Import your records' : 'Report overview'}</h1><p>{screen === 'report' ? 'A working draft for your team to review before sharing.' : screen === 'imports' ? 'Bring together the records you already keep for this grant.' : 'A clear view of grant spending, programme progress, and evidence gaps.'}</p></div>
          <div className="heading-actions no-print">{!data.sample && !data.budgets.length && !data.expenses.length && !data.results.length && <button className="button secondary" onClick={restoreSample}><RotateCcw size={15} /> Restore sample</button>}{screen !== 'report' && <button className="button primary" onClick={() => setScreen('report')}><FileText size={16} /> Review draft <ArrowRight size={15} /></button>}</div>
        </section>
        <section className="grant-strip">
          <div className="grant-icon"><Landmark size={18} /></div><div className="grant-strip-main"><span>REPORTING PERIOD</span><strong>1 April — 30 June 2026</strong></div><div className="strip-divider" /><div className="grant-strip-main"><span>FUNDER</span><strong>Bright Futures Foundation</strong></div><div className="strip-divider" /><div className="grant-strip-main"><span>GRANT REFERENCE</span><strong>LF-2026-04</strong></div><div className="strip-draft"><span className="draft-pill"><i /> WORKING DRAFT</span></div>
        </section>

        {screen === 'overview' && <>
          {data.sample && <div className="sample-banner"><Info size={16} /><span><b>Sample records loaded.</b> Figures below are fictional. Your first valid CSV import replaces the sample set; later imports add records to your session.</span><button onClick={() => setScreen('imports')}>Import records <ArrowRight size={14} /></button></div>}
          <div className="section-title-row"><div><h2>At a glance</h2><p>Based on the records in this workspace</p></div><button className="text-button no-print" onClick={() => setScreen('imports')}><Upload size={15} /> Manage records</button></div>
          <div className="metric-grid">
            <MetricCard icon={<WalletCards size={18} />} label="Approved budget" value={currencies.length > 1 ? `${currencies.length} currencies` : money(budgetTotal, currencies[0] || 'INR')} note={`${data.budgets.length} budget line${data.budgets.length === 1 ? '' : 's'} · budget.csv`} tone="blue" />
            <MetricCard icon={<ArrowDownToLine size={18} />} label="Recorded spend" value={currencies.length > 1 ? `${currencies.length} currencies` : money(actualTotal, currencies[0] || 'INR')} note={`${data.expenses.length} expense record${data.expenses.length === 1 ? '' : 's'} · expenses.csv`} tone="green" />
            <MetricCard icon={<BarChart3 size={18} />} label="Programme indicators" value={`${data.results.length}`} note="Reported against grant targets" tone="purple" />
            <MetricCard icon={<ClipboardCheck size={18} />} label="Evidence gaps" value={`${gaps.length}`} note={`${completeCount} record${completeCount === 1 ? '' : 's'} marked complete`} tone={gaps.length ? 'amber' : 'green'} alert={gaps.length > 0} />
          </div>

          <div className="content-grid">
            <section className="panel spend-panel">
              <div className="panel-heading"><div><h2>Budget vs actual</h2><p>Spend grouped by budget category</p></div><span className="panel-count">{categoryRows.length} categories</span></div>
              {categoryRows.length ? <div className="table-wrap"><table><thead><tr><th>Category</th><th>Approved budget</th><th>Actual spend</th><th>Budget used</th></tr></thead><tbody>{categoryRows.map((row) => <tr key={`${row.category}-${row.currency}`}><td><strong>{row.category}</strong><SourceNote source={row.budgetSource} extra={row.expenseSources} /></td><td className="numeric">{row.budget ? money(row.budget, row.currency) : <span className="muted">No budget line</span>}<SourceInline source={row.budgetSource} /></td><td className="numeric">{money(row.actual, row.currency)}<SourceInline sources={row.expenseSources} /></td><td><UsageBar value={row.budget ? row.actual / row.budget * 100 : row.actual > 0 ? 100 : 0} label={row.budget ? `${Math.round(row.actual / row.budget * 100)}%` : '—'} /></td></tr>)}</tbody></table></div> : <EmptyState title="No budget or expense records yet" text="Import the CSVs you already use to see spending by category." action="Import records" onClick={() => setScreen('imports')} />}
              <div className="panel-footnote"><Info size={14} /> Figures are calculated from the imported rows shown in this workspace.</div>
            </section>
            <section className="panel results-panel">
              <div className="panel-heading"><div><h2>Programme results</h2><p>Progress toward agreed targets</p></div><span className="panel-count">{data.results.length} indicators</span></div>
              {data.results.length ? <div className="results-list">{data.results.map((row) => <div className="result-item" key={`${row.id}-${row.source.file}-${row.source.row}`}><div className="result-top"><div><strong>{row.indicator}</strong><span>{row.actual.toLocaleString('en-IN')} / {row.target.toLocaleString('en-IN')} {row.unit}</span></div><b>{percent(row.actual, row.target)}%</b></div><div className="result-track"><div style={{ width: `${Math.min(100, Math.max(0, percent(row.actual, row.target)))}%` }} /></div><SourceInline source={row.source} /><div className="result-status"><EvidenceTag status={row.status} />{row.status !== 'attached' && <span>{row.evidence || 'No evidence reference recorded'}</span>}</div></div>)}</div> : <EmptyState title="No result indicators yet" text="Import the programme-results CSV to compare actuals with targets." action="Import records" onClick={() => setScreen('imports')} />}
              <div className="panel-footnote"><Info size={14} /> Percentages show actual ÷ target; results are not independently verified.</div>
            </section>
          </div>

          <section className="panel evidence-panel">
            <div className="panel-heading"><div className="evidence-heading"><IconMark><ClipboardCheck size={18} /></IconMark><div><h2>Supporting evidence checklist</h2><p>Follow up on records marked missing or incomplete</p></div></div><span className={gaps.length ? 'gap-count' : 'complete-pill'}>{gaps.length ? `${gaps.length} need attention` : 'All marked complete'}</span></div>
            {gaps.length ? <div className="evidence-table-wrap"><table className="evidence-table"><thead><tr><th>Record</th><th>Description</th><th>Status</th><th>Reference on file</th><th>Source</th></tr></thead><tbody>{gaps.map((gap) => <tr key={`${gap.kind}-${gap.id}-${gap.source.file}-${gap.source.row}`}><td><span className="record-type">{gap.kind}</span><strong>{gap.id}</strong></td><td>{gap.label}</td><td><EvidenceTag status={gap.status} /></td><td className="muted">{gap.evidence || 'No reference recorded'}</td><td><SourceChip source={gap.source} /></td></tr>)}</tbody></table></div> : <div className="all-clear"><Check size={16} /> No records are marked as missing or incomplete.</div>}
            <div className="evidence-foot">This checklist reflects evidence status recorded in your CSVs. It does not verify that documents exist or are sufficient.</div>
          </section>

          <div className="bottom-cta no-print"><div><div className="cta-icon"><FileCheck2 size={19} /></div><div><strong>Ready to review the report?</strong><span>See the figures, source notes and evidence gaps together in a printable draft.</span></div></div><button className="button primary" onClick={() => setScreen('report')}>Open draft report <ArrowRight size={15} /></button></div>
        </>}

        {screen === 'imports' && <ImportScreen data={data} onPick={onChooseFile} onApply={applyRows} onDismiss={() => {
          const unresolved = data.stage?.rows.filter((row) => !row.applied).length ?? 0
          const blockedFile = (data.stage?.headerErrors.length ?? 0) > 0
          const fileName = data.stage?.fileName ?? 'CSV file'
          setData((prev) => ({ ...prev, stage: null }))
          setNotice(unresolved || blockedFile ? `Unresolved data from ${fileName} was discarded from the review queue. Rows already added to the workspace remain.` : 'Import review closed. Added records remain in the workspace.')
        }} onEdit={editStageRow} onEditExtras={editExtras} />}
        {screen === 'report' && <ReportScreen data={data} categoryRows={categoryRows} gaps={gaps} onPrint={printReport} onBack={() => setScreen('overview')} />}

        <footer className="app-footer no-print"><span>Fieldnote is a local prototype for staff review.</span><span>Figures come from records in this workspace · <button onClick={() => setScreen('imports')}>View import history</button></span></footer>
      </div>
    </main>
    <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden-file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, fileKind.current); event.target.value = '' }} />
  </div>
}

function MetricCard({ icon, label, value, note, tone, alert }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string; alert?: boolean }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}{alert && <CircleAlert size={14} />}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>
}
function SourceNote({ source, extra }: { source?: Source; extra?: Source[] }) {
  if (!source && !extra?.length) return null
  return <div className="source-note">{source ? sourceText(source) : ''}{extra?.length ? ` · ${extra.length} spend row(s)` : ''}</div>
}
function SourceInline({ source, sources, extra }: { source?: Source; sources?: Source[]; extra?: string }) {
  const allSources = sources?.length ? sources : source ? [source] : []
  if (!allSources.length) return null
  const labels = allSources.map(sourceText)
  return <span className="source-inline" title={labels.join(' · ')}>{labels.join(' · ')}{extra ? ` · ${extra}` : ''}</span>
}
function SourceChip({ source }: { source: Source }) { return <span className="source-chip"><FileText size={12} /> {sourceText(source)}</span> }
function UsageBar({ value, label }: { value: number; label: string }) { return <div className="usage"><div className="usage-track"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><b>{label}</b></div> }
function EvidenceTag({ status }: { status: Status }) { return <span className={`evidence-tag ${status}`}><i />{status === 'attached' ? 'Complete' : status === 'missing' ? 'Missing' : 'Incomplete'}</span> }
function EmptyState({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) { return <div className="empty-state"><div className="empty-icon"><FolderUp size={19} /></div><strong>{title}</strong><span>{text}</span><button className="button secondary" onClick={onClick}>{action} <ArrowRight size={14} /></button></div> }

function ImportScreen({ data, onPick, onApply, onDismiss, onEdit, onEditExtras }: { data: Workspace; onPick: (kind: Kind) => void; onApply: () => void; onDismiss: () => void; onEdit: (id: string, header: string, value: string) => void; onEditExtras: (id: string, value: string) => void }) {
  const stage = data.stage
  const validCount = stage?.rows.filter((r) => !r.applied && validate(stage.kind, r.values, r.extras, stage.fileName, r.line).record).length ?? 0
  const invalidCount = stage?.rows.filter((r) => !r.applied && !validate(stage.kind, r.values, r.extras, stage.fileName, r.line).record).length ?? 0
  const appliedCount = stage?.rows.filter((r) => r.applied).length ?? 0
  const unappliedCount = stage?.rows.filter((r) => !r.applied).length ?? 0
  const [showFormats, setShowFormats] = useState(false)
  return <>
    <div className="section-title-row import-section-title"><div><h2>Bring in the records you already keep</h2><p>CSV files are read in your browser and stay on this device.</p></div><button className="text-button" onClick={() => setShowFormats(!showFormats)}><Info size={15} /> CSV column guide <ChevronDown size={14} className={showFormats ? 'rotated' : ''} /></button></div>
    {showFormats && <div className="format-guide"><b>Required columns</b><span><strong>Budget:</strong> category, amount, currency</span><span><strong>Expenses:</strong> expense_id, date, category, amount, currency, vendor, description, evidence_status, evidence_ref</span><span><strong>Programme results:</strong> result_id, indicator, target, actual, unit, evidence_status, evidence_ref</span><small>Evidence status values: attached, missing, incomplete. Dates use YYYY-MM-DD. Amounts are plain numbers. Header names are not case-sensitive.</small></div>}
    {data.sample && <div className="import-sample-note"><Info size={15} /> Applying the first valid import replaces the fictional sample records across all three sections. Later imports add rows to your workspace.</div>}
    <div className="import-cards">
      <ImportCard kind="budget" title="Budget" subtitle="Approved grant budget by category" icon={<WalletCards size={18} />} sourceCount={data.budgets.length} onPick={onPick} />
      <ImportCard kind="expenses" title="Expenses" subtitle="Transactions posted to this grant" icon={<ArrowDownToLine size={18} />} sourceCount={data.expenses.length} onPick={onPick} />
      <ImportCard kind="results" title="Programme results" subtitle="Indicator targets and reporting-period actuals" icon={<BarChart3 size={18} />} sourceCount={data.results.length} onPick={onPick} />
    </div>
    <section className="panel import-review">
      <div className="panel-heading"><div><h2>Import review queue</h2><p>Check each row before it is added to your report.</p></div>{stage && <span className="panel-count">{stage.fileName}</span>}</div>
      {!stage ? <div className="queue-empty"><div className="queue-empty-mark"><Upload size={20} /></div><div><strong>No file waiting for review</strong><span>Choose a CSV above. Valid rows can be added while invalid rows stay here for correction.</span></div></div> : <>
        {stage.headerErrors.length > 0 && <div className="file-error"><CircleAlert size={17} /><div><b>The header row needs correction.</b><span>{stage.headerErrors.join(' · ')}. Your uploaded file is retained in this review state. Correct the column names and upload it again.</span></div><button onClick={() => downloadText(stage.fileName, stage.rawText)}>Download original CSV</button></div>}
        <div className="review-summary"><span><b>{stage.rows.length}</b> non-empty rows found</span>{stage.blankLines > 0 && <span>{stage.blankLines} blank line(s) ignored</span>}{appliedCount > 0 && <span className="summary-applied"><Check size={13} /> {appliedCount} added</span>}{validCount > 0 && <span className="summary-valid"><Check size={13} /> {validCount} ready</span>}{invalidCount > 0 && <span className="summary-invalid"><CircleAlert size={13} /> {invalidCount} need correction</span>}</div>
        {stage.rows.length > 0 && <div className="staged-rows">{stage.rows.map((row) => {
          const outcome = validate(stage.kind, row.values, row.extras, stage.fileName, row.line)
          return <article className={`staged-row ${outcome.record ? 'row-valid' : 'row-invalid'} ${row.applied ? 'row-applied' : ''}`} key={row.id}>
            <div className="staged-row-head"><div><span className="row-number">CSV ROW {row.line}</span><strong>{outcome.record ? row.applied ? 'Added to workspace' : 'Ready to add' : 'Needs correction'}</strong></div>{row.applied ? <span className="row-state added"><Check size={13} /> Added</span> : outcome.record ? <span className="row-state ready"><Check size={13} /> Valid</span> : <span className="row-state error"><CircleAlert size={13} /> {outcome.errors.length} issue(s)</span>}</div>
            <div className="staged-fields">{stage.headers.map((header) => <label className="staged-field" key={header}><span>{header.replace(/_/g, ' ')}</span><input value={row.values[header] ?? ''} onChange={(event) => onEdit(row.id, header, event.target.value)} aria-label={`Row ${row.line} ${header}`} /></label>)}{row.extras.length > 0 && <label className="staged-field extra-field"><span>Extra column values</span><div><input value={row.extras.join(', ')} readOnly aria-label={`Row ${row.line} extra values`} /><button className="mini-button" onClick={() => onEditExtras(row.id, '')}>Remove</button></div></label>}</div>
            {outcome.errors.length > 0 && <div className="row-errors"><CircleAlert size={14} /><span>{outcome.errors.join(' · ')}</span></div>}
            <div className="row-source"><FileText size={12} /> {stage.fileName} · row {row.line}</div>
          </article>
        })}</div>}
        <div className="queue-actions">{validCount > 0 && !stage.headerErrors.length && <button className="button primary" onClick={onApply}><Check size={15} /> Add {validCount} valid row{validCount === 1 ? '' : 's'} <ArrowRight size={14} /></button>}<button className="button secondary" onClick={onDismiss}>{stage.headerErrors.length ? 'Discard file with header errors' : unappliedCount ? `Discard ${unappliedCount} unadded row${unappliedCount === 1 ? '' : 's'}` : 'Close import review'}</button><span>Rows with issues remain visible until corrected or explicitly discarded.</span></div>
      </>}
    </section>
    <div className="download-samples"><div><strong>Need a starting point?</strong><span>Download example files with the required columns and fictional records.</span></div><div className="sample-links"><a href={`${import.meta.env.BASE_URL}examples/budget.csv`} download><ArrowDownToLine size={14} /> Budget CSV</a><a href={`${import.meta.env.BASE_URL}examples/expenses.csv`} download><ArrowDownToLine size={14} /> Expenses CSV</a><a href={`${import.meta.env.BASE_URL}examples/results.csv`} download><ArrowDownToLine size={14} /> Results CSV</a></div></div>
    <div className="local-note"><ShieldCheck size={16} /><span><b>Private by design for this demo.</b> Imports are read locally in this browser and saved to local browser storage. No sign-in or network upload is used. Use fictional or anonymized data only.</span></div>
  </>
}

function ImportCard({ kind, title, subtitle, icon, sourceCount, onPick }: { kind: Kind; title: string; subtitle: string; icon: React.ReactNode; sourceCount: number; onPick: (kind: Kind) => void }) {
  const link = kind === 'budget' ? 'budget.csv' : kind === 'expenses' ? 'expenses.csv' : 'results.csv'
  return <article className="import-card"><div className="import-card-top"><IconMark>{icon}</IconMark><span className="current-records">{sourceCount} row{sourceCount === 1 ? '' : 's'} loaded</span></div><h3>{title}</h3><p>{subtitle}</p><button className="button secondary upload-button" onClick={() => onPick(kind)}><Upload size={14} /> Choose CSV file</button><a className="example-link" href={`${import.meta.env.BASE_URL}examples/${link}`} download><ArrowDownToLine size={13} /> Download example CSV</a></article>
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url)
}

function ReportScreen({ data, categoryRows, gaps, onPrint, onBack }: { data: Workspace; categoryRows: { category: string; currency: string; budget: number; actual: number; budgetSource?: Source; expenseSources: Source[] }[]; gaps: { kind: 'Expense' | 'Result'; id: string; label: string; status: Status; evidence: string; source: Source }[]; onPrint: () => void; onBack: () => void }) {
  const budgets = data.budgets.reduce((sum, row) => sum + row.amount, 0)
  const spend = data.expenses.reduce((sum, row) => sum + row.amount, 0)
  const currencies = Array.from(new Set([...data.budgets.map((r) => r.currency), ...data.expenses.map((r) => r.currency)]))
  const currency = currencies[0] || 'INR'
  const pluralCurrencies = currencies.length > 1
  const groupedSpend = pluralCurrencies ? currencies.map((code) => `${money(data.expenses.filter((row) => row.currency === code).reduce((sum, row) => sum + row.amount, 0), code)}`).join(' · ') : money(spend, currency)
  const groupedBudget = pluralCurrencies ? currencies.map((code) => `${money(data.budgets.filter((row) => row.currency === code).reduce((sum, row) => sum + row.amount, 0), code)}`).join(' · ') : money(budgets, currency)
  return <>
    <div className="report-toolbar no-print"><div><span className="draft-pill"><i /> DRAFT FOR STAFF REVIEW</span><span className="report-toolbar-hint">Print, or choose “Save as PDF” in the print dialog.</span></div><div><button className="button secondary" onClick={onBack}>Back to overview</button><button className="button primary" onClick={onPrint}><Printer size={15} /> Print / save PDF</button></div></div>
    <article className="report-document">
      <header className="report-doc-header"><div className="report-brand"><div className="brand-symbol"><Landmark size={19} /></div><span>SAHAYA LEARNING COLLECTIVE</span></div><span className="report-draft-stamp">DRAFT · FOR STAFF REVIEW</span></header>
      <div className="report-kicker">GRANT REPORT · Q2 2026</div><h2>Learning Access Programme</h2><p className="report-subtitle">Bright Futures Foundation <span>·</span> Grant LF-2026-04</p>
      <div className="report-meta"><div><span>REPORTING PERIOD</span><b>1 April — 30 June 2026</b></div><div><span>ORGANIZATION</span><b>Sahaya Learning Collective</b></div><div><span>REPORT STATUS</span><b><span className="draft-pill"><i /> Draft for review</span></b></div></div>
      <section className="report-section"><h3>1. Financial summary</h3><p>During this reporting period, recorded expenditure was <b>{groupedSpend}</b> against a recorded approved budget of <b>{groupedBudget}</b>. Category figures below are drawn from the budget and expense rows currently in this workspace.</p>
        <div className="table-wrap"><table><thead><tr><th>Budget category</th><th>Approved budget</th><th>Actual expenditure</th><th>Variance</th><th>Source</th></tr></thead><tbody>{categoryRows.length ? categoryRows.map((row) => <tr key={`${row.category}-${row.currency}`}><td><b>{row.category}</b></td><td className="numeric">{row.budget ? money(row.budget, row.currency) : '—'}</td><td className="numeric">{money(row.actual, row.currency)}</td><td className="numeric">{row.budget ? money(row.budget - row.actual, row.currency) : '—'}</td><td><SourceInline sources={[...(row.budgetSource ? [row.budgetSource] : []), ...row.expenseSources]} /></td></tr>) : <tr><td colSpan={5} className="empty-cell">No budget or expense rows imported.</td></tr>}</tbody></table></div>
      </section>
      <section className="report-section"><h3>2. Programme results</h3><p>Reported actuals are compared with the targets included in the programme-results file.</p><div className="table-wrap"><table><thead><tr><th>Indicator</th><th>Target</th><th>Reported actual</th><th>Progress</th><th>Evidence status</th><th>Source</th></tr></thead><tbody>{data.results.length ? data.results.map((row) => <tr key={`${row.id}-${row.source.file}-${row.source.row}`}><td><b>{row.indicator}</b></td><td className="numeric">{row.target.toLocaleString('en-IN')} {row.unit}</td><td className="numeric">{row.actual.toLocaleString('en-IN')} {row.unit}</td><td>{percent(row.actual, row.target)}%</td><td><EvidenceTag status={row.status} /></td><td><SourceInline source={row.source} /></td></tr>) : <tr><td colSpan={6} className="empty-cell">No programme results imported.</td></tr>}</tbody></table></div></section>
      <section className="report-section"><h3>3. Supporting evidence follow-up</h3><p>{gaps.length ? `${gaps.length} record(s) are marked missing or incomplete in the source data and need staff follow-up:` : 'No records are currently marked missing or incomplete in the source data.'}</p>{gaps.length > 0 && <ul className="report-gap-list">{gaps.map((gap) => <li key={`${gap.kind}-${gap.id}-${gap.source.row}`}><EvidenceTag status={gap.status} /><b>{gap.id}</b> — {gap.label}{gap.evidence ? ` · ${gap.evidence}` : ' · No reference recorded'} <span>({sourceText(gap.source)})</span></li>)}</ul>}</section>
      <section className="report-section report-notes"><h3>4. Preparation notes</h3><ul><li>All figures and evidence statuses are reproduced from records in this workspace.</li><li>Supporting documents have not been independently reviewed or verified.</li><li>This draft requires staff review and editing before it is shared with the funder.</li></ul></section>
      <footer className="report-doc-footer"><span>Sahaya Learning Collective · Learning Access</span><span>Working draft · Generated from local workspace records</span></footer>
    </article>
    <div className="report-disclaimer"><Info size={15} /> This prototype organizes report inputs. It does not certify legal, regulatory or funder compliance.</div>
  </>
}
