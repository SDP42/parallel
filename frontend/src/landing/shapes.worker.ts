import { buildShapes } from './shapes'

/** Builds the particle clouds off the main thread (the head SDF sampling takes ~0.5–1 s). */
self.onmessage = (e: MessageEvent<{ count: number }>) => {
  const s = buildShapes(e.data.count)
  ;(self as unknown as Worker).postMessage(s, [s.P0.buffer, s.P1.buffer, s.P2.buffer, s.P4.buffer, s.P5.buffer, s.seed.buffer, s.colA.buffer, s.colB.buffer])
}
