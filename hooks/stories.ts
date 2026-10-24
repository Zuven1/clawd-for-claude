// Historias de Clawd: escenas largas con guion (avión de papel, mapa, cascos de música).
//
// Cada historia es una línea de tiempo de unos 9 s. Se dibuja una sola vez como SVG animado (SMIL): cada pieza (brazos,
// patitas, ojos, inclinación, el avión, las notas...) lleva su recorrido muestreado de las mismas curvas que se
// aprobaron en la vista previa, así que en la app se mueve sola a 60 fps sin redibujar nada. Todo va en píxeles de
// sprite (14 x 11) con el origen en la esquina de Clawd y el "adelante" hacia donde mira.

const C = {
  body: '#D97757',
  shade: '#B85C3E',
  dark: '#1f1a17',
  white: '#f8fafc',
  blue: '#7db8ff',
  green: '#63d2a1',
  red: '#ff7a70',
  yellow: '#f3c969',
  pink: '#ff8fb1',
  page: '#f4ead2',
  pageDim: '#cdbd98',
  cup: '#2b2f3a',
  cup2: '#454c60',
  fold: '#cdd3dc',
  fold2: '#aeb6c4',
}

/** Duración de cada historia (s) y, en ms, lo que dura la escena. */
export const STORY_S = { plane: 9, map: 9.5, music: 9 } as const
export type StoryKind = keyof typeof STORY_S
export const isStory = (k: string): k is StoryKind => k === 'plane' || k === 'map' || k === 'music'
export const storyMs = (k: StoryKind) => Math.round(STORY_S[k] * 1000)

/** Lo que necesita el avión para volar con holgura, en píxeles de sprite hacia delante (y hacia atrás) del origen. */
export const PLANE_AHEAD_U = 46
export const PLANE_BEHIND_U = 32

// ── utilidades de curvas ────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
type Ease = (t: number) => number
const E: Record<'lin' | 'io' | 'out' | 'in' | 'back', Ease> = {
  lin: t => t,
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  back: t => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}
type Key = [number, number] | [number, number, Ease]

/** Valor entre claves [tiempo, valor, ease?]; el ease de una clave rige el tramo que empieza en ella. */
function kf(t: number, K: Key[], ease: Ease = E.io): number {
  if (t <= K[0][0]) return K[0][1]
  for (let i = 0; i < K.length - 1; i++) {
    const k0 = K[i]
    const k1 = K[i + 1]
    if (t <= k1[0]) return lerp(k0[1], k1[1], (k0[2] ?? ease)((t - k0[0]) / (k1[0] - k0[0])))
  }
  return K[K.length - 1][1]
}

/** Curva suave (Catmull-Rom) por claves [tiempo, valor]: para el vuelo del avión. */
function cr(t: number, K: [number, number][]): number {
  const n = K.length
  if (t <= K[0][0]) return K[0][1]
  if (t >= K[n - 1][0]) return K[n - 1][1]
  let i = 0
  while (i < n - 2 && t > K[i + 1][0]) i++
  const [t0, v0] = K[i]
  const [t1, v1] = K[i + 1]
  const h = t1 - t0
  const s = (t - t0) / h
  const m0 = i > 0 ? (v1 - K[i - 1][1]) / (t1 - K[i - 1][0]) : (v1 - v0) / h
  const m1 = i < n - 2 ? (K[i + 2][1] - v0) / (K[i + 2][0] - t0) : (v1 - v0) / h
  const s2 = s * s
  const s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * m1
}

const win = (t: number, a: number, b: number) => t >= a && t <= b
const blinkAt = (t: number) => {
  const m = (t + 1.3) % 4.1
  return m > 3.95 ? 1 - Math.abs((m - 4.025) / 0.075) : 0
}
const pop = (t: number, a: number, d = 0.28) => (t < a ? 0 : t < a + d ? E.back((t - a) / d) : 1)
const memo = <T>(f: (t: number) => T): ((t: number) => T) => {
  const m = new Map<number, T>()
  return t => {
    const k = Math.round(t * 1000)
    let v = m.get(k)
    if (v === undefined) {
      v = f(t)
      m.set(k, v)
    }
    return v
  }
}

// ── SVG: series muestreadas ─────────────────────────────────────────────────

const N = 24 // muestras por segundo (la app interpola entre ellas)
const f2 = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0')
type F = (t: number) => number

function sample(T: number, f: (t: number) => string): string[] {
  const n = Math.max(2, Math.round(T * N))
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(f((i * T) / n))
  return out
}

/** `<animate>` de un atributo; si no cambia nunca, nada. */
function attr(name: string, T: number, f: F): string {
  const v = sample(T, t => f2(f(t)))
  return v.every(x => x === v[0]) ? '' : `<animate attributeName="${name}" values="${v.join(';')}" dur="${f2(T)}s" fill="freeze"/>`
}

/** `<animateTransform>` de un grupo; si no cambia nunca, el transform fijo. */
function tf(type: 'translate' | 'rotate' | 'scale', T: number, f: (t: number) => number[], inner: string): string {
  const v = sample(T, t => f(t).map(f2).join(' '))
  if (v.every(x => x === v[0])) return `<g transform="${type}(${v[0]})">${inner}</g>`
  return `<g><animateTransform attributeName="transform" type="${type}" values="${v.join(';')}" dur="${f2(T)}s" fill="freeze"/>${inner}</g>`
}

type Anims = Partial<Record<'x' | 'y' | 'width' | 'height' | 'opacity', F>>
function rect(x: number, y: number, w: number, h: number, fill: string, T = 0, a: Anims = {}): string {
  const v = { x, y, width: w, height: h, opacity: 1, ...Object.fromEntries(Object.entries(a).map(([k, f]) => [k, (f as F)(0)])) }
  const an = Object.entries(a).map(([k, f]) => attr(k, T, f as F)).join('')
  const op = 'opacity' in a ? ` opacity="${f2(v.opacity)}"` : ''
  return `<rect x="${f2(v.x)}" y="${f2(v.y)}" width="${f2(v.width)}" height="${f2(v.height)}" fill="${fill}"${op}>${an}</rect>`
}
const plain = (cells: number[][], color: string) => cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join('')
const Q_CELLS = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [1, 4]]
const X_CELLS = [[1, 0], [1, 1], [1, 2], [1, 4]]
const NOTE_CELLS = [[1, 0], [2, 0], [1, 1], [3, 1], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]]

// ── el cuerpo de Clawd (el mismo de siempre) ────────────────────────────────

type Pose = {
  dy: number // desplazamiento vertical (saltitos)
  rot: number // inclinación (grados) sobre los pies
  sx: number
  sy: number
  aL: [number, number] // brazo izquierdo: y, alto
  aR: [number, number]
  legs: number[]
  happy: boolean
  gx: number // mirada
  gy: number
  eh: number // alto de los ojos
  ecy: number // centro vertical de los ojos
  blink: number
}
const idleArms = (t: number): Pick<Pose, 'aL' | 'aR'> => ({
  aL: [5.2 + 0.2 * Math.sin(t * 2.6), 2],
  aR: [5.2 - 0.2 * Math.sin(t * 2.6), 2],
})
const basePose = (t: number): Pose => ({
  dy: 0, rot: 0, sx: 1, sy: 1, ...idleArms(t), legs: [2, 2, 2, 2], happy: false, gx: 0, gy: 0, eh: 3, ecy: 5.5, blink: blinkAt(t),
})

/** Clawd entero con su línea de tiempo. `front` va sobre el cuerpo, `top` sobre la cabeza y `world` fuera (sin girar). */
function rig(T: number, P: (t: number) => Pose, face: number, front: string, top: string, world: string): string {
  const arm = (x: number, w: number, side: 'aL' | 'aR') =>
    rect(x, 5, w, 2, C.body, T, { y: t => P(t)[side][0], height: t => P(t)[side][1] })
  const legs = [3, 5, 8, 10].map((x, i) => rect(x, 9, 1, 2, C.shade, T, { height: t => P(t).legs[i] })).join('')
  const eye = (x: number) =>
    rect(x, 4, 1, 3, C.dark, T, {
      y: t => P(t).ecy - (P(t).eh * (1 - P(t).blink) + 0.4 * P(t).blink) / 2,
      height: t => P(t).eh * (1 - P(t).blink) + 0.4 * P(t).blink,
      opacity: t => (P(t).happy ? 0 : 1),
    })
  const arc = (x: number) => {
    const a = (px: number, py: number) => rect(px, py, 1, 1, C.dark, T, { opacity: t => (P(t).happy ? 1 : 0) })
    return a(x, 5.5) + a(x + 1, 4.5) + a(x + 2, 5.5)
  }
  const eyes = tf('translate', T, t => [P(t).gx * 0.9, P(t).gy * 0.75], eye(4) + eye(9) + arc(3) + arc(8))
  const sprite =
    arm(0, 2, 'aL') + arm(12, 2, 'aR') + rect(2, 3, 10, 6, C.body) + rect(2, 8, 10, 1, C.shade) + legs + eyes + front + top
  const body = tf('rotate', T, t => [P(t).rot], tf('scale', T, t => [P(t).sx, P(t).sy], `<g transform="translate(-7 -11)">${sprite}</g>`))
  const hop = tf('translate', T, t => [0, P(t).dy], `<g transform="translate(7 11)">${body}</g>`)
  return `<g transform="translate(7 0) scale(${face} 1) translate(-7 0)">${hop}${world}</g>`
}

/** Un símbolo de píxeles (?, !) que aparece con un saltito y se desvanece. */
function glyph(T: number, cells: number[][], color: string, cx: number, cy: number, op: F, scale: F, bob: F = () => 0): string {
  const inner = tf('scale', T, t => [scale(t)], `<g transform="translate(${-cx} ${-cy})">${plain(cells, color)}</g>`)
  const moved = tf('translate', T, t => [6 + cx, -2.6 + cy + bob(t)], inner)
  return `<g>${attr('opacity', T, op)}${moved}</g>`
}

// ── 1 · avión de papel ──────────────────────────────────────────────────────

function planeStory(face: number): string {
  const T = STORY_S.plane
  const TR = 2.62
  const TL = 6.1
  const fx = (u: number) => 14.2 + 19.3 * (1 - Math.pow(1 - u, 1.6))
  const fy = (u: number) =>
    cr(u, [[0, 2.4], [0.2, -0.8], [0.5, 0], [0.8, 5.2], [0.93, 8.1], [1, 8.6]]) + 0.3 * Math.sin(u * 17) * (1 - u)
  const slope = (u: number) => {
    const a = clamp(u, 0, 0.985)
    const b = a + 0.012
    return (Math.atan2(fy(b) - fy(a), fx(b) - fx(a)) * 180) / Math.PI
  }
  const handY = (t: number) => kf(t, [[0, 5], [0.55, 5], [1, 2.8], [1.75, 2.8], [2.25, 0.9], [2.5, 0.9], [2.72, 3.4, E.out], [3.3, 5]])
  const F = memo((t: number) => {
    const lean = kf(t, [[0, 0], [1.7, 0], [2.25, -6], [2.5, -6], [2.75, 7, E.out], [3.3, 0]])
    const aRh = kf(t, [[0, 2], [0.55, 2], [1, 2.6], [2.25, 3.6], [2.5, 3.6], [2.72, 2.4], [3.3, 2]])
    const hop = win(t, 6.3, 6.9) ? Math.sin(((t - 6.3) / 0.6) * Math.PI) : 0
    const up = pop(t, 6.25, 0.3) * (t < 7.1 ? 1 : 1 - E.io(clamp((t - 7.1) / 0.5, 0, 1)))
    const sq = win(t, 6.9, 7.12) ? 1 - 0.1 * Math.sin(((t - 6.9) / 0.22) * Math.PI) : 1
    const p = basePose(t)
    p.dy = -hop * 2.4
    p.rot = lean
    p.sy = sq
    p.sx = (1 / sq) * 0.5 + 0.5
    if (t > 0.5 && t < 3.3) p.aR = [handY(t), aRh]
    if (up > 0) {
      p.aL = [lerp(5, 1.5, up), lerp(2, 3.5, up)]
      p.aR = [lerp(p.aR[0], 1.5, up), lerp(p.aR[1], 3.5, up)]
    }
    if (hop > 0) p.legs = [1, 1, 1, 1]
    let x = 0
    let y = 0
    let rot = 0
    let sc = 1
    let vis = 1
    const trail: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    if (t < TR) {
      const rr = kf(t, [[0.55, -30], [1, -30], [1.25, -48], [1.55, -22], [1.75, -30], [2.25, -62], [2.5, -62], [2.62, -14]])
      // la mano, con la inclinación y el aplastado del cuerpo
      const a = (lean * Math.PI) / 180
      const dx = (13.7 - 7) * p.sx
      const dy = (handY(t) - 0.5 - 11) * p.sy
      x = 7 + dx * Math.cos(a) - dy * Math.sin(a)
      y = 11 + dx * Math.sin(a) + dy * Math.cos(a) + p.dy
      rot = rr + lean
      sc = pop(t, 0.5, 0.3) * 0.9
      if (t < 0.5) vis = 0
    } else {
      const u = clamp((t - TR) / (TL - TR), 0, 1)
      x = fx(u)
      y = fy(u)
      sc = 0.9
      const land = E.io(clamp((u - 0.86) / 0.14, 0, 1))
      rot = clamp(slope(u), -34, 24) * (1 - land)
      if (u < 1) {
        for (let i = 0; i < 3; i++) {
          const uu = u - (i + 1) * 0.075
          if (uu >= 0) trail[i] = [fx(uu) - 0.6, fy(uu) - 0.6, 0.38 - i * 0.11]
        }
      }
      if (t > 7.6) vis = clamp(1 - (t - 7.6) / 0.7, 0, 1)
    }
    if (t < 0.55) { p.gx = 0; p.gy = 0 }
    else if (t < TR) {
      p.gx = kf(t, [[0.55, 0], [0.9, 0.8], [2.0, 0.8], [2.2, 1], [2.62, 1]])
      p.gy = kf(t, [[0.55, 0], [0.9, -0.8], [2.0, -0.8], [2.2, -0.5], [2.62, -0.45]])
    } else {
      p.gx = clamp((x - 7) / 8, -1, 1)
      p.gy = clamp((y - 5.5) / 6, -1, 1)
    }
    if (t > 6.15 && t < 7.5) { p.happy = true; p.gx = 0; p.gy = 0 }
    return { p, x, y, rot, sc, vis, trail }
  })
  const shape =
    rect(0, 0, 2, 1, C.white) + rect(0, 1, 4, 1, C.white) + rect(0, 2, 7, 1, C.fold2) + rect(0, 3, 4, 1, C.fold) + rect(0, 4, 2, 1, C.fold)
  const plane =
    `<g>${attr('opacity', T, t => F(t).vis)}` +
    tf('translate', T, t => [F(t).x, F(t).y],
      tf('rotate', T, t => [F(t).rot],
        tf('scale', T, t => [Math.max(F(t).sc, 0.01)], `<g transform="translate(-3.5 -2.5)">${shape}</g>`))) +
    '</g>'
  const trail = [0, 1, 2].map(i =>
    rect(0, 0, 1.2, 1.2, C.white, T, { x: t => F(t).trail[i][0], y: t => F(t).trail[i][1], opacity: t => F(t).trail[i][2] })).join('')
  return rig(T, t => F(t).p, face, '', '', trail + plane)
}

// ── 2 · mirando un mapa ─────────────────────────────────────────────────────

function mapStory(face: number): string {
  const T = STORY_S.map
  const F = memo((t: number) => {
    const sx = kf(t, [[0, 0.1], [0.5, 0.1], [1.1, 1.04, E.out], [1.3, 1], [6.1, 1], [6.9, 0.1, E.in]])
    const pres = clamp((sx - 0.1) / 0.9, 0, 1) * (t > 6.1 && t < 6.9 ? 1 - E.io((t - 6.1) / 0.8) : 1)
    const mapVis = t > 0.5 && t < 6.9
    const drop = kf(t, [[6.1, 0], [6.9, 2.4, E.in]])
    const rotM = kf(t, [[3.3, 0], [4.1, 180], [4.5, 180], [5.3, 360]])
    const head = (win(t, 1.4, 3.2) ? 2.6 * Math.sin((t - 1.4) * 2.4) : 0) + kf(t, [[3.4, 0], [3.9, -5], [4.9, -5], [5.4, 0]])
    const hop = win(t, 6.5, 7.0) ? Math.sin(((t - 6.5) / 0.5) * Math.PI) : 0
    const sq = win(t, 7.0, 7.2) ? 1 - 0.09 * Math.sin(((t - 7.0) / 0.2) * Math.PI) : 1
    const p = basePose(t)
    p.dy = -hop * 1.9
    p.rot = head
    p.sy = sq
    if (hop > 0) p.legs = [1.1, 1.1, 1.1, 1.1]
    if (pres > 0) {
      p.aL = [lerp(5.2, 6.2, pres), lerp(2, 2.6, pres)]
      p.aR = [lerp(5.2, 6.2, pres), lerp(2, 2.6, pres)]
    }
    const aUp = kf(t, [[6.3, 0], [6.6, 1, E.out], [7.7, 1], [8.3, 0]])
    if (aUp > 0) {
      const w = 0.5 * Math.sin((t - 6.7) * 15) * (win(t, 6.7, 7.4) ? 1 : 0)
      p.aR = [lerp(p.aR[0], 1.4 + w, aUp), lerp(p.aR[1], 3.6, aUp)]
    }
    p.eh = lerp(3, 1.7, pres)
    p.ecy = lerp(5.5, 4.85, pres)
    p.gx = kf(t, [[1.3, 0], [1.5, -0.8], [2.0, -0.8], [2.3, -0.3], [2.6, 0.1], [2.9, 0.5], [3.3, 0.9], [3.6, 0.9], [4.1, -0.6], [4.5, 0.6], [4.9, -0.3], [5.3, 0], [5.6, 0.9], [6.5, 0.9], [6.9, 0]])
    p.gy = kf(t, [[1.3, 0], [1.5, 0.5], [3.5, 0.5], [5.4, 0.2], [5.7, -0.8], [6.6, -0.8], [6.9, 0]])
    if (win(t, 6.55, 7.7)) { p.happy = true; p.gx = 0; p.gy = 0 }
    const hx = 4.5 * Math.max(sx, 0.02)
    const hv = mapVis && sx > 0.35 && t < 6.6 ? 1 : 0
    return {
      p, sx: Math.max(sx, 0.02), drop, rotM, hx, hv,
      mapOp: mapVis ? clamp(1 - Math.max(0, t - 6.5) / 0.4, 0, 1) : 0,
      qOp: win(t, 3.5, 5.5) ? (t > 5.15 ? 1 - (t - 5.15) / 0.35 : 1) : 0,
      qS: Math.max(pop(t, 3.5, 0.3), 0.01),
      qBob: -0.4 * Math.sin(t * 7),
      eOp: win(t, 5.65, 7.0) ? (t > 6.6 ? 1 - (t - 6.6) / 0.4 : 1) : 0,
      eS: Math.max(pop(t, 5.65, 0.3), 0.01),
    }
  })
  const content =
    rect(0, 0, 9, 4.4, C.page) + rect(0, 4, 9, 0.4, C.pageDim) + rect(3, 0, 0.3, 4.4, C.pageDim) + rect(6, 0, 0.3, 4.4, C.pageDim) +
    rect(0.5, 0.5, 1.5, 1, C.green) + rect(1.1, 1.3, 1.2, 0.8, C.green) + rect(6.6, 2.6, 1.6, 1, C.green) +
    [[3.4, 0.4], [4, 1.2], [4.4, 2], [4.8, 2.8]].map(([x, y]) => rect(x, y, 1, 0.8, C.blue)).join('') +
    [[0.8, 3.1], [1.9, 2.7], [2.2, 3.3], [5.5, 1.8], [6.4, 1.3]].map(([x, y]) => rect(x, y, 0.5, 0.5, C.red)).join('') +
    [[7, 0.5], [8, 0.5], [7.5, 1], [7, 1.5], [8, 1.5]].map(([x, y]) => rect(x, y, 0.6, 0.5, C.red)).join('')
  const map =
    `<g>${attr('opacity', T, t => F(t).mapOp)}` +
    tf('translate', T, t => [7, 7.9 + F(t).drop],
      tf('scale', T, t => [F(t).sx, 1 - F(t).drop * 0.12],
        tf('rotate', T, t => [F(t).rotM], `<g transform="translate(-4.5 -2.2)">${content}</g>`))) +
    '</g>'
  const hand = (sign: number) =>
    rect(0, 0, 1.3, 1.3, C.body, T, {
      x: t => 7 + sign * F(t).hx - 0.65,
      y: t => 7.3 + F(t).drop,
      opacity: t => F(t).hv,
    })
  const q = glyph(T, Q_CELLS, C.white, 1.5, 2.5, t => F(t).qOp, t => F(t).qS, t => F(t).qBob)
  const ex = glyph(T, X_CELLS, C.yellow, 1.5, 2.5, t => F(t).eOp, t => F(t).eS)
  return rig(T, t => F(t).p, face, map + hand(-1) + hand(1), q + ex, '')
}

// ── 3 · cascos de música ────────────────────────────────────────────────────

function musicStory(face: number): string {
  const T = STORY_S.music
  const B = 0.5
  const NC = [C.pink, C.blue, C.green, C.yellow]
  const F = memo((t: number) => {
    const hy = t < 7.15 ? kf(t, [[0.5, -9], [1.1, 0, E.back]]) : kf(t, [[7.15, 0], [7.9, -9, E.in]])
    const hpOp = t < 0.5 ? 0 : t > 7.5 ? clamp(1 - (t - 7.5) / 0.4, 0, 1) : 1
    const g = clamp((t - 1.7) / 0.4, 0, 1) * (t > 7.0 ? 1 - clamp((t - 7.0) / 0.3, 0, 1) : 1)
    const ph = ((((t - 1.7) % B) + B) % B) / B
    const beat = Math.floor((t - 1.7) / B)
    const p = basePose(t)
    let led = 0.5
    if (g > 0) {
      const squash = 1 - 0.075 * Math.exp(-ph * 7) + 0.02 * Math.sin(ph * Math.PI)
      p.sy = lerp(1, squash, g)
      p.rot = g * 3.2 * Math.sin(((t - 1.7) * Math.PI * 2) / (B * 2))
      const bump = Math.exp(-ph * 6)
      p.aL = [5 - g * 1.2 * bump * (beat % 2 ? 1 : 0.3), 2]
      p.aR = [5 - g * 1.2 * bump * (beat % 2 ? 0.3 : 1), 2]
      const s = beat % 2
      p.legs = [s ? 2 : 1.2, s ? 1.2 : 2, s ? 2 : 1.2, s ? 1.2 : 2].map(h => lerp(2, h, g))
      led = 0.35 + 0.65 * Math.exp(-ph * 4)
      if (t > 2.0) p.happy = true
    }
    if (win(t, 0.6, 1.5)) {
      const a = kf(t, [[0.5, 0], [0.8, 1], [1.2, 1], [1.6, 0]])
      p.aL = [lerp(5, 1.5, a), lerp(2, 3.5, a)]
      p.aR = [lerp(5, 1.5, a), lerp(2, 3.5, a)]
    }
    if (win(t, 6.95, 8.3)) {
      const a = kf(t, [[6.95, 0], [7.25, 1], [7.75, 1], [8.3, 0]])
      p.aL = [lerp(5, 1.5, a), lerp(2, 3.5, a)]
      p.aR = [lerp(5, 1.5, a), lerp(2, 3.5, a)]
    }
    return { p, hy, hpOp, led }
  })
  const cup = (x: number) => rect(x, 3.6, 2, 3.8, C.cup) + rect(x + 0.35, 4.2, 1.3, 2.6, C.cup2)
  const led = (x: number) => rect(x, 4.5, 0.6, 0.6, C.blue, T, { opacity: t => F(t).led })
  const phones =
    `<g>${attr('opacity', T, t => F(t).hpOp)}` +
    tf('translate', T, t => [0, F(t).hy],
      rect(4, 1.4, 6, 1, C.white) + rect(3, 2.2, 1, 1.4, C.white) + rect(10, 2.2, 1, 1.4, C.white) +
      cup(1.2) + cup(10.8) + led(1.7) + led(11.7)) +
    '</g>'
  // notas que suben desde un auricular, de lado a lado
  const note = (k: number) => {
    const t0 = 2.3 + k * 0.8
    const side = k % 2 ? 1 : -1
    const a = (t: number) => (t - t0) / 2.1
    const live = (t: number) => a(t) >= 0 && a(t) <= 1
    const op = (t: number) => (!live(t) ? 0 : a(t) < 0.12 ? a(t) / 0.12 : a(t) > 0.55 ? (1 - a(t)) / 0.45 : 1)
    const pos = (t: number) => {
      const u = clamp(a(t), 0, 1)
      return [(side < 0 ? 0.6 : 11.8) + side * u * 4.2 + Math.sin(u * 9 + k) * 0.9, 1.6 - u * 7.2]
    }
    const sc = (t: number) => 0.55 + 0.45 * E.out(Math.min(1, clamp(a(t), 0, 1) * 4))
    return `<g>${attr('opacity', T, op)}` + tf('translate', T, pos, tf('scale', T, t => [sc(t)], `<g transform="translate(-2 -2.5)">${plain(NOTE_CELLS, NC[k % 4])}</g>`)) + '</g>'
  }
  const notes = [0, 1, 2, 3, 4, 5].map(note).join('')
  return rig(T, t => F(t).p, face, '', phones, notes)
}

// ── la API ───────────────────────────────────────────────────────────────────

const cache = new Map<string, string>()
/** El dibujo de una historia (sin SVG ni escala: el de `scene.ts` lo envuelve). Igual para la misma cara. */
export function storyBody(kind: StoryKind, face: number): string {
  const key = `${kind}:${face}`
  let s = cache.get(key)
  if (s === undefined) {
    s = kind === 'plane' ? planeStory(face) : kind === 'map' ? mapStory(face) : musicStory(face)
    cache.set(key, s)
  }
  return s
}
