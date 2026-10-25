/**
 * Point clouds the twin morphs between while you scroll. Everything is procedural,
 * so the landing page ships no 3D model files.
 *
 * Shapes: 0 head (your twin) · 1 brain · 2 attention fingerprint ring · 3 fork (computed
 * live in the shader) · 4 knowledge graph · 5 you and your twin, face to face.
 */

type V3 = [number, number, number]

// ---------------------------------------------------------------- seeded random
function rng(seed = 7) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const R = rng(20261025)
const gauss = () => { const u = Math.max(R(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()) }

// ---------------------------------------------------------------- head SDF
function sdEllipsoid(p: V3, c: V3, r: V3) {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2]
  const k0 = Math.hypot(x, y, z)
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2])
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1
}
function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
function sdHead(p: V3) {
  let d = sdEllipsoid(p, [0, 0.38, -0.08], [0.8, 0.92, 0.98]) // cranium
  d = smin(d, sdEllipsoid(p, [0, -0.12, 0.24], [0.62, 0.78, 0.72]), 0.3) // face
  d = smin(d, sdEllipsoid(p, [0, -0.58, 0.2], [0.48, 0.4, 0.58]), 0.28) // jaw
  d = smin(d, sdEllipsoid(p, [0, -0.62, 0.62], [0.2, 0.17, 0.16]), 0.12) // chin
  d = smin(d, sdEllipsoid(p, [0, -0.04, 0.9], [0.1, 0.24, 0.16]), 0.1) // nose bridge
  d = smin(d, sdEllipsoid(p, [0, -0.2, 0.98], [0.13, 0.1, 0.12]), 0.08) // nose tip
  d = smin(d, sdEllipsoid(p, [0, -0.43, 0.84], [0.22, 0.06, 0.08]), 0.06) // lips
  d = smin(d, sdEllipsoid(p, [0.8, -0.04, -0.04], [0.07, 0.2, 0.13]), 0.07) // ears
  d = smin(d, sdEllipsoid(p, [-0.8, -0.04, -0.04], [0.07, 0.2, 0.13]), 0.07)
  d = smin(d, sdEllipsoid(p, [0, -1.25, -0.12], [0.36, 0.7, 0.38]), 0.25) // neck
  // eye sockets
  d = Math.max(d, -sdEllipsoid(p, [0.27, 0.1, 0.86], [0.15, 0.09, 0.12]))
  d = Math.max(d, -sdEllipsoid(p, [-0.27, 0.1, 0.86], [0.15, 0.09, 0.12]))
  // cut the neck flat at the bottom
  return Math.max(d, -(p[1] + 1.75))
}

function projectToSurface(sdf: (p: V3) => number, p: V3): V3 {
  const e = 0.002
  for (let i = 0; i < 6; i++) {
    const d = sdf(p)
    const g: V3 = [
      sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]),
      sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]),
      sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]),
    ]
    const len = Math.hypot(...g) || 1
    p = [p[0] - (d * g[0]) / len, p[1] - (d * g[1]) / len, p[2] - (d * g[2]) / len]
  }
  return p
}

function headPoint(): V3 {
  for (;;) {
    const p: V3 = [(R() - 0.5) * 2, (R() - 0.5) * 3.6 - 0.15, (R() - 0.5) * 2.2]
    const d = sdHead(p)
    if (Math.abs(d) > 0.35) continue
    const q = projectToSurface(sdHead, p)
    if (Math.abs(sdHead(q)) < 0.01 && q[1] > -1.74) return q
  }
}

// ---------------------------------------------------------------- brain
function brainPoint(scale = 1, interior = false): V3 {
  const side = R() < 0.5 ? -1 : 1
  const cereb = R() < 0.12
  const u = R() * 2 * Math.PI, v = Math.acos(2 * R() - 1)
  let dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u)
  if (cereb) {
    const r = interior ? R() : 1
    return [dx * 0.42 * r * scale, (-0.42 + dy * 0.22 * r) * scale, (-0.62 + dz * 0.3 * r) * scale]
  }
  if (side * dx < 0) dx *= 0.35 // flatten the medial wall
  const fold = 0.07 * Math.sin(dx * 13 + dy * 7) * Math.sin(dz * 11 - dy * 5) + 0.04 * Math.sin(dz * 23 + dx * 17)
  const r = (interior ? Math.cbrt(R()) * 0.9 : 1) + fold
  return [(side * 0.36 + dx * 0.5 * r) * scale, (dy * 0.58 * r + 0.06) * scale, dz * 0.86 * r * scale]
}

// ---------------------------------------------------------------- fingerprint ring (7 days × 24 hours)
function focusAt(day: number, hour: number) {
  const bump = (c: number, w: number, h: number) => Math.exp(-((h - c) ** 2) / (2 * w * w))
  const weekend = day >= 5 ? 0.7 : 1
  return Math.max(0.05, (0.15 + 0.95 * bump(10.5, 1.6, hour) + 0.65 * bump(22, 1.3, hour) - 0.25 * bump(14.2, 0.8, hour)) * weekend * (hour < 7 ? 0.25 : 1))
}

function ringPoint(): { p: V3; hi: boolean } {
  const day = Math.floor(R() * 7)
  const hour = R() * 24
  const v = focusAt(day, hour)
  const a = (hour / 24) * Math.PI * 2 - Math.PI / 2
  const rad = 1.25 + day * 0.24 + (R() - 0.5) * 0.08
  const h = R() * v * 1.5
  return { p: [Math.cos(a) * rad, h - 0.55, Math.sin(a) * rad], hi: v > 0.75 }
}

// ---------------------------------------------------------------- knowledge graph
const GRAPH_NODES: { p: V3; w: number; c: number }[] = []
const GRAPH_EDGES: [number, number][] = []
{
  const golden = Math.PI * (3 - Math.sqrt(5))
  const n = 22
  GRAPH_NODES.push({ p: [0, 0, 0], w: 0.38, c: 0 })
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = golden * i
    const rad = 2.1 + (i % 3) * 0.35
    GRAPH_NODES.push({ p: [Math.cos(t) * r * rad, y * rad * 0.8, Math.sin(t) * r * rad], w: 0.1 + (i % 4) * 0.05, c: i % 4 === 0 ? 2 : i % 4 === 1 ? 1 : i % 4 === 2 ? 4 : 0 })
  }
  for (let i = 1; i <= n; i++) {
    GRAPH_EDGES.push([0, i])
    GRAPH_EDGES.push([i, ((i + 3) % n) + 1])
    if (i % 2) GRAPH_EDGES.push([i, ((i + 7) % n) + 1])
  }
}

function graphPoint(): { p: V3; c: number } {
  if (R() < 0.45) {
    const node = GRAPH_NODES[Math.floor(R() * GRAPH_NODES.length)]
    return { p: [node.p[0] + gauss() * node.w, node.p[1] + gauss() * node.w, node.p[2] + gauss() * node.w], c: node.c }
  }
  const [a, b] = GRAPH_EDGES[Math.floor(R() * GRAPH_EDGES.length)]
  const t = R()
  const A = GRAPH_NODES[a].p, B = GRAPH_NODES[b].p
  return { p: [A[0] + (B[0] - A[0]) * t + gauss() * 0.02, A[1] + (B[1] - A[1]) * t + gauss() * 0.02, A[2] + (B[2] - A[2]) * t + gauss() * 0.02], c: R() < 0.5 ? 5 : 3 }
}

function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

// ---------------------------------------------------------------- build all
export const PALETTE = ['#eff0f1', '#3ee6b5', '#ff4a1f', '#4a4d53', '#f5a524', '#1aa37e']

export function buildShapes(count: number, onProgress?: (p: number) => void) {
  const P0 = new Float32Array(count * 3), P1 = new Float32Array(count * 3), P2 = new Float32Array(count * 3)
  const P4 = new Float32Array(count * 3), P5 = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  const colA = new Float32Array(count * 4), colB = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    if (onProgress && (i & 1023) === 0) onProgress(i / count)
    const r = R()
    // 0 · head shell with a glowing brain inside
    const inner = r < 0.22
    const h = inner ? brainPoint(0.78) : headPoint()
    if (inner) { h[1] += 0.42; h[2] -= 0.05 }
    P0.set(h, i * 3)
    // 1 · brain, big, with an interior haze
    P1.set(brainPoint(2.1, R() < 0.15), i * 3)
    // 2 · fingerprint ring
    const ring = ringPoint()
    P2.set(ring.p, i * 3)
    // 4 · knowledge graph
    const g = graphPoint()
    P4.set(g.p, i * 3)
    // 5 · you (left) and your twin (right), facing each other
    const twin = i % 2 === 1
    const hp = rotY(headPoint(), twin ? -0.85 : 0.85)
    P5.set([hp[0] * 0.9 + (twin ? 1.85 : -1.85), hp[1] * 0.9 + 0.75, hp[2] * 0.9], i * 3)
    // seed: u along fork path, lane, branch (1 = chaos), random
    seed.set([R(), gauss() * 0.9, R() < 0.5 ? 1 : 0, R()], i * 4)
    const branchChaos = seed[i * 4 + 2] > 0.5
    // colour indices into PALETTE for each shape
    colA.set([inner ? 1 : R() < 0.06 ? 2 : 0, R() < 0.1 ? 2 : 1, ring.hi ? 1 : 5, branchChaos ? 2 : 1], i * 4)
    colB.set([g.c, twin ? 1 : 0], i * 2)
  }
  return { P0, P1, P2, P4, P5, seed, colA, colB }
}

// ---------------------------------------------------------------- compact head (TwinMini)
/** Head shell + brain core only, for small canvases. aux.x = 1 for brain core points. */
export function buildHead(count: number) {
  const pos = new Float32Array(count * 3)
  const aux = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const inner = R() < 0.2
    const h = inner ? brainPoint(0.78) : headPoint()
    if (inner) { h[1] += 0.42; h[2] -= 0.05 }
    pos.set(h, i * 3)
    aux.set([inner ? 1 : 0, R()], i * 2)
  }
  return { pos, aux }
}

// ---------------------------------------------------------------- data streams
/**
 * Quadratic bezier streams. `mode: 'temples'` pulls attention from the room into the
 * head's temples (shape 0); `mode: 'bridge'` arcs between you and your twin (shape 5).
 */
export function buildStreams(streams: number, perStream: number, mode: 'temples' | 'bridge') {
  const n = streams * perStream
  const A = new Float32Array(n * 3), B = new Float32Array(n * 3), C = new Float32Array(n * 3)
  const seed = new Float32Array(n * 2)
  for (let s = 0; s < streams; s++) {
    let a: V3, b: V3, c: V3
    if (mode === 'temples') {
      const side = s % 2 ? 1 : -1
      const ang = (s / streams) * Math.PI * 2 + R() * 0.4
      const rad = 4.2 + R() * 2.4
      a = [side * (2.4 + Math.abs(Math.cos(ang)) * rad * 0.7), Math.sin(ang) * 2.6 + 0.4, -1.5 - R() * 3 + Math.cos(ang) * 1.5]
      c = [side * 0.74, 0.22 + (R() - 0.5) * 0.12, 0.32 + (R() - 0.5) * 0.1]
      b = [side * (1.4 + R() * 1.2), a[1] * 0.3 + (R() - 0.5) * 1.6, 1.6 + R() * 1.4]
    } else {
      const up = s % 2 ? 1 : -1
      a = [-1.15, 0.95 + (R() - 0.5) * 0.4, 0.2]
      c = [1.15, 0.95 + (R() - 0.5) * 0.4, 0.2]
      b = [0, 0.95 + up * (0.5 + R() * 1.3), (R() - 0.5) * 2]
    }
    for (let k = 0; k < perStream; k++) {
      const i = s * perStream + k
      A.set(a, i * 3); B.set(b, i * 3); C.set(c, i * 3)
      seed.set([R(), R()], i * 2)
    }
  }
  return { A, B, C, seed }
}
