import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { PageHead } from './AppShell'
import { Panel } from '@/components/charts'
import { useApi } from '@/lib/hooks'
import { useSeo } from '@/lib/seo'

type Node = { id: string; label: string; group: string; weight: number; x?: number; y?: number }
type Link = { source: string | Node; target: string | Node; weight: number }

const GROUPS: Record<string, { color: string; label: string }> = {
  core: { color: '#eff0f1', label: 'You' },
  task: { color: '#3ee6b5', label: 'Task' },
  time: { color: '#8ab4f8', label: 'Time of day' },
  trigger: { color: '#ff4a1f', label: 'Notification type' },
  app: { color: '#f5a524', label: 'App opened' },
  outcome: { color: '#a3a5aa', label: 'Outcome' },
  state: { color: '#ff8a65', label: 'State' },
}

const idOf = (v: string | Node) => (typeof v === 'string' ? v : v.id)

export default function Brain() {
  useSeo('Twin brain', 'The knowledge graph your twin built: tasks, times, triggers, apps and outcomes.', '/app/brain', { noindex: true })
  const g = useApi<{ nodes: Node[]; links: Link[] }>('/twin/graph')
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [sel, setSel] = useState<Node | null>(null)
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => {
    if (!g.data) return { nodes: [], links: [] }
    const nodes = g.data.nodes.filter((n) => !hidden.includes(n.group)).map((n) => ({ ...n }))
    const ids = new Set(nodes.map((n) => n.id))
    const links = g.data.links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target))).map((l) => ({ ...l }))
    return { nodes, links }
  }, [g.data, hidden])

  const neighbours = useMemo(() => {
    if (!sel || !g.data) return []
    return g.data.links.filter((l) => idOf(l.source) === sel.id || idOf(l.target) === sel.id)
      .map((l) => { const other = idOf(l.source) === sel.id ? idOf(l.target) : idOf(l.source); return { node: g.data!.nodes.find((n) => n.id === other)!, weight: l.weight, dir: idOf(l.source) === sel.id ? 'leads to' : 'comes from' } })
      .filter((x) => x.node).sort((a, b) => b.weight - a.weight)
  }, [sel, g.data])

  const maxW = Math.max(...(g.data?.nodes.map((n) => n.weight) ?? [1]))
  const selIds = new Set([sel?.id, ...neighbours.map((n) => n.node.id)])

  return (
    <>
      <PageHead title="Twin brain" crumbs="Twin brain" sub="Everything your twin connected about you: which tasks attract which pings, which apps they lead to, and how it usually ends. Click a node for the evidence." />
      <div className="grid gap-3 xl:grid-cols-12">
        <section className="xl:col-span-8 panel p-3 overflow-hidden" aria-label="Knowledge graph">
          <div className="flex flex-wrap gap-2 p-2">
            {Object.entries(GROUPS).map(([k, v]) => (
              <button key={k} aria-pressed={!hidden.includes(k)} onClick={() => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))}
                className={`small px-2.5 py-1 flex items-center gap-1.5 ${hidden.includes(k) ? 'bg-bg text-muted line-through' : 'bg-surface-2'}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: v.color }} />{v.label}
              </button>
            ))}
          </div>
          <div ref={wrap} className="h-[560px]">
            {g.data && (
              <ForceGraph2D
                width={w} height={560} graphData={data} backgroundColor="rgba(0,0,0,0)"
                nodeRelSize={4} cooldownTicks={120}
                linkColor={(l: any) => (sel && (idOf(l.source) === sel.id || idOf(l.target) === sel.id) ? 'rgba(239,240,241,0.75)' : 'rgba(163,165,170,0.18)')}
                linkWidth={(l: any) => Math.max(0.5, Math.log2(l.weight + 1) * 0.7)}
                linkDirectionalParticles={(l: any) => (sel && (idOf(l.source) === sel.id || idOf(l.target) === sel.id) ? 2 : 0)}
                linkDirectionalParticleColor={() => '#ff4a1f'}
                onNodeClick={(n: any) => setSel(n)}
                onBackgroundClick={() => setSel(null)}
                nodeCanvasObject={(n: any, ctx, scale) => {
                  const r = 4 + Math.sqrt(n.weight / maxW) * 14
                  const dim = sel && !selIds.has(n.id)
                  ctx.globalAlpha = dim ? 0.25 : 1
                  ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
                  ctx.fillStyle = GROUPS[n.group]?.color ?? '#a3a5aa'; ctx.fill()
                  if (sel?.id === n.id) { ctx.lineWidth = 2 / scale; ctx.strokeStyle = '#eff0f1'; ctx.stroke() }
                  const fs = Math.max(11 / scale, 3.5)
                  ctx.font = `500 ${fs}px Switzer, sans-serif`; ctx.fillStyle = '#eff0f1'; ctx.textAlign = 'center'
                  ctx.fillText(n.label, n.x, n.y + r + fs + 1)
                  ctx.globalAlpha = 1
                }}
                nodePointerAreaPaint={(n: any, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, 4 + Math.sqrt(n.weight / maxW) * 14 + 4, 0, 2 * Math.PI); ctx.fill() }}
              />
            )}
          </div>
        </section>
        <Panel className="xl:col-span-4" title={sel ? sel.label : 'Pick a node'} sub={sel ? `${GROUPS[sel.group]?.label} · seen ${sel.weight} times in your history` : 'Each link is counted from your real events. Thicker means more often.'}>
          {!sel && (
            <ul className="small text-muted flex flex-col gap-2 list-disc pl-4">
              <li>Click “Social like” to see which tasks it interrupts and where it leads.</li>
              <li>Click “Rabbit hole” to see what feeds your longest escapes.</li>
              <li>Toggle groups above to declutter.</li>
            </ul>
          )}
          {sel && (
            <ul className="flex flex-col gap-1.5">
              {neighbours.map((n) => (
                <li key={n.node.id + n.dir}>
                  <button onClick={() => setSel(n.node)} className="w-full text-left bg-surface-2 hover:bg-bg px-3 py-2 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: GROUPS[n.node.group]?.color }} />
                    <span className="flex-1 small"><span className="text-muted">{n.dir}</span> {n.node.label}</span>
                    <span className="small tabular-nums">{n.weight}×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
