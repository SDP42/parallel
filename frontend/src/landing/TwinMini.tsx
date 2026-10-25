import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildHead, PALETTE } from './shapes'

/**
 * A compact hologram of the twin's head (~3.5k particles) that breathes and turns.
 * Cheap enough for a dashboard card: one draw call, no post-processing, capped DPR,
 * and it stops rendering while off-screen or when the tab is hidden.
 */
export type TwinMood = 'curious' | 'proud' | 'sleepy' | 'cheerful'

const MOODS: Record<TwinMood, { speed: number; tilt: number; nod: number; bright: number; scan: number; tint: string; core: string }> = {
  curious: { speed: 0.55, tilt: 0.22, nod: 0.05, bright: 1, scan: 1, tint: PALETTE[0], core: PALETTE[1] },
  proud: { speed: 0.3, tilt: 0, nod: -0.18, bright: 1.2, scan: 0.8, tint: '#ffe9df', core: PALETTE[2] },
  sleepy: { speed: 0.12, tilt: 0.1, nod: 0.32, bright: 0.55, scan: 0.35, tint: PALETTE[3], core: PALETTE[5] },
  cheerful: { speed: 0.8, tilt: -0.12, nod: -0.04, bright: 1.15, scan: 1.4, tint: PALETTE[0], core: PALETTE[1] },
}

const vertex = /* glsl */ `
uniform float uTime;
uniform float uPR;
uniform float uSize;
uniform float uBright;
uniform float uScan;
uniform vec3 uTint;
uniform vec3 uCore;
uniform vec3 uMint;
attribute vec2 aAux;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  float breathe = 1.0 + sin(uTime * 1.4) * 0.012;
  p *= breathe;
  p += vec3(sin(uTime * 1.3 + aAux.y * 50.0), cos(uTime * 1.1 + aAux.y * 31.0), sin(uTime * 0.9 + aAux.y * 17.0)) * 0.01;
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
  float band = 0.5 + 0.5 * sin(wp.y * 24.0 - uTime * 2.4 * uScan);
  float sweepY = mod(uTime * 0.5 * uScan, 4.0) - 2.0;
  float sweep = exp(-pow((wp.y - sweepY) * 5.0, 2.0));
  vec3 n = normalize(normalMatrix * normalize(p - vec3(0.0, 0.05, 0.0)));
  float rim = pow(1.0 - abs(n.z), 2.0);
  vec3 c = mix(uTint, uCore, aAux.x);
  c = mix(c, uMint, rim * 0.35 + sweep * 0.6);
  vColor = c;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float a = (0.45 + aAux.y * 0.5) * ((0.5 + 0.8 * band) * (0.55 + 1.2 * rim) + sweep * 1.2) * uBright;
  a *= clamp(1.25 - (-mv.z - 4.2) * 0.45, 0.2, 1.25);
  vAlpha = a;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.6 + aAux.y * 0.8) / -mv.z;
}
`
const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.05, d) * vAlpha);
}
`

function Head({ mood, count }: { mood: TwinMood; count: number }) {
  const g = useRef<THREE.Group>(null!)
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const { gl } = useThree()
  const geo = useMemo(() => {
    const h = buildHead(count)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(h.pos, 3))
    geom.setAttribute('aAux', new THREE.BufferAttribute(h.aux, 2))
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return geom
  }, [count])
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uPR: { value: Math.min(gl.getPixelRatio(), 1.5) }, uSize: { value: 14 },
    uBright: { value: 1 }, uScan: { value: 1 },
    uTint: { value: new THREE.Color(PALETTE[0]) }, uCore: { value: new THREE.Color(PALETTE[1]) }, uMint: { value: new THREE.Color(PALETTE[1]) },
  }), [gl])
  const tint = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const M = MOODS[mood]
    const u = mat.current.uniforms
    u.uTime.value = t
    u.uBright.value += (M.bright - u.uBright.value) * 0.05
    u.uScan.value += (M.scan - u.uScan.value) * 0.05
    u.uTint.value.lerp(tint.set(M.tint), 0.05)
    u.uCore.value.lerp(tint.set(M.core), 0.05)
    const grp = g.current
    const bob = mood === 'cheerful' ? Math.abs(Math.sin(t * 2.2)) * 0.08 : 0
    grp.rotation.y = Math.sin(t * M.speed) * 0.55 + (mood === 'curious' ? Math.sin(t * 0.9) * 0.15 : 0)
    grp.rotation.z += (M.tilt * Math.sin(t * 0.4 + 0.5) - grp.rotation.z) * 0.05
    grp.rotation.x += (M.nod + (mood === 'sleepy' ? Math.sin(t * 0.6) * 0.08 : 0) - grp.rotation.x) * 0.05
    grp.position.y = 0.15 + bob + Math.sin(t * 1.4) * 0.02
  })
  return (
    <group ref={g}>
      <points geometry={geo}>
        <shaderMaterial ref={mat} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms}
          transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  )
}

export default function TwinMini({ mood = 'curious', size = 160 }: { mood?: TwinMood; size?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [hidden, setHidden] = useState(false)
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    const vis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])
  const count = size < 120 ? 2200 : 3600
  return (
    <div ref={box} style={{ width: size, height: size }} role="img" aria-label={`Your twin, feeling ${mood}`}>
      <Canvas
        flat
        dpr={[1, 1.5]}
        frameloop={reduce ? 'demand' : visible && !hidden ? 'always' : 'never'}
        camera={{ position: [0, 0.1, 4.6], fov: 40, near: 0.1, far: 20 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        style={{ background: 'transparent' }}
      >
        <Head mood={mood} count={count} />
      </Canvas>
    </div>
  )
}
