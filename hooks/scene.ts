// Clawd en SVG: escenas animadas (SMIL) y la lógica para elegir y mover escenas.
//
// Una "escena" es una acción con principio y fin (andar de A a B, saltar, caer, leer un libro...).
// El SVG de una escena se anima solo en la app (60 fps, sin costuras); solo se reemplaza cuando
// cambia la acción o mientras se arrastra. Todas las posiciones están en píxeles del lienzo
// (esquina superior izquierda del sprite).

import type { Kind, Mood, Scene } from '../types'
import { t } from './i18n'
import { isStory, storyBody, storyMs, PLANE_AHEAD_U, PLANE_BEHIND_U, type StoryKind } from './stories'

export const HC = 108 // alto del lienzo, px (banda más baja: Clawd vive pegado a la barra de escribir)
export const U = 4.025 // px por píxel del sprite
const GW = 14 // sprite: 14 x 11 píxeles
const GH = 11
export const SPW = GW * U // ~56
export const SPH = GH * U // ~44
export const FLOOR = HC - SPH - 3
const GRAVITY = 1900 // px/s²

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
  label: '#9a9aa6',
  page: '#f4ead2',
  pageDim: '#cdbd98',
  cover: '#6b4a35',
  metal: '#c3c7d3',
  screen: '#262a36',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const f1 = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '0') // nunca "NaN" en un dibujo

// ── movimiento ──────────────────────────────────────────────────────────────

export function posAt(sc: Scene, now: number): { x: number; y: number } {
  const n = sc.path.length / 2
  if (sc.dur <= 0 || n < 2) return { x: sc.path[0], y: sc.path[1] }
  const f = clamp((now - sc.m0) / sc.dur, 0, 1)
  let i = 0
  let k = 0
  if (sc.times.length === n) {
    while (i < n - 2 && f > sc.times[i + 1]) i += 1
    const span = sc.times[i + 1] - sc.times[i]
    k = span > 0 ? clamp((f - sc.times[i]) / span, 0, 1) : 1
  } else {
    const g = f * (n - 1)
    i = Math.min(n - 2, Math.floor(g))
    k = g - i
  }
  return {
    x: sc.path[i * 2] + (sc.path[i * 2 + 2] - sc.path[i * 2]) * k,
    y: sc.path[i * 2 + 1] + (sc.path[i * 2 + 3] - sc.path[i * 2 + 1]) * k,
  }
}

/** ¿Algún punto del recorrido queda más allá del límite derecho? (la banda se ha estrechado: habría que recolocarlo) */
export function exceeds(sc: Scene, maxX: number): boolean {
  for (let i = 0; i < sc.path.length; i += 2) if (sc.path[i] > maxX + 1) return true
  return false
}

export const endOf = (sc: Scene) => ({ x: sc.path[sc.path.length - 2], y: sc.path[sc.path.length - 1] })

const base = (kind: Kind, t0: number, face: number, seed: number): Scene => ({
  kind, t0, face, faceFrom: face, path: [0, FLOOR], times: [], ease: false, dur: 0, seed, hard: 0,
  gaze: [], gazeFrom: [], g0: t0, m0: t0, tilt: 0, spark: 0,
})

/**
 * La banda puede mostrarse más baja que el lienzo (minimizada): entonces se ve la parte de abajo, a escala 1, sin
 * cambiar el SVG. Así, al encoger o crecer solo cambia la altura y la app no recarga el dibujo.
 */
const CROP = 'preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges"'

/** Segundos desde el principio de la escena: todos los `begin` del SVG se escriben así. */
const rel = (sc: Scene, t: number) => `begin="${f1((t - sc.t0) / 1000)}s"`

/**
 * Las animaciones siguen donde iban aunque el SVG se vuelva a dibujar (mirada, arrastre, un redibujado
 * cualquiera): cada `begin` se adelanta lo que ya ha pasado desde el principio de la escena.
 */
export function phase(svg: string, elapsedS: number): string {
  if (!(elapsedS > 0.005)) return svg
  return svg.replace(/<(animate|animateTransform)\b([^>]*?)\/>/g, (_m, tag: string, attrs: string) => {
    const b = /\sbegin="(-?[\d.]+)s"/.exec(attrs)
    const at = (b ? Number(b[1]) : 0) - elapsedS
    const rest = b ? attrs.replace(b[0], '') : attrs
    return `<${tag}${rest} begin="${f1(at)}s"/>`
  })
}

export function still(kind: Kind, x: number, y: number, now: number, face: number, seed: number): Scene {
  return { ...base(kind, now, face, seed), path: [x, y] }
}

/** Anda de x0 a x1: acelera al salir y frena al llegar (el tramo central es a velocidad constante). */
export function walk(x0: number, x1: number, y: number, now: number, seed: number, speed = 39): Scene {
  const dx = x1 - x0
  const slow = dx * 0.06
  return {
    ...base('walk', now, dx < 0 ? -1 : 1, seed),
    path: [x0, y, x0 + slow, y, x1 - slow, y, x1, y],
    times: [0, 0.12, 0.88, 1],
    dur: (Math.abs(dx) / speed) * 1000 + 250,
  }
}

export function jump(x: number, y: number, now: number, face: number, seed: number, height = 30): Scene {
  const path: number[] = []
  for (let i = 0; i < 3; i++) path.push(x, y) // se agacha
  for (let i = 1; i <= 10; i++) {
    const f = i / 10
    path.push(x, y - height * 4 * f * (1 - f))
  }
  return { ...base('jump', now, face, seed), path, dur: 1150 }
}

/**
 * Colgando de la mano: sigue al ratón con un pequeño retardo y se inclina según la velocidad.
 * `t0` es cuándo lo agarraste (las animaciones de colgar siguen sin cortes); `now`, este movimiento.
 */
export function drag(from: { x: number; y: number }, x: number, y: number, now: number, face: number, seed: number, tilt = 0, t0 = now, dur = 110): Scene {
  return { ...base('drag', t0, face, seed), path: [from.x, from.y, x, y], ease: true, dur, tilt, m0: now }
}

/** Caída con gravedad desde (x, y) con velocidad (vx, vy) px/s; una vez rebota si el golpe es fuerte. */
export function fall(x: number, y: number, vx: number, vy: number, now: number, wc: number, face: number, seed: number): Scene {
  const maxX = Math.max(0, wc - SPW)
  const path: number[] = [x, y]
  let px = x
  let py = y
  let pvx = vx
  let pvy = vy
  let t = 0
  let bounced = false
  let hard = 0
  const dt = 1 / 30
  for (let i = 0; i < 90; i++) {
    pvy += GRAVITY * dt
    px += pvx * dt
    py += pvy * dt
    t += dt
    // contra las paredes rebota; un golpe fuerte también cuenta para marearse
    if (px < 0) { hard = Math.max(hard, Math.abs(pvx)); px = 0; pvx = Math.abs(pvx) * 0.5 }
    else if (px > maxX) { hard = Math.max(hard, Math.abs(pvx)); px = maxX; pvx = -Math.abs(pvx) * 0.5 }
    if (py < 0) { py = 0; pvy = Math.max(0, pvy) }
    if (py >= FLOOR) {
      py = FLOOR
      hard = Math.max(hard, pvy)
      if (pvy > 520 && !bounced) {
        bounced = true
        pvy = -pvy * 0.3
        pvx *= 0.7
        path.push(px, py)
        continue
      }
      path.push(px, py)
      break
    }
    path.push(px, py)
  }
  return { ...base('fall', now, pvx < -30 ? -1 : pvx > 30 ? 1 : face, seed), path, dur: Math.max(120, t * 1000), hard }
}

// ── el sprite ───────────────────────────────────────────────────────────────

const rect = (x: number, y: number, w: number, h: number, fill: string, inner = '', extra = '') =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${extra}>${inner}</rect>`

const loop = 'repeatCount="indefinite"'
const anim = (attr: string, values: string, dur: string, extra = '') =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}" ${extra} ${loop}/>`
const slide = (values: string, dur: string, extra = '') =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" ${extra} ${loop}/>`

// línea de tiempo de 12 s de la escena de "observar lo que escribes":
// mira → saca la lupa → la guarda y mira a otro lado → vuelve a mirar
const TD = '12s'
const KT = 'keyTimes="0;0.22;0.3;0.62;0.7;0.8;0.86;1"'
const timeline = (attr: string, values: string) => anim(attr, values, TD, KT)
const timelineSlide = (values: string) => slide(values, TD, KT)
const KTREAD = 'keyTimes="0;0.7;0.78;0.86;1"'

// Luciérnaga: revolotea delante de Clawd, que la sigue con los ojos y al final salta a por ella.
const FLY_KT = '0;0.14;0.28;0.42;0.56;0.7;0.8;0.88;1'
const FLY = [[22, -7], [15, -2], [8, -6], [2, -1], [6, -8], [12, -3], [10, -4], [9, -6], [26, -16]]
const FLY_DUR = '5.2s'
const flyEyes = () =>
  FLY.map(([x, y]) => `${f1(clamp((x - 7) / 8, -1, 1) * 0.9)} ${f1(clamp((y - 5) / 7, -1, 1) * 0.75)}`).join(';')

/** Con el portátil: usando herramientas (como siempre) y, ahora, también pensando. */
const onLaptop = (kind: Kind, mood: Mood) => kind === 'laptop' || (kind === 'idle' && mood === 'tool')

// Escenas en las que los ojos siguen algo (el ratón, el texto que escribes)
const GAZE_KINDS = new Set<Kind>(['idle', 'sit', 'look', 'wave', 'type', 'firefly'])

/** Desplazamiento de los ojos (en píxeles del sprite) para una mirada, ya en el sentido de la cara. */
const gazeOff = (g: number[], face: number) =>
  g.length === 2 ? `${f1(g[0] * face * 0.9)} ${f1(g[1] * 0.75)}` : '0 0'

/** Los ojos: lo de cada escena, deslizándose con suavidad hacia donde mira. */
function eyes(sc: Scene, mood: Mood): string {
  const inner = eyesOf(sc, mood)
  if (!GAZE_KINDS.has(sc.kind)) return inner
  const to = gazeOff(sc.gaze, sc.face)
  const from = gazeOff(sc.gazeFrom, sc.face)
  if (to === '0 0' && from === '0 0') return inner
  const glide =
    from === to
      ? ''
      : `<animateTransform attributeName="transform" type="translate" values="${from};${to}" dur="0.32s" ` +
        `calcMode="spline" keyTimes="0;1" keySplines=".25 .1 .25 1" ${rel(sc, sc.g0)} fill="freeze"/>`
  return `<g transform="translate(${to})">${glide}${inner}</g>`
}

function eyesOf(sc: Scene, mood: Mood): string {
  const kind = sc.kind
  const happy = kind === 'pet' || kind === 'cheer' || kind === 'send' || (kind === 'idle' && (mood === 'ok' || mood === 'done'))
  if (happy) {
    const arc = (x: number) => rect(x, 5.5, 1, 1, C.dark) + rect(x + 1, 4.5, 1, 1, C.dark) + rect(x + 2, 5.5, 1, 1, C.dark)
    return arc(3) + arc(8)
  }
  if (kind === 'sleep' || kind === 'yawn' || kind === 'stretch') return rect(3.5, 5.5, 2, 0.8, C.dark) + rect(8.5, 5.5, 2, 0.8, C.dark)
  if (kind === 'drag' || kind === 'fall' || kind === 'shake' || (kind === 'idle' && mood === 'fail')) {
    const e = (x: number) => rect(x, 4, 2, 3.4, C.dark, anim('height', '3.4;3.9;3.4', '0.3s'))
    return e(3.5) + e(8.5)
  }
  if (kind === 'dizzy') {
    const x = (cx: number) => rect(cx - 1, 4.5, 1, 1, C.dark) + rect(cx + 1, 4.5, 1, 1, C.dark) + rect(cx, 5.5, 1, 1, C.dark) + rect(cx - 1, 6.5, 1, 1, C.dark) + rect(cx + 1, 6.5, 1, 1, C.dark)
    return x(4.5) + x(9.5)
  }
  if (kind === 'land') return rect(3.5, 5.7, 2, 0.8, C.dark) + rect(8.5, 5.7, 2, 0.8, C.dark)
  if (kind === 'firefly') {
    const e = (x: number) => rect(x, 4, 1, 3, C.dark)
    return `<g>${e(4)}${e(9)}${slide(flyEyes(), FLY_DUR, `keyTimes="${FLY_KT}" calcMode="spline" keySplines="${'.4 0 .6 1;'.repeat(7)}.4 0 .6 1" fill="freeze"`).replace(loop, '')}</g>`
  }
  if (kind === 'sneeze') {
    // aguanta... (ojos que se cierran) ¡achís! y vuelta
    const e = (x: number) => rect(x, 4, 1, 3, C.dark, anim('height', '3;3;0.6;0.6;3;3', '1.6s', 'keyTimes="0;0.25;0.35;0.7;0.85;1" fill="freeze"').replace(loop, '') + anim('y', '4;4;5.2;5.2;4;4', '1.6s', 'keyTimes="0;0.25;0.35;0.7;0.85;1" fill="freeze"').replace(loop, ''))
    return e(4) + e(9)
  }
  if (kind === 'type') {
    const e = (x: number) => rect(x, 5.3, 1, 2.6, C.dark, anim('height', '2.6;2.9;2.6', '1.4s') + anim('y', '5.3;5.4;5.3', '1.4s'))
    return `<g>${e(4)}${e(9)}${timelineSlide('0 0;0 0;0.4 0.2;0.4 0.2;-0.6 -1.4;-0.6 -1.4;0 0;0 0')}</g>`
  }
  if (kind === 'read') {
    // lee: ojos bajos que recorren las líneas de un lado a otro
    const e = (x: number) => rect(x, 5.5, 1, 2.2, C.dark, anim('height', '2.2;0.5;2.2', '3.5s', 'keyTimes="0;0.5;1"'))
    return `<g>${e(4)}${e(9)}${slide('-0.6 0.3;0.6 0.3;-0.6 0.3;0.6 0.3;-0.6 0.3', '3.2s', 'calcMode="discrete"')}</g>`
  }
  const blink = (x: number) =>
    rect(x, 4, 1, 3, C.dark, anim('height', '3;3;0.4;3', '4s', 'keyTimes="0;0.92;0.96;1"') + anim('y', '4;4;5.3;4', '4s', 'keyTimes="0;0.92;0.96;1"'))
  if (onLaptop(kind, mood)) {
    // mira la pantalla del portátil
    return `<g>${rect(4, 4.8, 1, 2.6, C.dark)}${rect(9, 4.8, 1, 2.6, C.dark)}${slide('0 0;0.3 0;0 0;-0.3 0;0 0', '1.6s')}</g>`
  }
  if (kind === 'walk') return blink(4) + blink(9)
  // te sigue con la mirada: ojos quietos (sin el vistazo automático), los mueve `eyes` con suavidad
  if (sc.gaze.length === 2 && (kind === 'idle' || kind === 'sit' || kind === 'wave')) return blink(4) + blink(9)
  if (kind === 'look' && sc.gaze.length !== 2) {
    // mira hacia arriba, a la conversación, y de vez en cuando a ti
    return `<g>${blink(4)}${blink(9)}${slide('0.5 -1.2;0.5 -1.2;0 0;0.5 -1.2', '5s', 'keyTimes="0;0.7;0.8;1" calcMode="discrete"')}</g>`
  }
  if (kind === 'idle' && mood === 'thinking') {
    return `<g>${blink(4)}${blink(9)}${slide('-0.7 -0.4;0 -0.6;0.7 -0.4;0 -0.2', '2.8s', 'calcMode="discrete"')}</g>`
  }
  // reposo: parpadea y mira alrededor
  return `<g>${blink(4)}${blink(9)}${slide('0 0;0 0;-0.7 0;-0.7 0;0 0;0.7 0;0.7 0;0 0', '9s', 'calcMode="discrete"')}</g>`
}

function arms(sc: Scene, mood: Mood): string {
  const kind = sc.kind
  const L = (y: number, h: number, inner = '') => rect(0, y, 2, h, C.body, inner)
  const R = (y: number, h: number, inner = '') => rect(12, y, 2, h, C.body, inner)
  switch (kind) {
    case 'drag':
    case 'fall':
      return L(1.5, 3.5, anim('y', '1.5;2.6;1.5', '0.35s')) + R(2.6, 3.5, anim('y', '2.6;1.5;2.6', '0.35s'))
    case 'jump':
    case 'cheer':
    case 'pet':
    case 'yawn':
      return L(1.5, 3.5) + R(1.5, 3.5)
    case 'wave':
      return L(5, 2) + R(1.5, 3.5, anim('y', '1.5;0.4;1.5', '0.35s'))
    case 'walk':
      return L(5, 2, anim('y', '5;4;5;6;5', '0.72s')) + R(5, 2, anim('y', '5;6;5;4;5', '0.72s'))
    case 'send':
      return L(1.5, 3.5) + R(1.5, 3.5, anim('y', '1.5;0.6;1.5', '0.3s'))
    case 'stretch':
      // brazos arriba, estirándose, y vuelta abajo
      return L(5, 2, anim('y', '5;0.6;0.6;5', '1.6s', 'keyTimes="0;0.3;0.75;1" fill="freeze"')) +
        R(5, 2, anim('y', '5;0.6;0.6;5', '1.6s', 'keyTimes="0;0.3;0.75;1" fill="freeze"'))
    case 'look':
      return L(5, 2, anim('y', '5;5.4;5', '2.4s')) + R(3.2, 2) // la mano de visera
    case 'sit':
      return L(6.6, 2) + R(6.6, 2)
    case 'firefly':
      return L(5, 2, anim('y', '5;5;1.5;1.5;5', FLY_DUR, 'keyTimes="0;0.76;0.8;0.9;1" fill="freeze"').replace(loop, '')) +
        R(5, 2, anim('y', '5;5;1.5;1.5;5', FLY_DUR, 'keyTimes="0;0.76;0.8;0.9;1" fill="freeze"').replace(loop, ''))
    case 'sneeze':
      return L(5, 2) + R(5, 2, anim('y', '5;5;3.6;3.6;5;5', '1.6s', 'keyTimes="0;0.2;0.3;0.7;0.9;1" fill="freeze"').replace(loop, ''))
    case 'sleep':
    case 'land':
      return L(7, 2) + R(7, 2)
    case 'type':
      // la mano izquierda en la barbilla; la derecha sube a sostener la lupa
      return L(5.2, 2) + R(6, 2, timeline('y', '6;6;4.2;4.2;6;6;5.2;5.2'))
    case 'read':
      return L(6, 2.6) + R(6, 2.6) // las manos se dibujan encima del libro
    default:
  }
  if (mood === 'tool' || kind === 'laptop') return L(7.4, 1.8, anim('y', '7.4;7;7.4', '0.3s')) + R(7.4, 1.8, anim('y', '7;7.4;7', '0.3s'))
  if (mood === 'ok' || mood === 'done') return L(1.5, 3.5) + R(1.5, 3.5)
  if (mood === 'fail') return L(6, 2) + R(6, 2)
  return L(5, 2, anim('y', '5;5.4;5', '2.4s')) + R(5, 2, anim('y', '5;5.4;5', '2.4s'))
}

function legs(kind: Kind): string {
  const xs = [3, 5, 8, 10]
  const fast = kind === 'walk' ? '0.36s' : kind === 'drag' || kind === 'shake' ? '0.2s' : '1.3s'
  return xs
    .map((x, i) => {
      if (kind === 'jump' || kind === 'fall' || kind === 'cheer' || kind === 'send') return rect(x, 9, 1, 1, C.shade)
      // sentado en el borde de la barra: las patitas cuelgan y se balancean
      if (kind === 'sit') return rect(x, 9, 1, 2, C.shade, anim('height', i % 2 ? '2;1.4;2' : '1.4;2;1.4', '1.1s'))
      // colgando: patalea despacio, las patas estiradas
      if (kind === 'drag') return rect(x, 9, 1, 2.4, C.shade, anim('height', i % 2 ? '2.4;1.6;2.4' : '1.6;2.4;1.6', '0.42s'))
      if (kind === 'land') return rect(x, 10, 1, 1, C.shade)
      if (kind === 'sleep') return rect(x, 9, 1, 2, C.shade)
      return rect(x, 9, 1, 2, C.shade, anim('height', i % 2 ? '2;1.3;2' : '1.3;2;1.3', fast))
    })
    .join('')
}

/** Objetos que sostiene: libro (pensando), lupa (observando), portátil (herramientas). */
function props(sc: Scene, mood: Mood): string {
  if (sc.kind === 'read') {
    // la hoja que pasa: se encoge hasta cero y reaparece del otro lado
    const flip =
      `<g><rect x="0" y="6.8" width="3.4" height="2.4" fill="#fbf4e1">` +
      `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;0 1;-1 1;-1 1" ${KTREAD} dur="5s" ${loop}/>` +
      `<animate attributeName="opacity" values="1;1;1;1;0" ${KTREAD} dur="5s" ${loop}/></rect>` +
      `<animateTransform attributeName="transform" type="translate" values="7.05 0" dur="5s" ${loop}/></g>`
    return (
      rect(3, 6.5, 8, 3, C.cover) +
      rect(3.5, 6.8, 3.4, 2.4, C.page) + rect(7.2, 6.8, 3.4, 2.4, C.page) + rect(6.9, 6.8, 0.3, 2.4, C.pageDim) +
      rect(3.9, 7.4, 2.6, 0.4, C.pageDim) + rect(3.9, 8.2, 2.1, 0.4, C.pageDim) +
      rect(7.6, 7.4, 2.6, 0.4, C.pageDim) + rect(7.6, 8.2, 1.8, 0.4, C.pageDim) +
      flip +
      rect(2.2, 7.7, 1.2, 1.2, C.body) + rect(10.6, 7.7, 1.2, 1.2, C.body) // manos sujetando
    )
  }
  if (sc.kind === 'type') {
    const ring = [[11, 5], [12, 5], [13, 5], [10, 6], [14, 6], [10, 7], [14, 7], [10, 8], [14, 8], [11, 9], [12, 9], [13, 9]]
      .map(([x, y]) => rect(x, y, 1, 1, C.metal))
      .join('')
    return (
      `<g opacity="0">${timeline('opacity', '0;0;1;1;0;0;0;0')}${timelineSlide('7 0;7 0;0 0;0 0;7 0;7 0;7 0;7 0')}` +
      `<g>${rect(11, 6, 3, 3, C.blue, '', ' fill-opacity="0.28"')}${rect(11, 6, 1, 1, C.white, '', ' fill-opacity="0.8"')}${ring}` +
      `${rect(14, 9, 1, 1, '#b88a5a')}${rect(15, 10, 1, 1, '#b88a5a')}${slide('0 0;-2.6 0;0 0', '1.7s')}</g></g>`
    )
  }
  if (onLaptop(sc.kind, mood)) {
    const line = (y: number, w: number, b: string) => rect(4.1, y, w, 0.5, C.green, anim('opacity', '0.25;1;0.25', '0.9s', `begin="${b}"`))
    return (
      rect(3.6, 6.2, 6.8, 3.1, C.screen) + rect(3.6, 6.2, 6.8, 0.4, C.metal) +
      line(7, 3.4, '0s') + line(7.8, 4.6, '0.3s') + line(8.6, 2.4, '0.6s') +
      rect(2.6, 9.4, 8.8, 0.9, C.metal)
    )
  }
  return ''
}

/**
 * Estrellitas: una herramienta ha terminado mientras trabaja con el portátil. Tres pequeñas estrellas de píxel
 * (una cruz de 3 x 3) justo donde van las chispitas azules, que aparecen, brillan un instante y se van. Rápidas
 * (0,7 s), escalonadas, sin más adorno.
 */
function starBurst(sc: Scene): string {
  const star = (x: number, y: number, delay: number) => {
    const at = rel(sc, sc.spark + delay * 1000)
    const cell = (dx: number, dy: number) => `<rect x="${dx}" y="${dy}" width="1" height="1" fill="#fff3c0"/>`
    return (
      `<g transform="translate(${f1(x)} ${f1(y)})" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.18;0.62;1" dur="0.7s" ${at} />` +
      `<g>${cell(0, 0)}${cell(-1, 0)}${cell(1, 0)}${cell(0, -1)}${cell(0, 1)}` +
      `<animateTransform attributeName="transform" type="scale" values="0.3;1.25;1;0.5" keyTimes="0;0.25;0.6;1" dur="0.7s" ${at} /></g></g>`
    )
  }
  return star(0.8, 2.5, 0) + star(13.2, 1.5, 0.12) + star(0.3, 5, 0.24)
}

function extras(sc: Scene, mood: Mood, stars = false): string {
  const kind = sc.kind
  const blinkOp = (begin: string, dur = '1.4s') => anim('opacity', '0;1;1;0', dur, `begin="${begin}"`)
  const dots = () => rect(5.5, 1.2, 1, 1, C.white, blinkOp('0s')) + rect(7, 1.2, 1, 1, C.white, blinkOp('0.3s')) + rect(8.5, 1.2, 1, 1, C.white, blinkOp('0.6s'))
  if (kind === 'read') return dots()
  // el portátil siempre con sus chispitas azules; pensando, además, los tres puntitos blancos
  const sparks = () => {
    const sp = (x: number, y: number, b: string) => rect(x, y, 1, 1, C.blue, anim('opacity', '0;1;0', '0.7s', `begin="${b}"`))
    return sp(0.3, 2, '0s') + sp(12.8, 1, '0.25s') + sp(-0.2, 4.5, '0.5s')
  }
  if ((kind === 'idle' || kind === 'walk' || kind === 'laptop') && (mood === 'thinking' || mood === 'web')) return dots() + (kind === 'laptop' ? sparks() + (stars ? starBurst(sc) : '') : '')
  if (onLaptop(kind, mood)) return sparks() + (stars ? starBurst(sc) : '')
  if (kind === 'idle' && mood === 'ok') return [[8, 2], [9, 3], [10, 2], [11, 1]].map(([x, y]) => rect(x, y - 1.5, 1, 1, C.green)).join('')
  if (kind === 'shake' || (kind === 'idle' && mood === 'fail')) {
    const drop = rect(11.3, 2.6, 0.9, 1.2, C.blue, anim('y', '2.6;5.4', '0.9s') + anim('opacity', '1;0', '0.9s'))
    return rect(6.5, 0, 1, 2.2, C.red) + rect(6.5, 2.8, 1, 0.9, C.red) + drop
  }
  if (kind === 'cheer' || (kind === 'idle' && mood === 'done')) {
    const plus = (x: number, y: number, b: string) => {
      const a = anim('opacity', '0;1;0', '1s', `begin="${b}"`)
      return rect(x, y - 1, 1, 3, C.white, a) + rect(x - 1, y, 3, 1, C.white, a)
    }
    const confetti = [C.yellow, C.pink, C.blue, C.green, C.white, C.pink, C.yellow, C.blue]
      .map((c, i) => {
        const x = 1.5 + i * 1.5
        const b = `${(i % 4) * 0.15}s`
        return (
          `<rect x="${x}" y="1" width="0.9" height="0.9" fill="${c}" opacity="0">` +
          `<animate attributeName="y" values="1;11" dur="1.3s" begin="${b}" ${loop}/>` +
          `<animate attributeName="x" values="${x};${x + (i % 2 ? 1.6 : -1.6)}" dur="1.3s" begin="${b}" ${loop}/>` +
          `<animate attributeName="opacity" values="0;1;1;0" dur="1.3s" begin="${b}" ${loop}/></rect>`
        )
      })
      .join('')
    return plus(1.5, 2, '0s') + plus(12.5, 1.5, '0.3s') + plus(7, 0.5, '0.6s') + confetti
  }
  if (kind === 'pet') {
    // corazones de 5 x 4 píxeles que suben y se desvanecen
    const heart = (x: number, b: string) =>
      `<g>${rect(x, 0, 2, 1, C.pink)}${rect(x + 3, 0, 2, 1, C.pink)}${rect(x, 1, 5, 1, C.pink)}${rect(x + 1, 2, 3, 1, C.pink)}${rect(x + 2, 3, 1, 1, C.pink)}` +
      `${slide('0 0;0 -2.5', '1.3s', `begin="${b}"`)}${anim('opacity', '0;1;1;0', '1.3s', `begin="${b}"`)}</g>`
    return heart(1.5, '0s') + heart(7.5, '0.45s')
  }
  if (kind === 'sleep') {
    const z = (x: number, b: string) =>
      `<g><rect x="${x}" y="1" width="2" height="0.7" fill="${C.blue}"/><rect x="${x + 1.2}" y="1.7" width="0.8" height="0.8" fill="${C.blue}"/><rect x="${x}" y="2.5" width="2" height="0.7" fill="${C.blue}"/>` +
      `${slide('0 0;1.5 -3', '2.6s', `begin="${b}"`)}${anim('opacity', '0;1;1;0', '2.6s', `begin="${b}"`)}</g>`
    return z(9, '0s') + z(10.5, '1.3s')
  }
  if (kind === 'yawn') return rect(6.5, 1.5, 1, 1, C.blue, anim('opacity', '0;1;0', '0.9s'))
  if (kind === 'firefly') {
    const path = FLY.map(([x, y]) => `${x} ${y}`).join(';')
    return (
      `<g>${rect(-0.5, -0.5, 2, 2, C.yellow, anim('opacity', '0.15;0.4;0.15', '0.6s'), ' fill-opacity="0.5"')}${rect(0, 0, 1, 1, '#fff6c8')}` +
      `<animateTransform attributeName="transform" type="translate" values="${path}" dur="${FLY_DUR}" keyTimes="${FLY_KT}" ` +
      `calcMode="spline" keySplines="${'.4 0 .6 1;'.repeat(7)}.4 0 .6 1" fill="freeze"/>` +
      `<animate attributeName="opacity" values="1;1;0" dur="${FLY_DUR}" keyTimes="0;0.9;1" fill="freeze"/></g>`
    )
  }
  if (kind === 'sneeze') {
    const puff = (dx: number, dy: number, i: number) =>
      `<rect x="12.5" y="${f1(6 + i * 0.4)}" width="1" height="1" fill="${C.dust}" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.9;0;0" dur="1.6s" keyTimes="0;0.36;0.42;0.85;1" fill="freeze"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${dx} ${dy};${dx} ${dy}" dur="1.6s" keyTimes="0;0.38;0.85;1" fill="freeze"/></rect>`
    return puff(4, -1.5, 0) + puff(5.5, 0, 1) + puff(3.5, 1.5, 2)
  }
  if (kind === 'send') {
    // el mensaje sale volando hacia arriba
    return `<g>${rect(9, 1, 3, 2, C.white)}${rect(9, 1, 3, 0.5, C.pageDim)}` +
      `<animateTransform attributeName="transform" type="translate" values="0 2;1.5 -5" dur="0.7s" fill="freeze"/>` +
      `<animate attributeName="opacity" values="1;1;0" dur="0.7s" fill="freeze"/></g>`
  }
  if (kind === 'dizzy') {
    const star = (b: string) =>
      rect(6.5, 0.5, 1, 1, C.yellow, `<animateTransform attributeName="transform" type="rotate" values="0 7 2;360 7 2" dur="0.8s" begin="${b}" ${loop}/>`)
    return star('0s') + star('0.4s')
  }
  if (kind === 'type') {
    return `<text x="11" y="2.4" font-size="3.4" font-family="system-ui,sans-serif" font-weight="700" fill="${C.white}" opacity="0.9">?${timeline('opacity', '0.9;0.9;0;0;0;0;0.9;0.9')}</text>`
  }
  return ''
}

/** Fases del cuerpo: aplastarse, inclinarse, respirar, y un "pop" suave al empezar cada acción. */
function bodyAnims(scene: Scene): { scale: string; rotate: string; bob: string } {
  const kind = scene.kind
  const sc = (values: string, dur: string, extra = '') =>
    `<animateTransform attributeName="transform" type="scale" values="${values}" dur="${dur}" ${extra}/>`
  const rot = (values: string, dur: string, extra = loop) =>
    `<animateTransform attributeName="transform" type="rotate" values="${values}" dur="${dur}" ${extra}/>`
  const pop = sc('1.07 0.93;0.98 1.03;1 1', '0.28s', 'fill="freeze"') // transición de entrada
  switch (kind) {
    case 'drag': {
      // cuelga de la mano: la inclinación sigue a la velocidad y vuelve con un muelle amortiguado
      const t = clamp(scene.tilt, -28, 28)
      return {
        scale: sc('0.96 1.06', '0.18s', 'fill="freeze"'),
        rotate: rot(`${f1(t)};${f1(-t * 0.45)};${f1(t * 0.18)};${f1(-t * 0.06)};0`, '0.9s', 'calcMode="spline" keyTimes="0;0.3;0.55;0.8;1" keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1" fill="freeze" ' + rel(scene, scene.m0)),
        bob: '',
      }
    }
    case 'sit':
      return { scale: sc('1 1;1.05 0.9', '0.3s', 'fill="freeze"'), rotate: '', bob: slide('0 0;0 0.25;0 0', '3.6s') }
    case 'firefly':
      return {
        scale: sc('1 1;1 1;1.1 0.88;0.92 1.1;1 1;1.08 0.9;1 1', FLY_DUR, 'keyTimes="0;0.72;0.76;0.8;0.88;0.93;1" fill="freeze"'),
        rotate: rot('0;0;-4;-4;3;3;0', FLY_DUR, 'keyTimes="0;0.14;0.28;0.42;0.56;0.7;1" fill="freeze"'),
        bob: `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -5;0 0;0 0" dur="${FLY_DUR}" keyTimes="0;0.77;0.83;0.92;1" fill="freeze"/>`,
      }
    case 'sneeze':
      return {
        scale: sc('1 1;0.95 1.08;0.95 1.08;1.12 0.86;1 1;1 1', '1.6s', 'keyTimes="0;0.2;0.36;0.42;0.7;1" fill="freeze"'),
        rotate: rot('0;-6;-6;8;0;0', '1.6s', 'keyTimes="0;0.2;0.36;0.42;0.75;1" fill="freeze"'),
        bob: '',
      }
    case 'stretch':
      return { scale: sc('1 1;0.94 1.1;0.94 1.1;1 1', '1.6s', 'keyTimes="0;0.3;0.75;1" fill="freeze"'), rotate: '', bob: '' }
    case 'look':
      return { scale: pop, rotate: rot('0;-3;-3;0', '5s', 'keyTimes="0;0.15;0.7;1" ' + loop), bob: '' }
    case 'send':
      return {
        scale: sc('1.12 0.85;0.94 1.1;1 1', '0.45s', 'fill="freeze"'),
        rotate: '',
        bob: `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="0.5s" calcMode="spline" keyTimes="0;0.45;1" keySplines=".2 .8 .4 1;.6 0 .8 .2" fill="freeze"/>`,
      }
    case 'jump':
      return {
        scale: sc('1.12 0.82;1.12 0.82;0.92 1.14;0.92 1.14;1 1;1 1;1.08 0.88;1 1', '1.15s', 'keyTimes="0;0.2;0.28;0.5;0.7;0.9;0.95;1" fill="freeze"'),
        rotate: '',
        bob: '',
      }
    case 'land':
      return { scale: sc('1.22 0.72;1.1 0.9;1 1', '0.4s', 'fill="freeze"'), rotate: '', bob: '' }
    case 'fall':
      return { scale: sc('0.95 1.08', '0.2s', 'fill="freeze"'), rotate: rot('-8;8;-8', '0.4s'), bob: '' }
    case 'shake':
      return { scale: pop, rotate: '', bob: slide('-0.5 0;0.5 0;-0.5 0', '0.14s') }
    case 'type':
      return { scale: pop, rotate: '', bob: '' } // la inclinación hacia el texto va fuera del giro de cara (typeLean)
    case 'read':
      return { scale: pop, rotate: rot('0;-1.5;0;1.5;0', '4s'), bob: slide('0 0;0 -0.25;0 0', '2.4s') }
    case 'walk':
      return { scale: pop, rotate: '', bob: slide('0 0;0 -0.45;0 0', '0.36s') }
    case 'cheer':
      return { scale: '', rotate: '', bob: slide('0 0;0 -1.2;0 0', '0.55s') }
    case 'sleep':
      return { scale: sc('1 1;1.02 1.04;1 1', '3.2s', loop), rotate: '', bob: '' }
    default:
      return { scale: pop, rotate: '', bob: slide('0 0;0 0;0 0.4;0 0', '3.2s') }
  }
}

function dust(sc: Scene): string {
  if (sc.kind !== 'land') return ''
  const p = (dx: number, dy: number, i: number) =>
    `<rect x="${f1(5 + i)}" y="10" width="1" height="1" fill="${C.dust}"><animate attributeName="x" values="${f1(5 + i)};${f1(5 + i + dx)}" dur="0.45s" fill="freeze"/>` +
    `<animate attributeName="y" values="10;${f1(10 + dy)}" dur="0.45s" fill="freeze"/><animate attributeName="opacity" values="0.9;0" dur="0.45s" fill="freeze"/></rect>`
  return p(-4, -1.5, 0) + p(-2.5, -2.5, 1) + p(3, -2.5, 3) + p(5, -1.5, 4)
}

export function labelFor(mood: Mood, tool: string): string {
  if (mood === 'tool') return tool ? t(`usando ${tool}`, `using ${tool}`) : t('trabajando…', 'working…')
  if (mood === 'web') return t('buscando en internet', 'searching the web')
  if (mood === 'fail') return t('uy, ha fallado', 'oops, that failed')
  if (mood === 'done') return t('¡listo!', 'done!')
  return ''
}

/** SVG de una escena: lienzo wc x HC; el sprite se mueve por su `path` con SMIL. */
export function sceneSvg(sc: Scene, mood: Mood, label: string, wc: number, now = sc.t0): string {
  const n = sc.path.length / 2
  const moving = sc.dur > 0 && n > 1
  const vals: string[] = []
  const xs: string[] = []
  for (let i = 0; i < n; i++) {
    vals.push(`${f1(sc.path[i * 2])} ${f1(sc.path[i * 2 + 1])}`)
    xs.push(`${f1(sc.path[i * 2])} 0`)
  }
  const timing =
    sc.ease && n === 2
      ? 'calcMode="spline" keyTimes="0;1" keySplines=".3 0 .2 1"'
      : sc.times.length === n
        ? `keyTimes="${sc.times.map(t => f1(t)).join(';')}"`
        : ''
  // el recorrido empieza en m0 (al arrastrar, cada movimiento), no al principio de la escena
  const span = `dur="${f1(sc.dur / 1000)}s" ${rel(sc, sc.m0)}`
  const move = moving ? `<animateTransform attributeName="transform" type="translate" values="${vals.join(';')}" ${span} ${timing} fill="freeze"/>` : ''
  const sx = moving ? `<animateTransform attributeName="transform" type="translate" values="${xs.join(';')}" ${span} ${timing} fill="freeze"/>` : ''

  const text =
    label && sc.kind !== 'drag' && sc.kind !== 'fall' && sc.kind !== 'sleep' && !isStory(sc.kind)
      ? `<text x="${f1(SPW + 6)}" y="${f1(SPH * 0.6)}" font-size="11" font-family="system-ui,sans-serif" fill="${C.label}" opacity="0">` +
        `${label.replace(/[<>&]/g, '')}<animate attributeName="opacity" values="0;0.95" dur="0.35s" fill="freeze"/></text>`
      : ''

  // la sombra se encoge y se aclara cuanto más alto está Clawd
  const shadowAt = (y: number) => clamp(1 - (FLOOR - y) / (FLOOR + 1), 0.35, 1)
  const rxs: string[] = []
  const ops: string[] = []
  for (let i = 0; i < n; i++) {
    const k = shadowAt(sc.path[i * 2 + 1])
    rxs.push(f1(SPW * 0.36 * k))
    ops.push(f1(0.2 * k))
  }
  const k0 = shadowAt(sc.path[1])
  const shadowAnim = moving
    ? `<animate attributeName="rx" values="${rxs.join(';')}" ${span} ${timing} fill="freeze"/>` +
      `<animate attributeName="opacity" values="${ops.join(';')}" ${span} ${timing} fill="freeze"/>`
    : ''
  const shadow =
    `<ellipse cx="${f1(SPW / 2)}" cy="${f1(FLOOR + SPH + 1.5)}" rx="${f1(SPW * 0.36 * k0)}" ry="2" fill="#000" opacity="${f1(0.2 * k0)}">${shadowAnim}</ellipse>`

  return phase(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(wc)} ${HC}" width="100%" height="100%" ${CROP}>` +
    `<g transform="translate(${xs[0]})">${shadow}${sx}</g>` +
    `<g transform="translate(${vals[0]})"><g transform="scale(${U})">${isStory(sc.kind) ? storyBody(sc.kind, sc.face) : spriteGroup(sc, mood, sc.spark > 0 && now - sc.spark < 1500)}</g>${text}${move}</g></svg>`,
    (now - sc.t0) / 1000,
  )
}

/** Aparece con un fundido corto (nada se desliza ni se mueve). */
function fadeIn(inner: string): string {
  return (
    `<g><animate attributeName="opacity" values="0;1" dur="0.25s" calcMode="spline" keyTimes="0;1" ` +
    `keySplines=".4 0 .2 1" fill="freeze"/>${inner}</g>`
  )
}

/**
 * La banda sin Clawd (está fuera, en el escritorio): vacía y limpia (un clic aquí lo llama). Con `near` (lo tienes encima de la barra de escribir) enseña dónde va a caer: una sombra
 * que late y una flechita. `sinceS`: segundos desde que cambió (las animaciones siguen donde iban si se redibuja).
 */
export function dockSvg(wc: number, near: boolean, sinceS = 0): string {
  const cx = wc / 2
  const glow = near
    ? `<ellipse cx="${f1(cx)}" cy="${f1(FLOOR + SPH + 1.5)}" rx="${f1(SPW * 0.45)}" ry="2.4" fill="${C.body}" opacity="0.35">` +
      `<animate attributeName="rx" values="${f1(SPW * 0.3)};${f1(SPW * 0.5)};${f1(SPW * 0.3)}" dur="1.1s" ${loop}/>` +
      `<animate attributeName="opacity" values="0.2;0.45;0.2" dur="1.1s" ${loop}/></ellipse>` +
      `<g fill="${C.body}" opacity="0.7">${[[-2, 0], [-1, 1], [0, 2], [1, 1], [2, 0]].map(([dx, dy]) => `<rect x="${f1(cx + dx * 3 - 1.5)}" y="${f1(FLOOR + 14 + dy * 3)}" width="3" height="3"/>`).join('')}` +
      `<animateTransform attributeName="transform" type="translate" values="0 -4;0 2;0 -4" dur="1.1s" ${loop}/></g>`
    : ''
  return phase(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(wc)} ${HC}" width="100%" height="100%" ${CROP}>` +
    `${near ? fadeIn(glow) : ''}</svg>`,
    sinceS,
  )
}

/**
 * Escribiendo: se inclina un poco hacia el lado de la pantalla donde va tu cursor, con suavidad. Va FUERA del giro
 * de cara: así, si se gira, sigue inclinado hacia el mismo lado (antes se invertía y parecía inclinarse al revés).
 * Justo encima del cursor se queda derecho (sin titubear de un lado a otro).
 */
function typeLean(sc: Scene): { open: string; close: string } {
  if (sc.kind !== 'type') return { open: '', close: '' }
  const side = (g: number[]) => {
    const a = g.length === 2 ? Math.abs(g[0]) : 0
    return a <= 0.2 ? 0 : Math.sign(g[0]) * Math.min(5, ((a - 0.2) / 0.4) * 5)
  }
  const to = Math.round(side(sc.gaze) * 2) / 2
  const from = Math.round(side(sc.gazeFrom) * 2) / 2
  if (to === 0 && from === 0) return { open: '', close: '' }
  const glide =
    from === to
      ? ''
      : `<animateTransform attributeName="transform" type="rotate" values="${f1(from)};${f1(to)}" dur="0.3s" ` +
        `calcMode="spline" keyTimes="0;1" keySplines=".3 0 .3 1" ${rel(sc, sc.g0)} fill="freeze"/>`
  return {
    open: `<g transform="translate(7 11)"><g transform="rotate(${f1(to)})">${glide}<g transform="translate(-7 -11)">`,
    close: '</g></g></g>',
  }
}

/** Clawd en unidades de sprite (14 x 11), con su giro de cara y las fases del cuerpo. */
function spriteGroup(sc: Scene, mood: Mood, stars = false): string {
  const b = bodyAnims(sc)
  // el giro de cara se anima: de hacia dónde miraba antes a hacia dónde mira ahora
  const turn =
    sc.faceFrom !== sc.face
      ? `<animateTransform attributeName="transform" type="scale" values="${sc.faceFrom} 1;${sc.face} 1" dur="0.2s" calcMode="spline" keyTimes="0;1" keySplines=".3 0 .3 1" ${rel(sc, sc.g0)} fill="freeze"/>`
      : ''
  const flipOpen = `<g transform="translate(${GW / 2} 0)"><g transform="scale(${sc.face} 1)">${turn}<g transform="translate(${-GW / 2} 0)">`
  const flipClose = '</g></g></g>'

  const parts =
    `<g>${b.bob}${arms(sc, mood)}` +
    rect(2, 3, 10, 6, C.body) + rect(2, 8, 10, 1, C.shade) +
    `${eyes(sc, mood)}${legs(sc.kind)}${props(sc, mood)}${extras(sc, mood, stars)}</g>`

  // el pivote para aplastar/inclinar son los pies (7, 11); colgando, el punto por donde lo agarras (arriba)
  const py = sc.kind === 'drag' ? 2 : 11
  const sway = sc.kind === 'drag' ? `<animateTransform attributeName="transform" type="rotate" values="-3;3;-3" dur="1.2s" begin="0.9s" ${loop}/>` : ''
  const lean = typeLean(sc)
  return (
    `${lean.open}${flipOpen}<g transform="translate(7 ${py})"><g>${b.scale}<g>${b.rotate}<g>${sway}` +
    `<g transform="translate(-7 ${-py})">${parts}${dust(sc)}</g></g></g></g></g>${flipClose}${lean.close}`
  )
}

/** Clawd diminuto para la fila de "trabajando" (spinner): corre, lee o teclea según lo que hace el turno. */
export function miniSvg(mode: string, h = 18, elapsedS = 0, web = false): string {
  const u = h / GH
  const w = Math.ceil(GW * u + 2)
  const kind: Kind = web ? 'read' : mode === 'thinking' ? 'laptop' : mode === 'responding' || mode === 'requesting' ? 'walk' : 'idle'
  const mood: Mood = mode === 'tool-use' || mode === 'tool-input' ? 'tool' : 'thinking'
  const sc: Scene = { ...base(kind, 0, 1, 1), path: [0, 0] }
  return phase(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${f1(h)}" width="${w}" height="${f1(h)}" shape-rendering="crispEdges">` +
    `<g transform="translate(1 0) scale(${f1(u)})">${spriteGroup(sc, mood)}</g></svg>`,
    elapsedS,
  )
}

// ── elegir la siguiente escena ──────────────────────────────────────────────

export type Pick = { scene: Scene; holdMs: number } // holdMs: cuánto dura antes de decidir de nuevo (0 = no se reprograma)

/** Duración de las escenas que acaban solas (ms). */
const SPAN: Partial<Record<Kind, number>> = { firefly: 5300, sneeze: 1700, wave: 1700, jump: 1150, yawn: 1000, pet: 1500, dizzy: 1700, shake: 900, cheer: 1900, land: 450, stretch: 1700, send: 900, plane: storyMs('plane'), map: storyMs('map'), music: storyMs('music') }

/** Al enviar un mensaje: saltito alegre y el papel sale volando hacia la conversación. */
export function send(x: number, now: number, face: number, seed: number): Scene {
  return still('send', x, FLOOR, now, face, seed)
}
export const SEND_MS = 900

/**
 * Hacia dónde mira en una historia (0 = no cabe, mejor otra cosa). El avión necesita sitio por delante para volar:
 * mira hacia el lado con más espacio (el suyo, si cabe); el mapa y los cascos van en cualquier sitio.
 */
export function storyFace(kind: StoryKind, x: number, wc: number, face: number): number {
  if (kind !== 'plane') return face
  const right = wc - x >= PLANE_AHEAD_U * U
  const left = x >= PLANE_BEHIND_U * U
  if (face > 0 && right) return 1
  if (face < 0 && left) return -1
  return right ? 1 : left ? -1 : 0
}

export function nextScene(opts: {
  mood: Mood
  typing: boolean
  prev: Scene
  now: number
  wc: number
  rnd: () => number
  idleMs: number // tiempo sin que pase nada (ni ratón, ni teclado, ni sesión)
}): Pick {
  const { mood, typing, prev, now, wc, rnd, idleMs } = opts
  const maxX = Math.max(0, wc - SPW)
  const here = clamp(posAt(prev, now).x, 0, maxX)
  const y = FLOOR
  const seed = Math.floor(rnd() * 1e6)
  const face = prev.face
  const at = (kind: Kind) => still(kind, here, y, now, face, seed)

  if (typing) return { scene: at('type'), holdMs: 0 }
  if (prev.kind === 'fall') return { scene: { ...at('land'), hard: prev.hard }, holdMs: SPAN.land! }
  // Claude ha terminado mientras estaba ocupado (aterrizando, enviando...): celebra en cuanto acaba lo que hacía
  if (mood === 'done' && prev.kind !== 'cheer' && prev.kind !== 'dizzy') {
    return { scene: { ...jump(here, y, now, face, seed, 34), kind: 'cheer' }, holdMs: SPAN.cheer! }
  }
  if (prev.kind === 'land') return prev.hard > 650 ? { scene: at('dizzy'), holdMs: SPAN.dizzy! } : { scene: at('idle'), holdMs: 1200 }

  if (mood === 'thinking') {
    // piensa: pasea con los tres puntitos, saca un libro y lee, y vuelve a pasear
    const pace = (): Pick => {
      const go = clamp(here + (rnd() < 0.5 ? -1 : 1) * (50 + rnd() * 90), 0, maxX)
      if (Math.abs(go - here) < 16) return { scene: at('idle'), holdMs: 1400 }
      const w = walk(here, go, y, now, seed, 24)
      return { scene: w, holdMs: w.dur + 150 }
    }
    const read = (): Pick => ({ scene: at('laptop'), holdMs: 6500 + rnd() * 3000 })
    if (prev.kind === 'laptop' || prev.kind === 'read') return pace()
    if (prev.kind === 'walk') return rnd() < 0.7 ? read() : { scene: at('idle'), holdMs: 1800 }
    return rnd() < 0.45 ? pace() : read()
  }
  if (mood === 'tool') return { scene: at('idle'), holdMs: 2500 }
  // buscando en internet: lee su libro (y de vez en cuando pasa la página paseando un poco)
  if (mood === 'web') return prev.kind === 'read' && rnd() < 0.25 ? { scene: walk(here, clamp(here + (rnd() < 0.5 ? -40 : 40), 0, maxX), y, now, seed, 24), holdMs: 1800 } : { scene: at('read'), holdMs: 5000 }

  const r = rnd()
  if (prev.kind === 'yawn') return { scene: at('sleep'), holdMs: 0 }
  if (prev.kind === 'sleep') return { scene: prev, holdMs: 0 }
  if (idleMs > 90_000) return { scene: at('yawn'), holdMs: SPAN.yawn! }
  // de vez en cuando, una historia larga: avión de papel, mapa o cascos (nunca dos seguidas)
  if (!isStory(prev.kind) && rnd() < 0.1) {
    const kind: StoryKind = (['plane', 'map', 'music'] as const)[Math.floor(rnd() * 3)]
    const f = storyFace(kind, here, wc, face)
    if (f !== 0) return { scene: still(kind, here, y, now, f, seed), holdMs: SPAN[kind]! }
  }
  // tras un rato sentado se levanta estirándose; tras andar a veces se sienta en el borde de la barra
  if (prev.kind === 'sit') return r < 0.5 ? { scene: at('stretch'), holdMs: SPAN.stretch! } : { scene: at('idle'), holdMs: 1500 }
  if (prev.kind === 'walk' && r < 0.3) return { scene: at('sit'), holdMs: 6000 + rnd() * 6000 }
  if (r < 0.42) {
    const go = clamp(rnd() * maxX, 0, maxX)
    if (Math.abs(go - here) > 18) {
      // a veces paseíto corto y tranquilo, a veces cruza decidido
      const w = walk(here, go, y, now, seed, Math.abs(go - here) > 220 ? 52 : 36)
      return { scene: w, holdMs: w.dur + 150 }
    }
  }
  if (r < 0.52) return { scene: at('look'), holdMs: 3500 + rnd() * 2500 }
  if (r < 0.6) return { scene: at('wave'), holdMs: SPAN.wave! }
  if (r < 0.7) return { scene: jump(here, y, now, face, seed, 20 + rnd() * 14), holdMs: SPAN.jump! }
  if (r < 0.8) return { scene: at('sit'), holdMs: 5000 + rnd() * 5000 }
  if (r < 0.85) return { scene: at('stretch'), holdMs: SPAN.stretch! }
  if (r < 0.9) return { scene: at('firefly'), holdMs: SPAN.firefly! }
  if (r < 0.92) return { scene: at('sneeze'), holdMs: SPAN.sneeze! }
  return { scene: at('idle'), holdMs: 2200 + rnd() * 3800 }
}

/**
 * ¿El turno lo has pedido tú? Los turnos que despiertan a Claude solos (la notificación de una tarea en segundo
 * plano que termina, una tarea programada, otra sesión, una continuación automática...) no son "tu" turno: ni se
 * celebran ni se avisan. Un origen que no reconoce (o `unclassified`) cuenta como tuyo: es mejor un aviso de más
 * que quedarse sin él.
 */
const NOT_YOURS = new Set([
  'task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'projects-relay', 'coordinator',
  'observer', 'observer-activity', 'auto-continuation', 'slack-ping',
])
export function isUserTurn(origin: { kind: string; asUser?: boolean } | undefined): boolean {
  if (!origin) return true
  if (origin.kind === 'plugin') return origin.asUser === true // un plugin que habla "como tú" (la cajita de Clawd)
  return !NOT_YOURS.has(origin.kind)
}

/** Escena de reacción a un cambio de estado de ánimo (o null si no hay). */
export function moodScene(next: Mood, prev: Scene, now: number, wc: number, rnd: () => number): Pick | null {
  const maxX = Math.max(0, wc - SPW)
  const here = clamp(posAt(prev, now).x, 0, maxX)
  const seed = Math.floor(rnd() * 1e6)
  if (next === 'fail') return { scene: still('shake', here, FLOOR, now, prev.face, seed), holdMs: SPAN.shake! }
  if (next === 'done') return { scene: { ...jump(here, FLOOR, now, prev.face, seed, 34), kind: 'cheer' }, holdMs: SPAN.cheer! }
  return null
}

/** Pequeño salto de sorpresa: un clic izquierdo sin arrastrar. */
export function poke(x: number, y: number, now: number, face: number, seed: number): Scene {
  return jump(x, y, now, face, seed, 14)
}

/** Ancho del lienzo en px: toda la banda si ya sabemos cuánto mide una celda; si no, uno pequeño y seguro. */
export function worldWidth(cellPx: number, bodyColumns: number): number {
  if (!(cellPx > 0) || !(bodyColumns > 2)) return 240
  return clamp(Math.floor((bodyColumns - 1) * cellPx), 240, 1500)
}

// ── colores: un Clawd distinto por sesión ───────────────────────────────────

export type Palette = { name: string; body: string; shade: string }

/** El primero (naranja) es el de siempre; la segunda sesión abierta es azul, la tercera amarilla, la cuarta blanca... */
export const PALETTES: Palette[] = [
  { name: 'naranja', body: C.body, shade: C.shade },
  { name: 'azul', body: '#5B9BE6', shade: '#3E72B8' },
  { name: 'amarillo', body: '#E9C24B', shade: '#BE9A2C' },
  { name: 'blanco', body: '#F1EFEA', shade: '#C6C2BA' },
  { name: 'verde', body: '#63C48F', shade: '#3F9A6B' },
  { name: 'rosa', body: '#E88BB0', shade: '#BC6489' },
  { name: 'morado', body: '#A184DE', shade: '#7B5EB8' },
  { name: 'turquesa', body: '#4FC3C9', shade: '#2F9AA0' },
]

export const paletteOf = (slot: number): Palette => PALETTES[((Math.floor(slot) % PALETTES.length) + PALETTES.length) % PALETTES.length]

/** Tiñe un dibujo de Clawd con el color de su sesión (el naranja de siempre se cambia por el suyo). */
export function tint(svg: string, slot: number): string {
  const p = paletteOf(slot)
  if (p.body === C.body) return svg
  return svg.split(C.body).join(p.body).split(C.shade).join(p.shade)
}
