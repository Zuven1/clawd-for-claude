import type { ClientModule } from 'claude-code'

// Clawd, vivo. Camina solo por la banda, se deja agarrar con el ratón, se arrastra (también arriba y
// abajo), se suelta y cae.
//
// Se dibuja con medios bloques de color (cada celda de texto son dos píxeles de alto) en la
// tipografía monoespaciada de la superficie. El escritorio NO respeta `height`, `overflow` ni las
// posiciones absolutas para dimensionar la región (medido: 98 columnas x 1 fila), así que el dibujo
// es en flujo normal: una fila de texto por cada fila de la banda, con la altura dada por las filas
// que se dibujan.

type Mood = 'idle' | 'thinking' | 'tool' | 'ok' | 'fail' | 'done'
type Props = { mood: Mood; label: string; rows: number; slot?: number }
type Mode =
  | 'idle' | 'walk' | 'wave' | 'crouch' | 'jump' | 'sleep' | 'yawn' | 'drag'
  | 'fall' | 'land' | 'pet' | 'dizzy' | 'shake' | 'cheer'

type Fx = { x: number; y: number; vx: number; vy: number; life: number; c: string }

type Sim = {
  x: number // píxeles (1 píxel = 1 columna)
  y: number // píxeles verticales (2 por fila de texto), arriba del sprite
  vx: number
  vy: number
  mode: Mode
  t: number // ticks en el modo actual
  tick: number
  facing: number // -1 izquierda, 1 derecha
  target: number
  wait: number
  idleTicks: number
  blink: number
  blinkIn: number
  seed: number
  mood: Mood
  props: Props
  hover: boolean
  hoverX: number
  grabDx: number
  grabDy: number
  downTick: number
  moved: number
  pressX: number
  pressY: number
  trail: number[][] // [tick, x, y] de los últimos movimientos
  impact: number
  bounced: boolean
  sway: number // balanceo de las patas al arrastrar
  fx: Fx[] // polvo y confeti, en píxeles relativos a la esquina del sprite
  events: Record<string, number>
  lastEvent: string
  lastKey: string // lo último que se dibujó: no se repinta si no cambia
}

const W = 10 // ancho del sprite (píxeles = columnas)
const H = 8 // alto del sprite (píxeles; 2 por fila de texto)
const PAD = 4 // margen del escenario a cada lado (polvo y confeti)
const SW = W + PAD * 2
const DEFAULT_ROWS = 8
const TICK_MS = 80
const GRAVITY = 0.45
const NBSP = ' '

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
  dust: '#e8d9c8',
}
const CONFETTI = [C.yellow, C.pink, C.blue, C.green, C.white]

// El color de cada sesión (los mismos que en scene.ts: naranja, azul, amarillo, blanco, verde, rosa, morado, turquesa)
const SKIN: [string, string][] = [
  ['#D97757', '#B85C3E'], ['#5B9BE6', '#3E72B8'], ['#E9C24B', '#BE9A2C'], ['#F1EFEA', '#C6C2BA'],
  ['#63C48F', '#3F9A6B'], ['#E88BB0', '#BC6489'], ['#A184DE', '#7B5EB8'], ['#4FC3C9', '#2F9AA0'],
]
/** El color de una celda con el de la sesión (el cuerpo y su sombra cambian; lo demás, no). */
const skin = (c: string | undefined, slot: number): string | undefined => {
  if (c === undefined) return c
  const k = SKIN[((Math.floor(slot) % SKIN.length) + SKIN.length) % SKIN.length]
  return c === C.body ? k[0] : c === C.shade ? k[1] : c
}

type Grid = (string | null)[][]

const blank = (w: number): Grid => Array.from({ length: H }, () => Array<string | null>(w).fill(null))
const put = (g: Grid, x: number, y: number, c: string) => {
  if (y >= 0 && y < H && x >= 0 && x < g[0].length) g[y][x] = c
}
const fill = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c)
}

const rnd = (s: Sim) => {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0
  return s.seed / 4294967296
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const bandRows = (s: Sim) => Math.max(4, Math.round(s.props.rows || DEFAULT_ROWS))
const floorOf = (rows: number) => Math.max(0, rows * 2 - H)

// ── el sprite (10 x 8) ──────────────────────────────────────────────────────

function sprite(s: Sim): Grid {
  const g = blank(W)
  const p = s.props
  const m = s.mode
  const busy = m === 'idle' || m === 'walk' // los estados de ánimo se muestran con él quieto o andando
  const phase = Math.floor(s.t / 3) % 4
  const squash = m === 'land' ? (s.t < 2 ? 2 : 1) : m === 'crouch' ? 1 : 0
  const breathe = m === 'idle' && s.tick % 36 < 4 ? 1 : 0 // respira: el cuerpo baja un píxel
  const bob = m === 'walk' && phase % 2 === 1 ? 1 : 0 // al andar, el cuerpo sube y baja
  const drop = squash + bob + breathe
  const stretch = (m === 'jump' || m === 'cheer') && s.vy < -1 // al despegar se estira
  const top = 2 + drop - (stretch ? 1 : 0)

  // ojos
  let eyes: 'open' | 'blink' | 'happy' | 'wide' | 'closed' | 'dizzy' = 'open'
  let look = 0
  if (m === 'sleep' || m === 'yawn' || m === 'crouch') eyes = 'closed'
  else if (m === 'drag' || m === 'fall' || m === 'shake') eyes = 'wide'
  else if (m === 'pet' || m === 'cheer') eyes = 'happy'
  else if (m === 'dizzy') eyes = 'dizzy'
  else if (m === 'land') eyes = squash === 2 ? 'closed' : 'open'
  else if (busy && (p.mood === 'ok' || p.mood === 'done')) eyes = 'happy'
  else if (busy && p.mood === 'fail') eyes = 'wide'
  else if (s.blink > 0) eyes = 'blink'
  if (eyes === 'open' || eyes === 'blink') {
    if (m === 'walk') look = s.facing
    else if (busy && p.mood === 'thinking') look = [-1, 0, 1, 0][Math.floor(s.tick / 8) % 4]
    else if (m === 'idle' && s.hover) look = clamp(Math.sign(s.hoverX - (s.x + W / 2)), -1, 1)
    else if (m === 'idle' && p.mood === 'idle') look = [0, 0, 0, -1, 0, 0, 1, 0][Math.floor(s.tick / 25) % 8] // mira a su alrededor
  }

  // cuerpo (se estira al despegar, se ensancha al aplastarse)
  for (let y = top; y <= 5; y++) {
    const wide = squash > 0 && y >= 4
    fill(g, wide ? 0 : 1, y, wide ? 9 : 8, y, y === 5 ? C.shade : C.body)
  }

  // ojos (dibujo)
  for (const ex of [3, 6]) {
    const y0 = top + 1
    const x = clamp(ex + look, 2, 7)
    if (eyes === 'open') fill(g, x, y0, x, y0 + 1, C.dark)
    else if (eyes === 'blink') put(g, x, y0 + 1, C.dark)
    else if (eyes === 'happy') {
      put(g, x - 1, y0 + 1, C.dark); put(g, x, y0, C.dark); put(g, x + 1, y0 + 1, C.dark)
    } else if (eyes === 'wide') {
      const wx = ex === 3 ? 2 : 6
      fill(g, wx, y0, wx + 1, y0 + 1, C.dark)
    } else if (eyes === 'closed') fill(g, x - 1, y0 + 1, x + 1, y0 + 1, C.dark)
    else if (eyes === 'dizzy') {
      put(g, x - 1, y0, C.dark); put(g, x + 1, y0, C.dark); put(g, x, y0 + 1, C.dark)
    }
  }

  // brazos
  const flap = s.tick % 2
  const arm = (side: 0 | 1, y0: number, y1: number) => fill(g, side === 0 ? 0 : 9, y0 + drop, side === 0 ? 0 : 9, y1 + drop, C.body)
  if (m === 'drag' || m === 'fall') {
    arm(0, flap, 2 + flap); arm(1, 1 - flap, 3 - flap)
  } else if (m === 'jump' || m === 'cheer' || m === 'pet' || m === 'yawn') {
    arm(0, 0, 2); arm(1, 0, 2)
  } else if (m === 'crouch' || m === 'sleep') {
    arm(0, 4, 5); arm(1, 4, 5)
  } else if (m === 'wave') {
    const w = Math.floor(s.t / 2) % 2
    arm(0, 3, 4); arm(1, w, 1 + w)
  } else if (m === 'walk') {
    arm(0, phase === 1 ? 2 : 3, phase === 1 ? 3 : 4); arm(1, phase === 3 ? 2 : 3, phase === 3 ? 3 : 4)
  } else if (busy && p.mood === 'tool') {
    const a = Math.floor(s.tick / 2) % 2
    arm(0, a ? 0 : 3, a ? 2 : 4); arm(1, a ? 3 : 0, a ? 4 : 2)
  } else if (busy && (p.mood === 'ok' || p.mood === 'done')) {
    arm(0, 0, 2); arm(1, 0, 2)
  } else {
    arm(0, 3, 4); arm(1, 3, 4)
  }

  // patas (al arrastrar se balancean con el movimiento)
  const air = m === 'jump' || m === 'cheer' || m === 'fall'
  ;[2, 4, 5, 7].forEach((x, i) => {
    const pairA = i === 0 || i === 2
    let lifted = false
    if (air) lifted = true
    else if (m === 'walk') lifted = phase === 1 ? pairA : phase === 3 ? !pairA : false
    if (m === 'drag') {
      const lx = x + clamp(Math.round(-s.sway * (i % 2 ? 1 : 0.6)), -2, 2)
      fill(g, lx, 6, lx, (i + flap) % 2 === 0 ? 7 : 6, C.shade)
    } else if (squash === 2) put(g, x, 7, C.shade)
    else if (lifted) put(g, x, 6, C.shade)
    else fill(g, x, 6, x, 7, C.shade)
  })

  // extras encima
  if (busy && p.mood === 'thinking') {
    const n = 1 + (Math.floor(s.tick / 5) % 3)
    ;[3, 5, 7].slice(0, n).forEach(x => put(g, x, 0, C.white))
  }
  if (busy && p.mood === 'tool') {
    if (s.tick % 4 < 2) { put(g, 0, 1, C.blue); put(g, 9, 0, C.blue) } else { put(g, 1, 0, C.blue); put(g, 8, 1, C.blue) }
  }
  if (busy && p.mood === 'ok') [[4, 0], [5, 1], [6, 0]].forEach(([x, y]) => put(g, x, y, C.green))
  if (busy && p.mood === 'fail') { put(g, 5, 0, C.red); put(g, 5, 1, C.red) }
  if (m === 'cheer' || (busy && p.mood === 'done')) {
    const sp: number[][][] = [[[0, 1], [9, 0], [5, 0]], [[0, 0], [8, 1], [4, 1]]]
    sp[Math.floor(s.tick / 3) % 2].forEach(([x, y]) => put(g, x, y, C.white))
  }
  if (m === 'pet') [[4, 0], [6, 0], [4, 1], [5, 1], [6, 1]].forEach(([x, y]) => put(g, x, y, C.pink))
  if (m === 'sleep') {
    const pos = [[6, 1], [7, 0], [8, 0]][Math.floor(s.t / 8) % 3]
    put(g, pos[0], pos[1], C.blue)
  }
  if (m === 'yawn') put(g, 5, 1, C.blue)
  if (m === 'dizzy') {
    const o = [[3, 1], [5, 0], [7, 1], [5, 1]]
    put(g, o[s.t % 4][0], o[s.t % 4][1], C.yellow)
    put(g, o[(s.t + 2) % 4][0], o[(s.t + 2) % 4][1], C.yellow)
  }
  return g
}

// escenario: el sprite con margen a los lados para el polvo y el confeti
function stage(s: Sim): Grid {
  const st = blank(SW)
  const sp = sprite(s)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sp[y][x]) st[y][x + PAD] = sp[y][x]
  for (const f of s.fx) put(st, Math.round(f.x) + PAD, Math.round(f.y), f.c)
  return st
}

// ── la simulación ───────────────────────────────────────────────────────────

const setMode = (s: Sim, m: Mode) => {
  s.mode = m
  s.t = 0
}

const puff = (s: Sim, side: number, n: number) => {
  for (let i = 0; i < n; i++) {
    s.fx.push({
      x: side < 0 ? 1 : side > 0 ? 8 : 2 + rnd(s) * 6,
      y: H - 1,
      vx: (side === 0 ? (rnd(s) < 0.5 ? -1 : 1) : side) * (0.4 + rnd(s) * 0.7),
      vy: -0.2 - rnd(s) * 0.3,
      life: 4 + Math.floor(rnd(s) * 3),
      c: C.dust,
    })
  }
}

const confetti = (s: Sim) => {
  for (let i = 0; i < 10; i++) {
    s.fx.push({
      x: 2 + rnd(s) * 6,
      y: rnd(s) * 2,
      vx: (rnd(s) - 0.5) * 1.4,
      vy: -0.6 - rnd(s) * 0.6,
      life: 12 + Math.floor(rnd(s) * 8),
      c: CONFETTI[Math.floor(rnd(s) * CONFETTI.length)],
    })
  }
}

function decide(s: Sim, maxX: number) {
  const mood = s.props.mood
  const r = rnd(s)
  const walkTo = (t: number) => {
    s.target = clamp(Math.round(t), 0, maxX)
    if (Math.abs(s.target - s.x) >= 3) {
      setMode(s, 'walk')
      puff(s, s.target < s.x ? 1 : -1, 2)
    } else s.wait = 12
  }
  if (mood === 'thinking') return walkTo(s.x + (rnd(s) < 0.5 ? -1 : 1) * (5 + rnd(s) * 14))
  if (mood === 'tool') {
    s.wait = 15
    return
  }
  if (r < 0.58) walkTo(rnd(s) * maxX)
  else if (r < 0.72) setMode(s, 'wave')
  else if (r < 0.86) setMode(s, 'crouch') // se agacha antes de saltar
  else s.wait = 25 + Math.floor(rnd(s) * 40)
}

function onMood(s: Sim, next: Mood, floor: number) {
  const free = s.mode === 'idle' || s.mode === 'walk' || s.mode === 'wave' || s.mode === 'sleep' || s.mode === 'yawn'
  if (!free) return
  if (s.mode === 'sleep' || s.mode === 'yawn') setMode(s, 'idle')
  if (next === 'ok') {
    s.vy = -1.6
    setMode(s, 'jump')
  } else if (next === 'fail') setMode(s, 'shake')
  else if (next === 'done') {
    s.vy = -2
    setMode(s, 'cheer')
    confetti(s)
  }
  s.idleTicks = 0
  s.y = Math.min(s.y, floor)
}

function step(s: Sim, cols: number) {
  s.tick += 1
  s.t += 1
  const floor = floorOf(bandRows(s))
  const maxX = Math.max(0, cols - W)
  s.x = clamp(s.x, 0, maxX)
  if (s.mode !== 'drag') s.y = Math.min(s.y, floor) // la banda puede haberse encogido

  if (s.props.mood !== s.mood) {
    s.mood = s.props.mood
    onMood(s, s.mood, floor)
  }

  // polvo y confeti
  for (const f of s.fx) {
    f.x += f.vx
    f.y += f.vy
    f.vy += 0.12
    f.life -= 1
  }
  s.fx = s.fx.filter(f => f.life > 0 && f.y < H + 1)

  s.sway *= 0.7

  if (s.blink > 0) s.blink -= 1
  else if (--s.blinkIn <= 0) {
    s.blink = 2
    s.blinkIn = 25 + Math.floor(rnd(s) * 40)
  }

  switch (s.mode) {
    case 'drag':
      s.idleTicks = 0
      break
    case 'fall':
    case 'jump':
    case 'cheer': {
      s.vy += GRAVITY
      s.x += s.vx
      s.y += s.vy
      if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * 0.5 }
      else if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx) * 0.5 }
      if (s.y < 0) { s.y = 0; s.vy = Math.max(0, s.vy) }
      if (s.y >= floor) {
        const impact = s.vy
        s.y = floor
        if (s.mode === 'cheer' && s.t < 30) {
          s.vy = -1.9
          puff(s, 0, 2)
        } else if (s.mode === 'jump' || impact < 2) {
          s.vx = 0
          puff(s, 0, 2)
          setMode(s, 'idle')
        } else if (impact > 4 && !s.bounced) {
          s.bounced = true
          s.vy = -impact * 0.3
          puff(s, 0, 4)
        } else {
          s.impact = impact
          s.vx *= 0.6
          puff(s, 0, 4 + Math.round(impact))
          setMode(s, 'land')
        }
      }
      if (s.mode === 'cheer' && s.t >= 30 && s.y >= floor) setMode(s, 'idle')
      break
    }
    case 'crouch':
      if (s.t >= 4) {
        s.vy = -2.3
        s.vx = 0
        setMode(s, 'jump')
      }
      break
    case 'land':
      s.x = clamp(s.x + s.vx, 0, maxX)
      s.vx *= 0.7
      if (s.t >= 5) setMode(s, s.impact > 5 ? 'dizzy' : 'idle')
      break
    case 'dizzy':
      if (s.t >= 24) setMode(s, 'idle')
      break
    case 'walk': {
      const speed = s.props.mood === 'thinking' ? 0.5 : 1
      const dx = s.target - s.x
      s.facing = dx < 0 ? -1 : 1
      if (Math.abs(dx) <= speed) {
        s.x = s.target
        s.wait = 20 + Math.floor(rnd(s) * 60)
        puff(s, -s.facing, 2)
        setMode(s, 'idle')
      } else {
        s.x += Math.sign(dx) * speed
        if (s.t % 6 === 0) puff(s, -s.facing, 1) // polvillo de las patas
      }
      s.idleTicks = 0
      break
    }
    case 'wave':
      if (s.t >= 16) { s.wait = 15; setMode(s, 'idle') }
      break
    case 'pet':
      if (s.t >= 24) setMode(s, 'idle')
      break
    case 'shake':
      s.x = clamp(s.x + (s.t % 2 ? 1 : -1), 0, maxX)
      if (s.t >= 12) setMode(s, 'idle')
      break
    case 'yawn':
      if (s.props.mood !== 'idle' || s.hover) setMode(s, 'idle')
      else if (s.t >= 10) setMode(s, 'sleep')
      break
    case 'sleep':
      if (s.props.mood !== 'idle' || s.hover) {
        s.idleTicks = 0
        setMode(s, 'idle')
      }
      break
    default: {
      // idle
      s.idleTicks += 1
      if (s.y < floor) { s.vy = 0; setMode(s, 'fall') }
      else if (--s.wait <= 0) decide(s, maxX)
      if (s.idleTicks > 650 && s.props.mood === 'idle') setMode(s, 'yawn')
    }
  }
}

// ── el ratón ────────────────────────────────────────────────────────────────

type PointerIn = { type: string; x: number; y: number; fine?: { x: number; y: number }; button?: string }

function pointer(s: Sim, surface: { columns: number }, e: PointerIn) {
  s.events[e.type] = (s.events[e.type] || 0) + 1
  s.lastEvent = `${e.type} x=${e.x} y=${e.y}${e.fine ? ` fine=${e.fine.x.toFixed(2)},${e.fine.y.toFixed(2)}` : ''}${e.button ? ` ${e.button}` : ''}`
  const px = e.fine ? e.fine.x : e.x + 0.5
  const py = (e.fine ? e.fine.y : e.y + 0.5) * 2
  const cols = surface.columns || 60
  const floor = floorOf(bandRows(s))

  if (e.type === 'down' && (e.button === undefined || e.button === 'left')) {
    // zona de agarre generosa: el sprite es pequeño
    const hit = px >= s.x - 2 && px <= s.x + W + 2 && py >= s.y - 2 && py <= s.y + H + 2
    if (hit) {
      s.grabDx = px - s.x
      s.grabDy = py - s.y
      s.downTick = s.tick
      s.moved = 0
      s.pressX = px
      s.pressY = py
      s.trail = [[s.tick, px, py]]
      s.vx = 0
      s.vy = 0
      setMode(s, 'drag')
    }
  } else if (e.type === 'move' && s.mode === 'drag') {
    const nx = clamp(px - s.grabDx, 0, Math.max(0, cols - W))
    s.sway = clamp(s.sway + (nx - s.x) * 0.5, -3, 3)
    s.x = nx
    s.y = clamp(py - s.grabDy, 0, floor)
    s.moved = Math.max(s.moved, Math.abs(px - s.pressX) + Math.abs(py - s.pressY))
    s.trail.push([s.tick, px, py])
    if (s.trail.length > 6) s.trail.shift()
  } else if (e.type === 'up' && s.mode === 'drag') {
    if (s.moved < 2 && s.tick - s.downTick < 14) {
      s.y = Math.min(s.y, floor)
      setMode(s, 'pet')
    } else {
      const a = s.trail[0]
      const b = s.trail[s.trail.length - 1]
      const dt = Math.max(1, b[0] - a[0])
      s.vx = clamp((b[1] - a[1]) / dt, -3.5, 3.5)
      s.vy = clamp((b[2] - a[2]) / dt, -3, 3)
      s.bounced = false
      if (s.y >= floor - 0.5 && Math.abs(s.vx) < 0.4) { s.y = floor; setMode(s, 'idle') }
      else setMode(s, 'fall')
    }
    s.idleTicks = 0
  } else if (e.type === 'move' || e.type === 'enter') {
    s.hover = true
    s.hoverX = px
  } else if (e.type === 'leave') {
    s.hover = false
  }
}

// ── el dibujo ───────────────────────────────────────────────────────────────

// Una clave de lo que se ve: si no cambia, no se repinta.
function viewKey(s: Sim, cols: number): string {
  return [
    stage(s).map(r => r.map(c => (c ? c.charAt(1) + c.charAt(3) : '.')).join('')).join('/'),
    Math.round(s.x), Math.round(s.y), bandRows(s), cols, s.props.label, s.mode === 'drag' ? 'd' : '',
  ].join('|')
}

const Clawd: ClientModule<Props, Sim> = (props, surface) => {
  const { Box, Text } = surface.elements
  const cols = surface.columns || 60

  let s = surface.state
  if (s === undefined) {
    const rows0 = Math.max(4, Math.round(props.rows || DEFAULT_ROWS))
    s = {
      x: Math.floor(Math.max(0, cols - W) / 2), y: floorOf(rows0), vx: 0, vy: 0, mode: 'idle', t: 0, tick: 0, facing: 1,
      target: 0, wait: 20, idleTicks: 0, blink: 0, blinkIn: 30, seed: 20241023, mood: props.mood, props,
      hover: false, hoverX: 0, grabDx: 0, grabDy: 0, downTick: 0, moved: 0, pressX: 0, pressY: 0, trail: [],
      impact: 0, bounced: false, sway: 0, fx: [], events: {}, lastEvent: '', lastKey: '',
    }
    surface.setState(s)
    const sim = s
    surface.every(TICK_MS, () => {
      step(sim, surface.columns || 60)
      const key = viewKey(sim, surface.columns || 60)
      if (key !== sim.lastKey) {
        sim.lastKey = key
        surface.setState(sim)
      }
    })
    surface.onPointer(e => {
      pointer(sim, surface, e)
      surface.setState(sim)
    })
  }
  s.props = props

  // escenario → filas de texto, una por cada fila de la banda (la altura la dan estas filas)
  const rows = bandRows(s)
  const y = Math.round(clamp(s.y, 0, floorOf(rows)))
  const topCell = Math.floor(y / 2)
  const parity = y - topCell * 2
  const g = stage(s)
  const nRows = Math.ceil((H + parity) / 2)
  const left0 = Math.round(s.x) - PAD
  const c0 = Math.max(0, -left0)
  const c1 = Math.min(SW, cols - left0)
  const offset = left0 + c0
  const labelRow = Math.min(rows - 1, topCell + 1)
  const showLabel = props.label !== '' && props.mood !== 'idle' && props.mood !== 'thinking' && s.mode !== 'drag'
  const labelText = props.label

  const out = []
  for (let r = 0; r < rows; r++) {
    const sr = r - topCell
    if (sr < 0 || sr >= nRows) {
      out.push(
        <Box key={String(r)}>
          <Text mono>{NBSP}</Text>
        </Box>,
      )
      continue
    }
    const runs: { ch: string; fg?: string; bg?: string; n: number }[] = []
    for (let c = c0; c < c1; c++) {
      const topPx = g[2 * sr - parity]?.[c] ?? null
      const botPx = g[2 * sr + 1 - parity]?.[c] ?? null
      let ch = NBSP
      let fg: string | undefined
      let bg: string | undefined
      if (topPx && botPx && topPx === botPx) { ch = '█'; fg = topPx }
      else if (topPx && botPx) { ch = '▀'; fg = topPx; bg = botPx }
      else if (topPx) { ch = '▀'; fg = topPx }
      else if (botPx) { ch = '▄'; fg = botPx }
      const last = runs[runs.length - 1]
      if (last && last.ch === ch && last.fg === fg && last.bg === bg) last.n += 1
      else runs.push({ ch, fg, bg, n: 1 })
    }
    const width = c1 - c0
    const putLabel = showLabel && r === labelRow
    const room = cols - (offset + width) - 1
    out.push(
      <Box key={String(r)}>
        {offset > 0 ? <Text mono>{NBSP.repeat(offset)}</Text> : null}
        {runs.map((q, i) => (
          <Text key={String(i)} mono color={skin(q.fg, props.slot ?? 0)} backgroundColor={skin(q.bg, props.slot ?? 0)}>
            {q.ch.repeat(q.n)}
          </Text>
        ))}
        {putLabel && room >= labelText.length ? (
          <Text mono dimColor>{NBSP + labelText}</Text>
        ) : null}
      </Box>,
    )
  }

  return <Box flexDirection="column">{out}</Box>
}

export default Clawd
