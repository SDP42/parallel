import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor, RoundedBox, Text } from '@react-three/drei'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction, type BloomEffect, type ChromaticAberrationEffect, type VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { buildShapes, buildStreams, PALETTE } from './shapes'
import { INTRO_CUT, seg, smooth, story } from './scroll'

type Shapes = ReturnType<typeof buildShapes>

/** 0..1 how strongly the opening dolly applies (lens flare, radial streaks, focus pull). */
function introDive(i: number) {
  if (i >= 1) return 0
  return i < INTRO_CUT ? smooth(seg(i, 0.1, INTRO_CUT)) : 1 - smooth(seg(i, INTRO_CUT, INTRO_CUT + 0.28))
}
/** 0 while the opening still shows the brain, 1 once the head has been revealed. */
function introGate(i: number) { return i >= 1 ? 1 : smooth(seg(i, INTRO_CUT + 0.04, INTRO_CUT + 0.3)) }

/* ================================================================ particle twin */
const vertex = /* glsl */ `
uniform float uMorph;
uniform float uTime;
uniform float uSize;
uniform float uPR;
uniform float uSpin;
uniform float uFocus;
uniform float uVel;
uniform float uPush;
uniform float uAspect;
uniform float uMaxSize;
uniform float uIn;
uniform float uDive;   // the opening dolly through the brain
uniform float uFlash;  // whiteout spike as the camera passes through
uniform float uNeuro;  // neuron firing + heartbeat strength
uniform float uGlow;   // hover glow around the pointer
uniform vec2 uPointer;
uniform vec3 uPalette[6];
uniform vec4 uSparks[6]; // action potentials: xyz origin (brain space), w start time
uniform vec4 uRipple[2]; // ping impacts: xyz origin (twin space), w start time
attribute vec3 aP0;
attribute vec3 aP1;
attribute vec3 aP2;
attribute vec3 aP4;
attribute vec3 aP5;
attribute vec4 aSeed;
attribute vec4 aColA;
attribute vec2 aColB;
varying vec3 vColor;
varying float vAlpha;
varying float vStretch;
varying vec2 vDir;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

// The fork is computed live so attention visibly flows into both futures.
vec3 forkPos(vec4 s, float t) {
  float u = fract(s.x + t * 0.045 * (0.6 + s.w));
  float x = -6.5 + u * 13.0;
  float lane = s.y;
  float y = lane * 0.12;
  float z = sin(lane * 9.0 + t) * 0.12;
  if (x > 0.0) {
    float k = x / 6.5;
    if (s.z > 0.5) {
      y += k * 2.6 + sin(t * 2.6 + s.w * 40.0 + x * 1.7) * k * 0.55;
      z += cos(t * 2.1 + s.w * 70.0) * k * 0.8;
      y += sin(s.w * 91.0 + t) * k * k * 0.7;
    } else {
      y -= k * 2.3 + sin(x * 1.3 - t * 2.0) * 0.08;
      z += lane * k * 0.25;
    }
  }
  return vec3(x, y, z);
}

// cheap divergence-ish flow field: two octaves of crossed sines
vec3 flow(vec3 p, float t) {
  vec3 a = vec3(sin(p.y * 1.7 + t * 0.6) + cos(p.z * 1.3 - t * 0.4) * 0.6,
                sin(p.z * 1.5 + t * 0.5) + cos(p.x * 1.9 + t * 0.3) * 0.6,
                sin(p.x * 1.6 - t * 0.7) + cos(p.y * 1.2 + t * 0.45) * 0.6);
  vec3 q = p * 2.3 + a;
  return a + 0.45 * vec3(sin(q.z + t), sin(q.x - t * 0.8), sin(q.y + t * 0.6));
}

float wt(float m, float i) { float w = clamp(1.0 - abs(m - i), 0.0, 1.0); return w * w * (3.0 - 2.0 * w); }

void main() {
  float m = clamp(uMorph + (aSeed.w - 0.5) * 0.28, 0.0, 5.0);
  float w0 = wt(m, 0.0), w1 = wt(m, 1.0), w2 = wt(m, 2.0), w3 = wt(m, 3.0), w4 = wt(m, 4.0), w5 = wt(m, 5.0);
  float sum = max(w0 + w1 + w2 + w3 + w4 + w5, 1e-4);
  vec3 fp = forkPos(aSeed, uTime);
  vec3 p = aP0 * w0
         + rotY(aP1, uSpin) * w1
         + rotY(aP2, uSpin * 0.6) * w2
         + fp * w3
         + rotY(aP4, uSpin * 0.8) * w4
         + aP5 * w5;
  p /= sum;

  // ---- the brain is alive: a lub-dub heartbeat, travelling action potentials, random firing
  float bw = w1 / sum * uNeuro;
  float hb = mod(uTime, 1.55);
  float beat = (exp(-pow((hb - 0.18) * 12.0, 2.0)) + 0.55 * exp(-pow((hb - 0.44) * 12.0, 2.0))) * bw;
  float sparkM = 0.0, sparkO = 0.0;
  if (bw > 0.01) {
    for (int k = 0; k < 6; k++) {
      vec4 s = uSparks[k];
      float st = uTime - s.w;
      if (st < 0.0 || st > 1.5) continue;
      float sd = distance(aP1, s.xyz);
      float wave = exp(-pow((sd - st * 2.1) * 5.5, 2.0)) * (1.0 - st / 1.5) + exp(-sd * 8.0) * exp(-st * 6.0) * 2.0;
      if (k == 1 || k == 4) sparkO += wave; else sparkM += wave;
    }
    float tw = pow(max(0.0, sin(uTime * (0.7 + aSeed.w * 2.4) + aSeed.y * 37.0)), 90.0) * step(0.6, fract(aSeed.w * 13.7));
    sparkM = (sparkM + tw * 1.5) * bw;
    sparkO *= bw;
  }
  p *= 1.0 + beat * 0.022;

  // dissolve: flow-field drift + a vortex while between shapes
  float settled = max(max(max(w0, w1), max(w2, w3)), max(w4, w5)) / sum;
  float mid = 1.0 - settled;
  float trans = sin(3.14159 * fract(uMorph));
  float amp = mid * 1.25 + trans * 0.3;
  p += flow(p * 0.9 + aSeed.w * 3.0, uTime) * amp * (0.45 + aSeed.w);
  p = rotY(p, amp * (aSeed.w - 0.5) * 2.4);
  p += vec3(sin(uTime * 1.3 + aSeed.w * 50.0), cos(uTime * 1.1 + aSeed.w * 31.0), sin(uTime * 0.9 + aSeed.w * 17.0)) * 0.012;
  // scroll velocity leaves a trail (not while diving: then you move through the cloud instead)
  p.y -= uVel * (aSeed.w - 0.3) * 0.9 * (1.0 - uDive);

  // a ping hitting the twin: a shock ring runs out from the impact
  float rip = 0.0;
  for (int k = 0; k < 2; k++) {
    float rt = uTime - uRipple[k].w;
    if (rt < 0.0 || rt > 1.8) continue;
    vec3 dv = p - uRipple[k].xyz;
    float rd = length(dv);
    float wave = exp(-pow((rd - rt * 2.3) * 4.5, 2.0)) * (1.0 - rt / 1.8);
    p += dv / max(rd, 1e-3) * wave * 0.18;
    rip += wave;
  }

  vec3 c = uPalette[int(aColA.x)] * w0 + uPalette[int(aColA.y)] * w1 + uPalette[int(aColA.z)] * w2
         + mix(uPalette[0] * 0.75, uPalette[int(aColA.w)], smoothstep(-0.4, 1.4, fp.x)) * w3
         + uPalette[int(aColB.x)] * w4 + uPalette[int(aColB.y)] * w5;
  c /= sum;

  // ---- hologram: rim light, scan bands, a sweeping scan line, flicker (heads only)
  float holo = (w0 + w5) / sum;
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
  float band = 0.5 + 0.5 * sin(wp.y * 26.0 - uTime * 2.4);
  float sweepY = mod(uTime * 0.55, 4.2) - 2.1;
  float sweep = exp(-pow((wp.y - sweepY) * 5.0, 2.0));
  vec3 cen = mix(vec3(0.0, 0.05, 0.0), vec3(sign(aP5.x) * 1.85, 0.7, 0.0), w5 / max(w0 + w5, 1e-4));
  vec3 nrm = normalize(normalMatrix * normalize(p - cen + 1e-4));
  float rim = pow(1.0 - abs(nrm.z), 2.0);
  c = mix(c, uPalette[1], holo * (rim * 0.4 + sweep * 0.75));
  // fast scrolling heats the cloud up
  c = mix(c, uPalette[2], clamp(abs(uVel) * 1.4, 0.0, 0.85) * step(0.35, aSeed.w) * (1.0 - uDive * 0.85));
  c = mix(c, uPalette[1], clamp(sparkM, 0.0, 1.0));
  c = mix(c, uPalette[2], clamp(sparkO, 0.0, 1.0));
  c = mix(c, mix(uPalette[1], uPalette[0], 0.35), clamp(rip, 0.0, 1.0));
  c = mix(c, uPalette[0], uFlash * 0.6);

  float fadeIn = mix(1.0, smoothstep(-6.5, -3.0, p.x), w3 / sum);
  float a = (0.42 + aSeed.w * 0.5) * fadeIn * (0.85 + 0.15 * sin(uTime * 2.0 + aSeed.w * 80.0));
  float flick = step(0.94, fract(sin(floor(uTime * 14.0) * 91.7) * 437.5));
  a *= mix(1.0, ((0.45 + 0.85 * band) * (0.5 + 1.25 * rim) + sweep * 1.3) * (1.0 - flick * 0.3), holo * 0.85);
  a *= 1.0 + (sparkM + sparkO) * 2.4 + rip * 2.2 + beat * 0.4 + uFlash * 1.2;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // pointer pushes particles away (screen space, so it works at any depth)
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 pd = (ndc - uPointer) * vec2(uAspect, 1.0);
  float fall = exp(-dot(pd, pd) * 12.0) * uPush;
  mv.xy += normalize(pd + 1e-5) * fall * 0.09 * -mv.z;
  mv.z += fall * 0.25;
  // hover: particles around the pointer light up
  float glow = exp(-dot(pd, pd) * 9.0) * uGlow;
  c = mix(c, uPalette[1], glow * 0.75);
  a *= 1.0 + glow * 1.4;

  float depth = -mv.z;
  // depth cue: the near side is brighter, so the face reads as a face
  a *= clamp(1.25 - (depth - uFocus) * 0.42, 0.18, 1.25);
  // fake depth of field: out-of-focus particles grow and fade
  float blur = clamp(abs(depth - uFocus) * 0.26, 0.0, 2.2) * (1.0 - uDive * 0.7);
  a /= 1.0 + blur * 1.5;
  // the opening dolly: what passes close to the lens flares up and streaks radially
  float lens = smoothstep(3.0, 0.3, depth) * uDive;
  a *= smoothstep(mix(0.25, 0.06, uDive), mix(1.4, 0.45, uDive), depth);
  a *= 1.0 + lens * 2.2;
  vec2 sr = ndc * vec2(uAspect, 1.0);
  float sl = length(sr);
  vec2 radial = sr / max(sl, 1e-3);
  radial *= sign(radial.y + 1e-4);
  vec2 dir = normalize(mix(vec2(0.0, 1.0), radial, uDive * smoothstep(0.02, 0.2, sl)));
  vDir = vec2(dir.x, -dir.y);
  vStretch = min(abs(uVel) * 3.0, 2.4) * (1.0 - uDive) + lens * (1.6 + min(abs(uVel) * 5.0, 3.0));
  vColor = c;
  vAlpha = min(a, 2.2) * uIn;
  gl_Position = projectionMatrix * mv;
  float size = uSize * uPR * (0.55 + aSeed.w * 0.9) / depth * (1.0 + blur) * (1.0 + vStretch * 0.45) * (1.0 + (sparkM + sparkO) * 0.7 + rip * 0.5);
  // near the lens: thinner, longer streaks instead of giant discs
  gl_PointSize = min(size, uMaxSize * (1.0 - uDive * 0.35));
}
`

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vStretch;
varying vec2 vDir;
void main() {
  // an ellipse stretched along vDir (vertical while scrolling, radial while diving)
  vec2 pc = gl_PointCoord - 0.5;
  pc = vec2(dot(pc, vDir), dot(pc, vec2(-vDir.y, vDir.x)) * (1.0 + vStretch));
  float d = length(pc);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`

/* ================================================================ data streams */
const streamVertex = /* glsl */ `
uniform float uTime;
uniform float uVis;
uniform float uPR;
uniform float uSize;
uniform float uSpeed;
uniform vec3 uFrom;
uniform vec3 uTo;
attribute vec3 aA;
attribute vec3 aB;
attribute vec3 aC;
attribute vec2 aS;
varying vec3 vC;
varying float vA;
void main() {
  float u = fract(aS.x + uTime * uSpeed * (0.7 + aS.y * 0.6));
  vec3 p = mix(mix(aA, aB, u), mix(aB, aC, u), u);
  p += vec3(sin(u * 20.0 + aS.y * 30.0), cos(u * 17.0 + aS.y * 20.0), sin(u * 13.0 + aS.y * 9.0)) * 0.035 * (1.0 - u);
  vC = mix(uFrom, uTo, smoothstep(0.15, 0.95, u));
  vA = uVis * smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.9, u) * (0.45 + aS.y * 0.55);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize * uPR * (0.6 + aS.y * 0.8) / -mv.z, 40.0);
}
`
const streamFragment = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vC, smoothstep(0.5, 0.0, d) * vA);
}
`

function Streams({ streams, per, mode, vis }: { streams: number; per: number; mode: 'temples' | 'bridge'; vis: () => number }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const { gl } = useThree()
  const geo = useMemo(() => {
    const s = buildStreams(streams, per, mode)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(s.A.slice(), 3))
    g.setAttribute('aA', new THREE.BufferAttribute(s.A, 3))
    g.setAttribute('aB', new THREE.BufferAttribute(s.B, 3))
    g.setAttribute('aC', new THREE.BufferAttribute(s.C, 3))
    g.setAttribute('aS', new THREE.BufferAttribute(s.seed, 2))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)
    return g
  }, [streams, per, mode])
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uVis: { value: 0 }, uSize: { value: mode === 'temples' ? 13 : 11 }, uSpeed: { value: mode === 'temples' ? 0.16 : 0.22 },
    uPR: { value: Math.min(gl.getPixelRatio(), 1.75) },
    uFrom: { value: new THREE.Color(PALETTE[0]) }, uTo: { value: new THREE.Color(PALETTE[1]) },
  }), [gl, mode])
  useFrame(({ clock }) => {
    const u = mat.current.uniforms
    u.uTime.value = clock.getElapsedTime()
    u.uVis.value += (vis() - u.uVis.value) * 0.08
  })
  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial ref={mat} vertexShader={streamVertex} fragmentShader={streamFragment} uniforms={uniforms}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

/* ================================================================ hologram cage around the head */
function Cage({ mobile }: { mobile: boolean }) {
  const g = useRef<THREE.Group>(null!)
  const lines = useRef<THREE.LineBasicMaterial>(null!)
  const dots = useRef<THREE.PointsMaterial>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null!)
  const { edges, verts } = useMemo(() => {
    const ico = new THREE.IcosahedronGeometry(1.75, 1)
    const e = new THREE.EdgesGeometry(ico)
    return { edges: e, verts: ico }
  }, [])
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    const hero = Math.max(0, 1 - Math.abs(story.m) * 2.6) * THREE.MathUtils.smoothstep(t, 0.8, 3.0) * introGate(story.intro)
    g.current.rotation.y += dt * 0.08
    g.current.rotation.x = Math.sin(t * 0.2) * 0.12
    g.current.scale.setScalar(1 + (1 - hero) * 0.6)
    lines.current.opacity = hero * 0.16
    dots.current.opacity = hero * 0.7
    // scan ring follows the shader's sweep line
    const sy = ((t * 0.55) % 4.2) - 2.1
    const k = Math.max(0, 1 - ((sy - 0.15) / 1.55) ** 2)
    ring.current.position.y = sy - 0.1
    ring.current.scale.setScalar(Math.max(0.01, Math.sqrt(k)) * (sy < -0.9 ? 0.45 : 1))
    ringMat.current.opacity = hero * 0.5 * Math.min(1, k * 4)
  })
  return (
    <group>
      <group ref={g} position={[0, 0.1, 0]}>
        <lineSegments geometry={edges}>
          <lineBasicMaterial ref={lines} color={PALETTE[1]} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </lineSegments>
        <points geometry={verts}>
          <pointsMaterial ref={dots} color={PALETTE[0]} size={mobile ? 0.06 : 0.045} transparent opacity={0} depthWrite={false} sizeAttenuation blending={THREE.AdditiveBlending} />
        </points>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.0, 96]} />
        <meshBasicMaterial ref={ringMat} color={PALETTE[1]} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ================================================================ the twin itself */
/** Shared between the twin, the camera rig and the ping swarm (one scene, no React state). */
const world = { group: null as THREE.Group | null, mat: null as THREE.ShaderMaterial | null, ripple: 0 }

/** A ping reached the twin: a shock ring runs out from the impact and the counter ticks. */
function absorbAt(at: THREE.Vector3, t: number) {
  const { mat, group } = world
  if (mat && group) {
    const l = group.worldToLocal(at.clone())
    ;(mat.uniforms.uRipple.value as THREE.Vector4[])[world.ripple].set(l.x, l.y, l.z, t)
    world.ripple = (world.ripple + 1) % 2
  }
  story.absorbed++
  window.dispatchEvent(new CustomEvent('twin:absorb', { detail: story.absorbed }))
}

function Twin({ count, mobile }: { count: number; mobile: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const group = useRef<THREE.Group>(null!)
  const spin = useRef(0)
  const vel = useRef(0)
  const push = useRef(0)
  const ptr = useRef(new THREE.Vector2(0, 0))
  const fx = useRef({ slot: 0, next: 0, burst: story.burst, primed: false, side: story.intro < INTRO_CUT })
  const hv = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: new THREE.Vector3() }), [])
  const { gl, size, scene, camera } = useThree()
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => { world.group = group.current; return () => { world.group = null; world.mat = null } }, [])
  useEffect(() => {
    let alive = true
    story.load = Math.max(story.load, 0.08)
    const make = (s: Shapes) => {
      if (!alive) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(s.P0.slice(), 3))
      g.setAttribute('aP0', new THREE.BufferAttribute(s.P0, 3))
      g.setAttribute('aP1', new THREE.BufferAttribute(s.P1, 3))
      g.setAttribute('aP2', new THREE.BufferAttribute(s.P2, 3))
      g.setAttribute('aP4', new THREE.BufferAttribute(s.P4, 3))
      g.setAttribute('aP5', new THREE.BufferAttribute(s.P5, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(s.seed, 4))
      g.setAttribute('aColA', new THREE.BufferAttribute(s.colA, 4))
      g.setAttribute('aColB', new THREE.BufferAttribute(s.colB, 2))
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)
      story.load = 1
      setGeo(g)
    }
    // build off the main thread so the page stays responsive while the twin assembles
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./shapes.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<Shapes | { progress: number }>) => {
        if ('progress' in e.data) { story.load = Math.max(story.load, 0.1 + e.data.progress * 0.85); return }
        make(e.data); worker?.terminate()
      }
      worker.onerror = () => { worker?.terminate(); make(buildShapes(count)) }
      worker.postMessage({ count })
    } catch { make(buildShapes(count)) }
    return () => { alive = false; worker?.terminate() }
  }, [count])
  useEffect(() => { if (geo) { try { gl.compile(scene, camera) } catch { /* ignore */ } } }, [geo, gl, scene, camera])
  const uniforms = useMemo(() => ({
    uMorph: { value: 0 }, uTime: { value: 0 }, uSize: { value: mobile ? 17 : 15 }, uSpin: { value: 0 }, uFocus: { value: 6.4 },
    uIn: { value: 0 }, uVel: { value: 0 }, uPush: { value: 0 }, uAspect: { value: 1 }, uPointer: { value: new THREE.Vector2(9, 9) },
    uDive: { value: 0 }, uFlash: { value: 0 }, uNeuro: { value: 1 }, uGlow: { value: 0 },
    uSparks: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, -99)) },
    uRipple: { value: Array.from({ length: 2 }, () => new THREE.Vector4(0, 0, 0, -99)) },
    uPR: { value: Math.min(gl.getPixelRatio(), 1.75) }, uMaxSize: { value: 64 * Math.min(gl.getPixelRatio(), 1.75) },
    uPalette: { value: PALETTE.map((c) => new THREE.Color(c)) },
  }), [gl, mobile])

  useFrame(({ clock, camera }, dt) => {
    const t = clock.getElapsedTime()
    const f = fx.current
    // the opening hard-cuts brain → head behind the flash: snap instead of easing through other shapes
    const side = story.intro < INTRO_CUT
    if (side !== f.side || (!f.primed && geo)) { story.m = story.morph; f.side = side; if (geo) f.primed = true }
    if (!Number.isFinite(story.m)) story.m = Number.isFinite(story.morph) ? story.morph : 0
    story.m += (story.morph - story.m) * Math.min(1, dt * 3.2)
    if (!mat.current) return
    world.mat = mat.current
    const u = mat.current.uniforms
    const reduced = story.reduced
    u.uFocus.value = cam.focus
    spin.current += dt * 0.14 * (reduced && story.intro < INTRO_CUT ? 0 : 1)
    vel.current += (story.velocity - vel.current) * Math.min(1, dt * 6)
    u.uMorph.value = story.m
    u.uIn.value = Math.min(1, u.uIn.value + dt * 1.1)
    u.uTime.value = t
    u.uSpin.value = spin.current
    u.uVel.value = vel.current
    u.uAspect.value = size.width / Math.max(1, size.height)
    const dive = reduced ? 0 : introDive(story.intro)
    u.uDive.value = dive
    u.uFlash.value = reduced ? 0 : story.flash
    u.uNeuro.value = reduced ? 0 : 1
    // neurons: a new action potential every few hundred ms, faster as you dive in; a click fires a volley
    if (!reduced && geo) {
      const src = geo.getAttribute('aP1').array as Float32Array
      const fire = (at: number) => {
        const j = Math.floor(Math.random() * (src.length / 3)) * 3
        ;(u.uSparks.value as THREE.Vector4[])[f.slot].set(src[j], src[j + 1], src[j + 2], at)
        f.slot = (f.slot + 1) % 6
      }
      if (Math.abs(story.m - 1) < 0.95 && t > f.next) { fire(t); f.next = t + (0.22 + Math.random() * 0.45) * (1 - dive * 0.6) }
      if (story.burst !== f.burst) { f.burst = story.burst; for (let k = 0; k < 3; k++) fire(t + k * 0.07) }
    }
    // pointer push: desktop only, damped return when the mouse rests
    if (!mobile) {
      ptr.current.lerp(new THREE.Vector2(story.pointer.x, story.pointer.y), Math.min(1, dt * 8))
      u.uPointer.value.copy(ptr.current)
      if (!reduced) {
        push.current += (story.pointerActive * 0.9 - push.current) * Math.min(1, dt * 4)
        u.uPush.value = push.current
      }
      const glow = story.pointerIn ? 0.3 + 0.7 * Math.max(story.heroVis, Math.max(0, 1 - Math.abs(story.m - 1))) : 0
      u.uGlow.value += (glow - u.uGlow.value) * Math.min(1, dt * 5)
    }
    // pointer parallax + a slow living sway; the head is turned in the hero
    const g = group.current
    const m = story.m
    g.rotation.y += (story.pointer.x * 0.2 + Math.sin(t * 0.35) * 0.12 - 0.4 * Math.max(0, 1 - Math.abs(m)) - g.rotation.y) * 0.05
    g.rotation.x += (-story.pointer.y * 0.1 - g.rotation.x) * 0.05
    // where the head is on screen, for the hover HUD
    if (story.heroVis > 0.01) {
      hv.a.set(0, 0.15, 0); g.localToWorld(hv.a); hv.b.copy(hv.a)
      hv.r.setFromMatrixColumn(camera.matrixWorld, 0)
      hv.b.addScaledVector(hv.r, 1.05)
      hv.a.project(camera); hv.b.project(camera)
      story.head.x = (hv.a.x + 1) * 0.5 * size.width
      story.head.y = (1 - hv.a.y) * 0.5 * size.height
      story.head.r = Math.hypot((hv.b.x - hv.a.x) * 0.5 * size.width, (hv.b.y - hv.a.y) * 0.5 * size.height)
    }
  })

  const heroVis = () => Math.max(0, 1 - Math.abs(story.m) * 2.4) * introGate(story.intro)
  const meetVis = () => Math.max(0, 1 - Math.abs(story.m - 5) * 2.5)
  return (
    <group ref={group}>
      {geo && <points geometry={geo} frustumCulled={false}>
        <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>}
      <Streams streams={mobile ? 8 : 12} per={mobile ? 40 : 70} mode="temples" vis={heroVis} />
      <Streams streams={mobile ? 10 : 16} per={mobile ? 30 : 50} mode="bridge" vis={meetVis} />
      <Cage mobile={mobile} />
    </group>
  )
}

function Dust({ mobile }: { mobile: boolean }) {
  const ref = useRef<THREE.Points>(null!)
  const n = mobile ? 900 : 1600
  const pos = useMemo(() => {
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 24, -4 - Math.random() * 18], i * 3)
    return a
  }, [n])
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.004; ref.current.position.y = -window.scrollY * 0.0012 })
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.05} color="#6b6d72" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  )
}

/* ================================================================ 3D notification */
function Ping() {
  const g = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const box = useRef<THREE.MeshStandardMaterial>(null!)
  const txt = useRef<any>(null)
  const sub = useRef<any>(null)
  const dot = useRef<THREE.MeshBasicMaterial>(null!)
  const target = useMemo(() => new THREE.Vector3(), [])
  const { size } = useThree()
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const m = story.m
    const vis = Math.max(story.heroVis, story.notif * (1 - story.panW))
    const fork = Math.min(1, Math.max(0, 1 - Math.abs(m - 3)))
    target.set(THREE.MathUtils.lerp(size.width < 768 ? 0.15 : -0.55, -0.1, fork), THREE.MathUtils.lerp(1.45, 0.35, fork), THREE.MathUtils.lerp(1.35, 0.6, fork))
    g.current.position.lerp(target, 0.08)
    g.current.position.y += Math.sin(t * 1.6) * 0.004
    g.current.rotation.y = Math.sin(t * 0.7) * 0.18 - 0.2
    const pulse = (t % 4) / 4
    g.current.visible = vis > 0.005
    g.current.scale.setScalar(THREE.MathUtils.lerp(0.001, 0.82, vis) * (1 + Math.max(0, 0.06 - pulse * 0.3)))
    box.current.opacity = vis * 0.92
    dot.current.opacity = vis
    if (txt.current) txt.current.fillOpacity = vis
    if (sub.current) sub.current.fillOpacity = vis * 0.8
    ring.current.scale.setScalar(1 + pulse * 2.4)
    ;(ring.current.material as THREE.MeshBasicMaterial).opacity = vis * (1 - pulse) * 0.6
  })
  return (
    <group ref={g} position={[0.75, 1.3, 1.35]}>
      <RoundedBox args={[2.25, 0.6, 0.08]} radius={0.07} smoothness={4}>
        <meshStandardMaterial ref={box} color="#222427" roughness={0.4} metalness={0.3} transparent />
      </RoundedBox>
      <mesh position={[-0.84, 0, 0.05]}>
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial ref={dot} color="#ff4a1f" toneMapped={false} transparent />
      </mesh>
      <mesh ref={ring} position={[-0.84, 0, 0.04]}>
        <ringGeometry args={[0.17, 0.2, 48]} />
        <meshBasicMaterial color="#ff4a1f" transparent toneMapped={false} />
      </mesh>
      <Text ref={txt} position={[0.12, 0.08, 0.05]} fontSize={0.125} color="#eff0f1" anchorX="center" anchorY="middle">Someone liked your post</Text>
      <Text ref={sub} position={[-0.22, -0.13, 0.05]} fontSize={0.085} color="#a3a5aa" anchorX="center" anchorY="middle">Instagram · now</Text>
    </group>
  )
}

/* ================================================================ cinematic camera */
type Key = { m: number; p: [number, number, number]; l: [number, number, number] }
// Between the hero (0) and the brain (1) the camera swings round the head and dives
// through it, so the brain blooms around you before you pull back out.
const KEYS_DESKTOP: Key[] = [
  { m: 0, p: [-2.0, 0.15, 6.4], l: [-2.0, -0.05, 0] },
  { m: 0.35, p: [1.1, 0.75, 4.4], l: [-0.6, 0.25, 0] },
  { m: 0.62, p: [0.3, 0.5, 1.45], l: [0, 0.45, 0] },
  { m: 1, p: [-1.7, 0.4, 7.0], l: [-1.7, 0, 0] },
  { m: 2, p: [-2.3, 4.6, 8.4], l: [-2.3, -0.5, 0] },
  { m: 3, p: [-1.4, 0.3, 8.6], l: [-1.4, 0.3, 0] },
  { m: 4, p: [-1.6, 0.5, 8.4], l: [-1.6, 0, 0] },
  { m: 5, p: [0, 0.25, 7.4], l: [0, 0.35, 0] },
]
const KEYS_MOBILE: Key[] = [
  { m: 0, p: [0, -0.6, 8.6], l: [0, -0.6, 0] },
  { m: 0.35, p: [2.3, 0.2, 6.0], l: [0, -0.1, 0] },
  { m: 0.62, p: [0.3, 0.45, 1.5], l: [0, 0.4, 0] },
  { m: 1, p: [0, -0.4, 9.4], l: [0, -0.4, 0] },
  { m: 2, p: [0, 3.4, 9.4], l: [0, -2.3, 0] },
  { m: 3, p: [0.6, 0.3, 12.5], l: [0.6, 0.3, 0] },
  { m: 4, p: [0, 0.2, 10.5], l: [0, 0.2, 0] },
  { m: 5, p: [0, -1.1, 13.5], l: [0, -1.1, 0] },
]
// Fork pan: orange (chaos) branch above, mint (calm) branch below.
const PAN = {
  desktop: { a: { p: [4.2, 1.9, 5.6], l: [4.2, 1.7, 0] }, b: { p: [4.2, -1.6, 5.6], l: [4.2, -1.5, 0] } },
  mobile: { a: { p: [3.8, 0.6, 7.8], l: [3.8, 0.5, 0] }, b: { p: [3.8, -2.6, 7.8], l: [3.8, -2.7, 0] } },
}

const cam = { look: new THREE.Vector3(0, -0.42, 0), focus: 8.6 }

type V3 = [number, number, number]
/**
 * The opening shot. a → b: dolly from a wide view of the brain straight through its middle.
 * The flash hides a cut; c → hero: pull back out of the brain inside the twin's head, through
 * its face, until the hero framing.
 */
const INTRO_CAM: Record<'desktop' | 'mobile', { a: V3; al: V3; b: V3; bl: V3; c: V3; cl: V3 }> = {
  desktop: { a: [1.2, 2.4, 7.9], al: [0, -0.8, 0], b: [0, 0.14, -1.1], bl: [0, -0.2, -7], c: [0, 0.48, 0.02], cl: [-0.15, 0.4, -4] },
  mobile: { a: [1.2, 2.2, 10.4], al: [0, -0.95, 0], b: [0, 0.14, -1.1], bl: [0, -0.2, -7], c: [0, 0.48, 0.02], cl: [0, 0.4, -4] },
}
const BRAIN_C = new THREE.Vector3(0, 0.14, 0)
const HEAD_C = new THREE.Vector3(0, 0.3, 0)

function makePath(keys: Key[]) {
  return {
    keys,
    pos: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.p)), false, 'centripetal'),
    look: new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.l)), false, 'centripetal'),
  }
}

function Rig({ mobile }: { mobile: boolean }) {
  const { camera } = useThree()
  const path = useMemo(() => makePath(mobile ? KEYS_MOBILE : KEYS_DESKTOP), [mobile])
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3(), pa: new THREE.Vector3(), la: new THREE.Vector3(), pb: new THREE.Vector3(), lb: new THREE.Vector3() }), [])
  const roll = useRef(0)
  useFrame(({ clock }, dt) => {
    const m = Number.isFinite(story.m) ? Math.min(5, Math.max(0, story.m)) : 0
    const ks = path.keys
    let ki = 0
    while (ki < ks.length - 2 && m > ks[ki + 1].m) ki++
    const local = (m - ks[ki].m) / (ks[ki + 1].m - ks[ki].m)
    const t = Math.min(1, Math.max(0, (ki + local) / (ks.length - 1)))
    path.pos.getPoint(t, tmp.p)
    path.look.getPoint(t, tmp.l)
    // the fork pan between the two futures
    if (story.panW > 0.001) {
      const P = mobile ? PAN.mobile : PAN.desktop
      const f = (story.pan + 1) / 2
      tmp.pa.set(P.a.p[0], P.a.p[1], P.a.p[2]).lerp(tmp.pb.set(P.b.p[0], P.b.p[1], P.b.p[2]), f)
      tmp.la.set(P.a.l[0], P.a.l[1], P.a.l[2]).lerp(tmp.lb.set(P.b.l[0], P.b.l[1], P.b.l[2]), f)
      tmp.p.lerp(tmp.pa, story.panW)
      tmp.l.lerp(tmp.la, story.panW)
    }
    // finale: a slow 30° orbit around you and your twin
    const meet = Math.max(0, 1 - Math.abs(m - 5))
    if (meet > 0) {
      const ang = Math.sin(clock.getElapsedTime() * 0.12) * 0.26 * meet
      const dx = tmp.p.x - tmp.l.x, dz = tmp.p.z - tmp.l.z
      tmp.p.x = tmp.l.x + dx * Math.cos(ang) + dz * Math.sin(ang)
      tmp.p.z = tmp.l.z - dx * Math.sin(ang) + dz * Math.cos(ang)
    }
    tmp.p.x += story.pointer.x * 0.25
    tmp.p.y += story.pointer.y * 0.15
    // ---- the opening shot overrides the path until the hero is reached
    const i = story.intro
    const T = clock.getElapsedTime()
    let rollTo = 0, fov = 45, center: THREE.Vector3 | null = null
    if (i < 1) {
      const C = mobile ? INTRO_CAM.mobile : INTRO_CAM.desktop
      if (story.reduced) {
        // reduced motion: a still brain, then (behind a dark crossfade) the hero
        if (i < INTRO_CUT) { tmp.p.set(...C.a); tmp.l.set(...C.al) }
      } else if (i < INTRO_CUT) {
        const d = seg(i, 0.04, INTRO_CUT)
        const f = 0.18 * d + 0.82 * d * d // accelerating dolly
        const idle = 1 - smooth(Math.min(1, d * 3)) // a slow breath while you have not scrolled yet
        tmp.p.set(...C.a).lerp(tmp.pa.set(...C.b), f)
        tmp.l.set(...C.al).lerp(tmp.la.set(...C.bl), smooth(Math.min(1, d * 1.1)))
        tmp.p.x += Math.sin(f * Math.PI) * 0.6 + (Math.sin(T * 0.21) * 0.35 + story.pointer.x * 0.35) * idle
        tmp.p.y += (Math.sin(T * 0.17) * 0.12 + story.pointer.y * 0.2) * idle
        tmp.p.z += Math.sin(T * 0.33) * 0.25 * idle
        rollTo = f * 0.32
        fov = 45 + f * f * 16
        center = BRAIN_C
      } else {
        const u = smooth(seg(i, INTRO_CUT, 0.95))
        tmp.p.copy(tmp.pa.set(...C.c).lerp(tmp.p, u))
        tmp.l.copy(tmp.la.set(...C.cl).lerp(tmp.l, u))
        rollTo = -0.22 * (1 - u)
        fov = 45 + (1 - u) * (1 - u) * 16
        center = HEAD_C
      }
    }
    const fast = i < 1
    const k = story.reduced && fast ? 1 : 1 - Math.exp(-dt * (fast ? 9 : 4))
    camera.position.lerp(tmp.p, k)
    cam.look.lerp(tmp.l, story.reduced && fast ? 1 : 1 - Math.exp(-dt * (fast ? 10 : 5)))
    camera.lookAt(cam.look)
    roll.current += (rollTo - roll.current) * k
    if (Math.abs(roll.current) > 1e-4) camera.rotateZ(roll.current)
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - fov) > 0.01) { pc.fov += (fov - pc.fov) * k; pc.updateProjectionMatrix() }
    // focus: on the look target, or (while diving) on what is right in front of the lens
    const lookD = camera.position.distanceTo(cam.look)
    const dive = story.reduced ? 0 : introDive(i)
    cam.focus = center && dive > 0 ? THREE.MathUtils.lerp(lookD, Math.max(0.9, camera.position.distanceTo(center)), dive) : lookD
  })
  return null
}

/* ================================================================ pings you throw at the twin */
const SWARM = 6
const FLIGHT = 0.85
function PingSwarm() {
  const { camera } = useThree()
  const refs = useRef<(THREE.Group | null)[]>([])
  const pool = useMemo(() => Array.from({ length: SWARM }, (_, n) => ({
    on: false, t0: 0, spin: 0, mint: n % 3 === 1,
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(),
  })), [])
  const v = useMemo(() => ({ dir: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Vector3(), up: new THREE.Vector3() }), [])
  const target = (out: THREE.Vector3) => {
    out.set(0, 0.45, 0.25)
    return world.group ? world.group.localToWorld(out) : out
  }
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    // launch queued clicks: each card starts on the click ray, a few units in front of the lens
    while (story.pings.length) {
      const q = story.pings.shift()!
      const s = pool.find((x) => !x.on) ?? pool.reduce((o, x) => (x.t0 < o.t0 ? x : o))
      v.dir.set(q.x, q.y, 0.5).unproject(camera).sub(camera.position).normalize()
      s.a.copy(camera.position).addScaledVector(v.dir, 3.2)
      target(s.c)
      v.up.setFromMatrixColumn(camera.matrixWorld, 1)
      s.b.copy(s.a).lerp(s.c, 0.45).addScaledVector(v.up, 0.9 + Math.random() * 0.5)
      s.b.x += (Math.random() - 0.5) * 1.4
      s.t0 = t; s.on = true; s.spin = (Math.random() - 0.5) * 7
    }
    pool.forEach((s, n) => {
      const g = refs.current[n]
      if (!g) return
      if (!s.on) { g.visible = false; return }
      const u = (t - s.t0) / FLIGHT
      target(s.c)
      if (u >= 1) { s.on = false; g.visible = false; absorbAt(s.c, t); return }
      const e = u * u * (1.6 - 0.6 * u) // accelerates into the head
      // quadratic bezier a → b → c
      v.p.copy(s.a).lerp(s.b, e)
      v.q.copy(s.b).lerp(s.c, e)
      g.position.copy(v.p.lerp(v.q, e))
      g.quaternion.copy(camera.quaternion)
      g.rotateZ(s.spin * e)
      g.rotateY(Math.sin(u * Math.PI) * 0.6)
      const pop = u < 0.12 ? 1.15 * Math.sin((u / 0.12) * Math.PI * 0.5) : 1 + 0.15 * Math.max(0, 1 - (u - 0.12) * 6)
      g.scale.setScalar(0.45 * pop * (1 - e * 0.78))
      g.visible = true
    })
  })
  return (
    <>
      {pool.map((s, n) => (
        <group key={n} ref={(el) => { refs.current[n] = el }} visible={false}>
          <RoundedBox args={[1.5, 0.42, 0.05]} radius={0.06} smoothness={3}>
            <meshBasicMaterial color="#222427" transparent opacity={0.94} toneMapped={false} />
          </RoundedBox>
          <mesh position={[-0.52, 0, 0.035]}>
            <circleGeometry args={[0.1, 24]} />
            <meshBasicMaterial color={s.mint ? PALETTE[1] : PALETTE[2]} toneMapped={false} />
          </mesh>
          <mesh position={[0.13, 0.065, 0.035]}>
            <planeGeometry args={[0.92, 0.07]} />
            <meshBasicMaterial color="#eff0f1" toneMapped={false} />
          </mesh>
          <mesh position={[-0.04, -0.08, 0.035]}>
            <planeGeometry args={[0.58, 0.05]} />
            <meshBasicMaterial color="#6b6d72" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/* ================================================================ post */
/** Bloom that spikes as the camera passes through the brain, plus a tunnel vignette while diving. */
function FlashBloom({ mobile }: { mobile: boolean }) {
  const b = useRef<BloomEffect>(null)
  const base = mobile ? 0.8 : 0.85
  useFrame(() => {
    if (!b.current) return
    const dive = story.reduced ? 0 : introDive(story.intro)
    b.current.intensity = base + (story.reduced ? 0 : story.flash * 3.2) + dive * 0.35
  })
  return <Bloom ref={b} intensity={base} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur resolutionScale={mobile ? 0.5 : 1} />
}
function DiveVignette() {
  const v = useRef<VignetteEffect>(null)
  useFrame(() => {
    if (!v.current) return
    const dive = story.reduced ? 0 : introDive(story.intro)
    v.current.darkness = 0.75 + dive * 0.2 * (1 - story.flash)
  })
  return <Vignette ref={v} eskil={false} offset={0.25} darkness={0.75} />
}

function VelocityCA() {
  const ca = useRef<ChromaticAberrationEffect>(null)
  const offset = useMemo(() => new THREE.Vector2(0.0004, 0.0002), [])
  useFrame(() => {
    if (!ca.current) return
    const v = Math.abs(story.velocity)
    ca.current.offset.set(0.0004 + v * 0.0032, 0.0002 + v * 0.0012)
  })
  return <ChromaticAberration ref={ca} offset={offset} radialModulation modulationOffset={0.2} />
}

/** Compile every program up front so the first morph does not stutter. */
function Precompile() {
  const { gl, scene, camera } = useThree()
  useEffect(() => { try { gl.compile(scene, camera) } catch { /* ignore */ } }, [gl, scene, camera])
  return null
}

export default function TwinWorld() {
  const mobile = typeof window !== 'undefined' && window.innerWidth < 768
  const lowEnd = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4
  const count = mobile ? 7000 : lowEnd ? 11000 : 17000
  const [dpr, setDpr] = useState(mobile ? 1.5 : 1.75)
  const [loop, setLoop] = useState<'always' | 'never'>('always')
  useEffect(() => {
    const on = () => setLoop(document.hidden ? 'never' : 'always')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return (
    <Canvas
      flat
      dpr={[1, dpr]}
      frameloop={loop}
      camera={{ position: mobile ? INTRO_CAM.mobile.a : INTRO_CAM.desktop.a, fov: 45, near: 0.05, far: 80 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      aria-label="Your attention digital twin: a living particle brain you dive through into a holographic head, which then becomes a focus fingerprint, a forking timeline and a knowledge graph as you scroll"
      role="img"
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <color attach="background" args={['#111214']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <Dust mobile={mobile} />
      <Twin count={count} mobile={mobile} />
      <Ping />
      <PingSwarm />
      <Rig mobile={mobile} />
      <Precompile />
      {mobile ? (
        <EffectComposer multisampling={0}>
          <FlashBloom mobile />
          <DiveVignette />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <FlashBloom mobile={false} />
          <VelocityCA />
          <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />
          <DiveVignette />
        </EffectComposer>
      )}
    </Canvas>
  )
}
