import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor, RoundedBox, Text } from '@react-three/drei'
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction, type ChromaticAberrationEffect } from 'postprocessing'
import * as THREE from 'three'
import { buildShapes, buildStreams, PALETTE } from './shapes'

type Shapes = ReturnType<typeof buildShapes>
import { story } from './scroll'

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
uniform vec2 uPointer;
uniform vec3 uPalette[6];
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

  // dissolve: flow-field drift + a vortex while between shapes
  float settled = max(max(max(w0, w1), max(w2, w3)), max(w4, w5)) / sum;
  float mid = 1.0 - settled;
  float trans = sin(3.14159 * fract(uMorph));
  float amp = mid * 1.25 + trans * 0.3;
  p += flow(p * 0.9 + aSeed.w * 3.0, uTime) * amp * (0.45 + aSeed.w);
  p = rotY(p, amp * (aSeed.w - 0.5) * 2.4);
  p += vec3(sin(uTime * 1.3 + aSeed.w * 50.0), cos(uTime * 1.1 + aSeed.w * 31.0), sin(uTime * 0.9 + aSeed.w * 17.0)) * 0.012;
  // scroll velocity leaves a trail
  p.y -= uVel * (aSeed.w - 0.3) * 0.9;

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
  c = mix(c, uPalette[2], clamp(abs(uVel) * 1.4, 0.0, 0.85) * step(0.35, aSeed.w));
  vColor = c;

  float fadeIn = mix(1.0, smoothstep(-6.5, -3.0, p.x), w3 / sum);
  float a = (0.42 + aSeed.w * 0.5) * fadeIn * (0.85 + 0.15 * sin(uTime * 2.0 + aSeed.w * 80.0));
  float flick = step(0.94, fract(sin(floor(uTime * 14.0) * 91.7) * 437.5));
  a *= mix(1.0, ((0.45 + 0.85 * band) * (0.5 + 1.25 * rim) + sweep * 1.3) * (1.0 - flick * 0.3), holo * 0.85);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // pointer pushes particles away (screen space, so it works at any depth)
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 dd = (ndc - uPointer) * vec2(uAspect, 1.0);
  float fall = exp(-dot(dd, dd) * 12.0) * uPush;
  mv.xy += normalize(dd + 1e-5) * fall * 0.09 * -mv.z;
  mv.z += fall * 0.25;

  float depth = -mv.z;
  // depth cue: the near side is brighter, so the face reads as a face
  a *= clamp(1.25 - (depth - uFocus) * 0.42, 0.18, 1.25);
  // fake depth of field: out-of-focus particles grow and fade
  float blur = clamp(abs(depth - uFocus) * 0.26, 0.0, 2.2);
  a /= 1.0 + blur * 1.5;
  a *= smoothstep(0.25, 1.4, depth);
  vStretch = min(abs(uVel) * 3.0, 2.4);
  vAlpha = a * uIn;
  gl_Position = projectionMatrix * mv;
  float size = uSize * uPR * (0.55 + aSeed.w * 0.9) / depth * (1.0 + blur) * (1.0 + vStretch * 0.45);
  gl_PointSize = min(size, uMaxSize);
}
`

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vStretch;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  pc.x *= 1.0 + vStretch;
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
    const hero = Math.max(0, 1 - Math.abs(story.m) * 2.6) * THREE.MathUtils.smoothstep(t, 0.8, 3.0)
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
function Twin({ count, mobile }: { count: number; mobile: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const group = useRef<THREE.Group>(null!)
  const spin = useRef(0)
  const vel = useRef(0)
  const push = useRef(0)
  const ptr = useRef(new THREE.Vector2(0, 0))
  const { gl, size, scene, camera } = useThree()
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let alive = true
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
      setGeo(g)
    }
    // build off the main thread so the page stays responsive while the twin assembles
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./shapes.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<Shapes>) => { make(e.data); worker?.terminate() }
      worker.onerror = () => { worker?.terminate(); make(buildShapes(count)) }
      worker.postMessage({ count })
    } catch { make(buildShapes(count)) }
    return () => { alive = false; worker?.terminate() }
  }, [count])
  useEffect(() => { if (geo) { try { gl.compile(scene, camera) } catch { /* ignore */ } } }, [geo, gl, scene, camera])
  const uniforms = useMemo(() => ({
    uMorph: { value: 0 }, uTime: { value: 0 }, uSize: { value: mobile ? 17 : 15 }, uSpin: { value: 0 }, uFocus: { value: 6.4 },
    uIn: { value: 0 }, uVel: { value: 0 }, uPush: { value: 0 }, uAspect: { value: 1 }, uPointer: { value: new THREE.Vector2(9, 9) },
    uPR: { value: Math.min(gl.getPixelRatio(), 1.75) }, uMaxSize: { value: 64 * Math.min(gl.getPixelRatio(), 1.75) },
    uPalette: { value: PALETTE.map((c) => new THREE.Color(c)) },
  }), [gl, mobile])

  useFrame(({ clock, camera }, dt) => {
    const t = clock.getElapsedTime()
    story.m += (story.morph - story.m) * Math.min(1, dt * 3.2)
    if (!mat.current) return
    const u = mat.current.uniforms
    u.uFocus.value = camera.position.distanceTo(cam.look)
    spin.current += dt * 0.14
    vel.current += (story.velocity - vel.current) * Math.min(1, dt * 6)
    u.uMorph.value = story.m
    u.uIn.value = Math.min(1, u.uIn.value + dt * 0.8)
    u.uTime.value = t
    u.uSpin.value = spin.current
    u.uVel.value = vel.current
    u.uAspect.value = size.width / Math.max(1, size.height)
    // pointer push: desktop only, damped return when the mouse rests
    if (!mobile && !story.reduced) {
      ptr.current.lerp(new THREE.Vector2(story.pointer.x, story.pointer.y), Math.min(1, dt * 8))
      push.current += (story.pointerActive * 0.9 - push.current) * Math.min(1, dt * 4)
      u.uPointer.value.copy(ptr.current)
      u.uPush.value = push.current
    }
    // pointer parallax + a slow living sway; the head is turned in the hero
    const g = group.current
    const m = story.m
    g.rotation.y += (story.pointer.x * 0.2 + Math.sin(t * 0.35) * 0.12 - 0.4 * Math.max(0, 1 - Math.abs(m)) - g.rotation.y) * 0.05
    g.rotation.x += (-story.pointer.y * 0.1 - g.rotation.x) * 0.05
  })

  const heroVis = () => Math.max(0, 1 - Math.abs(story.m) * 2.4)
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
    const hero = Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.55))
    const vis = Math.max(hero, story.notif * (1 - story.panW))
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

const cam = { look: new THREE.Vector3(-2, -0.05, 0) }

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
  useFrame(({ clock }, dt) => {
    const m = Math.min(5, Math.max(0, story.m))
    const ks = path.keys
    let i = 0
    while (i < ks.length - 2 && m > ks[i + 1].m) i++
    const local = (m - ks[i].m) / (ks[i + 1].m - ks[i].m)
    const t = Math.min(1, Math.max(0, (i + local) / (ks.length - 1)))
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
    const k = 1 - Math.exp(-dt * 4)
    camera.position.lerp(tmp.p, k)
    cam.look.lerp(tmp.l, 1 - Math.exp(-dt * 5))
    camera.lookAt(cam.look)
  })
  return null
}

/* ================================================================ post */
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
      camera={{ position: mobile ? [0, -0.6, 8.6] : [-2, 0.15, 6.4], fov: 45, near: 0.1, far: 80 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      aria-label="Your attention digital twin: a holographic particle head that dissolves into a brain, a focus fingerprint, a forking timeline and a knowledge graph as you scroll"
      role="img"
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <color attach="background" args={['#111214']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <Dust mobile={mobile} />
      <Twin count={count} mobile={mobile} />
      <Ping />
      <Rig mobile={mobile} />
      <Precompile />
      {mobile ? (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.8} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur resolutionScale={0.5} />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.85} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur />
          <VelocityCA />
          <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.35} />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
