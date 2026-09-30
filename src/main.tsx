import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { demoActivity, fetchActivity, ForecastError, isAddress, shorten } from './activity'
import type { WeatherKind } from './activity'
import './styles.css'

const explorerUrl = (address: string) => `https://etherscan.io/token/${address}`
const clockTime = (value: number | string) => new Date(value).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function Icon({ name, size = 18 }: { name: 'copy' | 'external' | 'refresh' | 'arrow' | 'cloud' | 'bolt' | 'sun' | 'pulse'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'copy') return <svg {...common}><rect x="9" y="9" width="10" height="10" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  if (name === 'external') return <svg {...common}><path d="M14 3h7v7" /><path d="m10 14 11-11" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
  if (name === 'refresh') return <svg {...common}><path d="M20 11a8.1 8.1 0 0 0-14.8-4L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8.1 8.1 0 0 0 14.8 4L21 15" /><path d="M21 20v-5h-5" /></svg>
  if (name === 'arrow') return <svg {...common}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
  if (name === 'bolt') return <svg {...common}><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>
  if (name === 'sun') return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
  if (name === 'pulse') return <svg {...common}><path d="M3 12h4l2.2-6 4.4 12 2.2-6H21" /></svg>
  return <svg {...common}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 1 1 1 9Z" /></svg>
}

function WeatherGlyph({ kind }: { kind: WeatherKind }) {
  if (kind === 'lightning') return <div className="weather-glyph lightning-glyph" aria-hidden="true"><span className="glyph-cloud"><Icon name="cloud" size={72} /></span><span className="glyph-bolt"><Icon name="bolt" size={36} /></span></div>
  if (kind === 'stormy') return <div className="weather-glyph storm-glyph" aria-hidden="true"><span className="glyph-cloud"><Icon name="cloud" size={72} /></span><span className="rain-lines">···</span></div>
  if (kind === 'breezy') return <div className="weather-glyph breezy-glyph" aria-hidden="true"><span className="glyph-sun"><Icon name="sun" size={50} /></span><span className="wind-lines">≋</span></div>
  return <div className="weather-glyph calm-glyph" aria-hidden="true"><span className="glyph-sun"><Icon name="sun" size={64} /></span></div>
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: 'pulse' | 'sun' | 'arrow' | 'bolt' }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon name={icon} size={16} /></span></div>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
}

function App() {
  const [activity, setActivity] = useState(demoActivity)
  const [address, setAddress] = useState(activity.address)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')
  const [copyError, setCopyError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => { requestRef.current?.abort(); window.clearTimeout(copyTimer.current) }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const weatherLabel = { calm: 'Calm', breezy: 'Breezy', stormy: 'Stormy', lightning: 'Lightning' }[activity.weather]
  const changeLabel = activity.activityChange === null ? 'New activity' : `${activity.activityChange > 0 ? '+' : ''}${activity.activityChange}%`

  async function readForecast(value: string) {
    if (loading) return
    const trimmed = value.trim()
    if (!isAddress(trimmed)) {
      setError('Enter an Ethereum address: 0x followed by 40 hexadecimal characters.')
      setInvalid(true)
      inputRef.current?.focus()
      return
    }
    setError(''); setInvalid(false); setLoading(true); setNotice('')
    const controller = new AbortController()
    requestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 45000)
    try {
      const result = await fetchActivity(trimmed, controller.signal, setProgress)
      setActivity(result); setAddress(trimmed); setCopyError('')
      setNotice(`${result.symbol} forecast loaded: ${result.transferCount} transfers. ${result.summary}`)
    } catch (cause) {
      const isInvalid = cause instanceof ForecastError && cause.kind === 'address'
      setInvalid(isInvalid)
      setError(controller.signal.aborted
        ? 'The scan timed out. Try again in a moment; your previous forecast is still below.'
        : cause instanceof ForecastError ? cause.message
        : 'Unable to reach the explorer. Check your connection and try again. Your previous forecast is still below.')
      if (isInvalid) inputRef.current?.focus()
    } finally {
      window.clearTimeout(timeout); setLoading(false); setProgress('')
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void readForecast(address) }
  async function copyAddress() {
    setNotice(''); setCopyError('')
    try {
      await navigator.clipboard.writeText(activity.address)
      setCopied(true); setNotice('Contract address copied')
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch { setCopyError('Clipboard access is unavailable. Select and copy the full contract address shown above.') }
  }
  function useSample() {
    const sample = demoActivity()
    setAddress(sample.address); setActivity(sample); setError(''); setInvalid(false); setCopyError('')
    setNotice('Illustrative sample loaded. Select Read the forecast for live data.')
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to forecast</a>
    <header className="topbar">
      <a className="brand" href="./" aria-label="Token Weather home"><span className="brand-mark"><Icon name="bolt" size={18} /></span><span>token<span className="brand-accent">weather</span></span></a>
      <div className="network-pill"><span className="network-dot" /> Ethereum mainnet</div>
    </header>
    <main id="main-content" tabIndex={-1}>
      <section className="intro-section" aria-labelledby="page-title">
        <div className="eyebrow"><span className="eyebrow-line" /> On-chain forecast <span className="eyebrow-line" /></div>
        <h1 id="page-title">What’s the weather<br /><span>around your token?</span></h1>
        <p className="intro-copy">Turn Ethereum transfers into a forecast you can read at a glance. A little clarity in a changing climate.</p>
        <form className="search-form" onSubmit={submit} noValidate>
          <label htmlFor="token-address">ERC-20 token contract address</label>
          <div className={`search-row ${invalid ? 'has-error' : ''}`}>
            <div className="input-wrap"><input ref={inputRef} id="token-address" name="token-address" type="text" inputMode="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={address} onChange={event => setAddress(event.target.value)} aria-invalid={invalid} aria-describedby={error ? 'address-help address-error' : 'address-help'} placeholder="0x…" /></div>
            <button className="primary-button" type="submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Reading the forecast…</> : <>Read the forecast <Icon name="arrow" size={17} /></>}</button>
          </div>
          <div className="form-meta"><span id="address-help">Ethereum mainnet · no wallet needed</span><button type="button" className="sample-button" onClick={useSample} disabled={loading}>Try USDC sample <Icon name="arrow" size={13} /></button></div>
          {error && <p className="field-error" id="address-error" role="alert">{error}</p>}
          <p className="load-progress" role="status">{progress}</p>
        </form>
      </section>

      <section className="dashboard" aria-labelledby="token-title" aria-busy={loading}>
        <div className="dashboard-head">
          <div><p className="section-kicker">{activity.isDemo ? 'Sample conditions' : 'Observed conditions'}</p><div className="token-title-row"><h2 id="token-title">{activity.symbol} <span>·</span> {activity.name}</h2><a className="icon-link" href={explorerUrl(activity.address)} target="_blank" rel="noreferrer" aria-label="Open token on Etherscan (new tab)"><Icon name="external" size={15} /></a></div></div>
          <div className="updated">{activity.isDemo ? 'Illustrative forecast' : `As of ${clockTime(activity.endTime)} UTC`}<button className="refresh-button" type="button" disabled={loading} onClick={() => void readForecast(activity.address)} aria-label={`Refresh ${activity.symbol} forecast`}><Icon name="refresh" size={15} /></button></div>
        </div>
        <div className="contract-row"><code className="contract-address">{activity.address}</code><button className="copy-button" type="button" onClick={copyAddress}><Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy address'}</button>{activity.isDemo && <span className="demo-badge">Sample data</span>}</div>
        {copyError && <p className="field-error" role="alert">{copyError}</p>}
        <p className="data-note">{loading ? 'Reading a new forecast. The previous report remains below.' : activity.isDemo ? 'Illustrative numbers. Read the forecast above to fetch live on-chain activity.' : `Indexed transfers from ${clockTime(activity.endTime - 300000)} to ${clockTime(activity.endTime)} UTC. Explorer indexing may lag.`}</p>
        <div className="hero-grid">
          <article className={`weather-card ${activity.weather}`}>
            <div className="weather-card-top"><span className="weather-label"><span className="status-dot" /> {weatherLabel} conditions</span><span className="period-label">1-minute window</span></div>
            <div className="weather-main"><WeatherGlyph kind={activity.weather} /><div className="weather-reading"><span className="reading-label">Transfer climate</span><strong>{weatherLabel}</strong><p>{activity.summary}</p></div></div>
            <div className="weather-footer"><span><Icon name="pulse" size={15} /> {activity.transferCount.toLocaleString()} transfers</span><span className="change-pill"><Icon name="arrow" size={13} /> {changeLabel} vs previous 1 min</span></div>
          </article>
          <aside className="signal-card" aria-label="Transfer activity by minute">
            <div className="signal-orb" aria-hidden="true"><span /><span /><span /></div>
            <div><span className="signal-label">Minute by minute</span><strong>{activity.weather === 'lightning' ? 'High voltage' : activity.weather === 'stormy' ? 'Heavy traffic' : activity.weather === 'breezy' ? 'Picking up' : 'Steady skies'}</strong><p>{activity.previousCount.toLocaleString()} transfers in the previous 1 minute.</p></div>
            <div className="minute-chart" role="img" aria-label={`Transfers per minute, oldest to newest: ${activity.bins.join(', ')}`}>
              {activity.bins.map((count, i) => <span key={i} className="minute-column"><i style={{ height: `${Math.max(3, count / Math.max(1, ...activity.bins) * 38)}px` }} /><small>{count}</small></span>)}
            </div>
          </aside>
        </div>
        <div className="stats-grid">
          <StatCard label="Recent transfers" value={activity.transferCount.toLocaleString()} detail="in the 1-minute window" icon="pulse" />
          <StatCard label="Unique senders" value={activity.uniqueSenders.toLocaleString()} detail="distinct origin addresses" icon="sun" />
          <StatCard label="Unique receivers" value={activity.uniqueReceivers.toLocaleString()} detail="distinct destination addresses" icon="arrow" />
          <StatCard label="Largest transfer" value={activity.largestTransfer} detail="single transfer · rounded" icon="bolt" />
        </div>
        <details className="method-details"><summary>How to read this forecast</summary><div className="method-copy">
          <p>Two consecutive one-minute windows are compared. Counts, unique addresses and the largest transfer cover the latest window. Each indexed ERC-20 Transfer event counts once, including mint, burn and zero-value events. Unique counts include the zero address.</p>
          <p><strong>Lightning</strong> means at least 20 transfers and a rise of 65% or more; a previously empty window also qualifies. Otherwise, <strong>stormy</strong> means at least 100 transfers. <strong>Breezy</strong> means at least 10 and a rise of 18% or more. Everything else is <strong>calm</strong>.</p>
          <p>Change is (current − previous) ÷ previous. “New activity” means the previous count was zero. The explorer is scanned for both windows, up to 40 pages or 45 seconds. Incomplete scans return an error, never a partial count. These are activity descriptions, not price predictions.</p>
          <p>Largest transfer, full precision: <strong className="exact-value">{activity.largestExact}</strong></p>
        </div></details>
        <section className="activity-section" aria-labelledby="transfers-title">
          <div className="section-heading"><div><p className="section-kicker">Up to 5 latest transfers</p><h3 id="transfers-title">Recent movement</h3></div><span className="live-tag"><span /> {activity.isDemo ? 'Illustrative sample' : 'On-chain snapshot'}</span></div>
          {activity.transfers.length ? <><p className="scroll-hint" id="table-hint">Scroll the table horizontally to see all transfer details.</p><div className="transfer-table" tabIndex={0} role="region" aria-label="Recent transfers, scroll for more columns" aria-describedby="table-hint">
            <table><caption className="sr-only">Latest transfers in the reported one-minute window. Amounts are rounded; select an amount for full precision.</caption><thead><tr><th scope="col">Transaction</th><th scope="col">From → to</th><th scope="col">Amount</th><th scope="col">Time (UTC)</th></tr></thead><tbody>
              {activity.transfers.map(transfer => <tr key={transfer.id}>
                <td><span className="hash-cell"><span className="hash-dot" />{activity.isDemo ? shorten(transfer.hash, 5) : <a href={`https://etherscan.io/tx/${transfer.hash}`} target="_blank" rel="noreferrer" aria-label={`Transaction ${transfer.hash} on Etherscan (new tab)`}>{shorten(transfer.hash, 5)}</a>}</span></td>
                <td><span className="route-cell">{activity.isDemo ? <>{shorten(transfer.from, 4)} → {shorten(transfer.to, 4)}</> : <><a href={`https://etherscan.io/address/${transfer.from}`} target="_blank" rel="noreferrer" aria-label={`Sender ${transfer.from} on Etherscan (new tab)`}>{shorten(transfer.from, 4)}</a><Icon name="arrow" size={13} /><a href={`https://etherscan.io/address/${transfer.to}`} target="_blank" rel="noreferrer" aria-label={`Receiver ${transfer.to} on Etherscan (new tab)`}>{shorten(transfer.to, 4)}</a></>}</span></td>
                <td><details className="amount-detail"><summary>{transfer.value}</summary><span className="exact-value">{transfer.exactValue}</span></details></td>
                <td><time dateTime={transfer.timestamp}>{clockTime(transfer.timestamp)}</time></td>
              </tr>)}
            </tbody></table>
          </div></> : <p className="empty-row">No transfers in this one-minute window. Refresh the forecast to check again, or try another token.</p>}
        </section>
        <footer className="dashboard-footer"><span><span className="footer-lock" aria-hidden="true">◈</span> Read-only. No keys, signatures or wallet connection.</span><span>Data via Blockscout · <a href="https://docs.blockscout.com/devs/apis/rest" target="_blank" rel="noreferrer">About the data <Icon name="external" size={12} /></a></span></footer>
      </section>
    </main>
    <div className={`toast ${notice ? 'show' : ''}`} role="status">{notice}</div>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
