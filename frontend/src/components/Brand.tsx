import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGS } from '@/lib/i18n'
import { Languages } from 'lucide-react'

/** The motif: one path that forks into two futures. Orange = chaos, mint = focus. */
export function ForkMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M3 16 H13" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M13 16 C18 16 19 7 29 7" stroke="var(--color-chaos)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M13 16 C18 16 19 25 29 25" stroke="var(--color-calm)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="13" cy="16" r="3" fill="currentColor" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-lg" aria-label="Parallel home">
      <ForkMark /> Parallel
    </Link>
  )
}

export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation()
  return (
    <label className="relative flex items-center gap-1.5 text-muted small">
      <Languages size={16} aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className={`bg-transparent text-ink appearance-none cursor-pointer pr-1 ${compact ? 'w-10' : ''}`}
      >
        {LANGS.map((l) => <option key={l.code} value={l.code} className="bg-surface">{compact ? l.code.toUpperCase() : l.label}</option>)}
      </select>
    </label>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const loc = useLocation()
  const site = 'https://parallel-twin.app'
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, item: site + (it.to ?? loc.pathname) })),
  }
  return (
    <nav aria-label="Breadcrumb" className="small text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.to && i < items.length - 1 ? <Link to={it.to} className="hover:text-ink">{it.label}</Link> : <span aria-current="page" className="text-ink">{it.label}</span>}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </nav>
  )
}
