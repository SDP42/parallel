import { Fragment } from 'react'

/**
 * Text whose letters spread apart and lean while you scroll fast. Driven purely by the
 * shared `--vel` / `--avel` CSS variables (see useSmoothScroll), so it costs no re-renders.
 * `anchor="start"` spreads to the right only (for left-aligned, masked headlines);
 * `anchor="center"` spreads out from the middle.
 */
export default function VelText({ text, anchor = 'center' }: { text: string; anchor?: 'center' | 'start' }) {
  const words = text.split(' ')
  const n = text.replace(/ /g, '').length
  const mid = anchor === 'center' ? (n - 1) / 2 : 0
  let ci = 0
  return (
    <span className="vel-text">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, wi) => (
          <Fragment key={wi}>
            <span className="vel-word">
              {Array.from(w).map((ch, k) => {
                const o = ci++ - mid
                return <span key={k} className="vel-ch" style={{ ['--o' as string]: o.toFixed(1) }}>{ch}</span>
              })}
            </span>
            {wi < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </span>
  )
}
