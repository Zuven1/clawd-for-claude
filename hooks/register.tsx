import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Mood, Scene } from '../types'
import { FLOOR, HC, SEND_MS, SPH, SPW, U, dockSvg, drag, exceeds, fall, isUserTurn, labelFor, miniSvg, moodScene, nextScene, poke, posAt, sceneSvg, send, still, tint, worldWidth } from './scene'
import { SLOT_BEAT_MS, beatSlot, claimSlot, releaseSlot } from './slots'
import { t } from './i18n'

// Altura de la banda en la terminal (filas de texto); en escritorio manda el lienzo (HC px).
const TERMINAL_ROWS = 8
// Filas de texto que cubre la capa del ratón (un poco por encima: HC / ~19 px por fila)
const INPUT_ROWS = Math.ceil(HC / 19)
// Ancho medio de un carácter en la barra de escribir del escritorio, y su margen izquierdo (px)
const CHAR_PX = 7.4
const PROMPT_PAD = 14

const mood = atom({ plugin: 'clawd-band', key: 'mood' } as const, 'idle')
const tool = atom({ plugin: 'clawd-band', key: 'tool' } as const, '')
const sceneAtom = atom({ plugin: 'clawd-band', key: 'scene' } as const, still('idle', 120, FLOOR, 0, 1, 1))
const typing = atom({ plugin: 'clawd-band', key: 'typing' } as const, false)
const cellPxAtom = atom({ plugin: 'clawd-band', key: 'cellPx' } as const, 0)
const hidden = atom({ plugin: 'clawd-band', key: 'hidden' } as const, false)
const mini = atom({ plugin: 'clawd-band', key: 'mini' } as const, true)
const away = atom({ plugin: 'clawd-band', key: 'away' } as const, false)
const dockAt = atom({ plugin: 'clawd-band', key: 'dockAt' } as const, 0)
const bandH = atom({ plugin: 'clawd-band', key: 'bandH' } as const, HC)

// Alto de la banda minimizada mientras Clawd está fuera, y cuánto tarda en bajar la persiana antes de minimizarse
const DOCK_H = 26
const OUT_DELAY_MS = 120 // el de escritorio aparece un instante después de que desaparezca el de la banda
const near = atom({ plugin: 'clawd-band', key: 'near' } as const, false)
const slotAtom = atom({ plugin: 'clawd-band', key: 'slot' } as const, 0) // el hueco de esta sesión: su color

// ── estado que no se dibuja (se reinicia al recargar el mod) ────────────────

// ── varias sesiones a la vez: cada una con su hueco (color), sus archivos y su propia suerte ──
let sid = '' // id de la sesión
let sidTag = 'x' // trozo del id para los nombres de archivo: las órdenes y las respuestas son de cada sesión
let regDir = '' // carpeta del registro de sesiones ('' = sin registro: siempre naranja)
let mySlot = 0

// Pon DEBUG a true para volver a registrar medidas y eventos de ratón en este archivo.
const DEBUG = false
const debugLines: string[] = []

let gen = 0 // generación de la escena: invalida los temporizadores viejos
let toolGen = 0 // generación de las herramientas/turnos: invalida los "vuelve a pensar" viejos
let seed = 987654321
let lastEdit = 0
let lastActive = 0 // última vez que pasó algo (ratón, teclado, sesión): para dormirse
let lastSceneAt = 0
let holdUntil = 0 // cuándo toca decidir la siguiente escena (0 = la escena no caduca sola)
let epoch = 0 // para que el Clawd diminuto del spinner no reinicie sus animaciones al redibujarse
let bodyCols = 0
let dragOn = false
let dragGx = 0
let dragGy = 0
let dragMoved = 0
let dragT0 = 0
let dragLast = 0
let dragTrail: number[][] = []
let pointerLogs = 0
// con Clawd fuera, al escribir en la app se le avisa de por dónde va el cursor (como mucho cada PET_TYPE_MS)
const PET_TYPE_MS = 250
let petTypeAt = 0
let petTypeTimer = false
let petText = ''
let petCursor = 0
// los eventos de ratón se procesan de uno en uno; los movimientos atrasados se descartan
let ptrQueue: Promise<unknown> = Promise.resolve()
let latestMove: unknown = null
let noButtonMoves = 0 // movimientos seguidos sin botón pulsado mientras se creía agarrado
const PULL_OUT_PX = 28 // cuánto hay que tirar de él más allá del borde de la banda para sacarlo al escritorio
const LIFT_PX = 26 // arrastrarlo más que esto (y más que un clic con temblor) se lo pasa al Clawd de escritorio
let dragX0 = 0 // dónde lo agarraste (para medir cuánto lo has arrastrado)
let dragY0 = 0
const CLICK_PX = 22 //un clic con un pequeño temblor (una celda mide ~19 px de alto) sigue siendo un clic
// ¿el turno en marcha lo pediste tú? (una notificación de una tarea en segundo plano también despierta a Claude)
let turnByUser = true
let turnActive = false
let lastDoneAt = -1e9
const DONE_COOLDOWN_MS = 3000

// El mismo dibujo, el mismo texto: si el SVG no cambia, la app no lo recarga (ni reinicia sus animaciones).
// Cada dibujo se genera una vez (con sus animaciones ajustadas a ese momento) y se reutiliza mientras no cambie.
let sceneKey = ''
let sceneSrc = ''
let dockKey = ''
let dockSrc = ''
let miniKey = ''
let miniSrc = ''
let sceneDrawnAt = 0
let dockDrawnAt = 0
// Un dibujo guardado solo se reutiliza si la banda se acaba de redibujar (los pasos al encoger, cada 16 ms). Si la
// app la vuelve a montar más tarde (una encuesta, ocultar y mostrar...), se genera con los tiempos al día: si no,
// un paseo empezaría otra vez desde el principio o la persiana volvería a bajar.
const REUSE_MS = 400
// la mirada se actualiza como mucho cada LOOK_MS (con una última actualización para acabar donde toca)
const LOOK_MS = 140
let lastLookAt = 0
let lookPending: number[] | null = null
let lookTimer = false
let caretAt = 0
let lastText = ''
let lastCursor = 0
let caretTimer = false

const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const q = (v: number, step: number) => Math.round(v / step) * step

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function note($: any, line: string) {
  if (!DEBUG) return
  debugLines.push(`${new Date(await $.clock.now()).toISOString()} ${line}`)
  if (debugLines.length > 80) debugLines.shift()
  await $.fs.write(`${String($.plugin.root).replace(/\\/g, '/')}/clawd-debug.log`, debugLines.join('\n') + '\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function world($: any): Promise<number> {
  return worldWidth(await read($, cellPxAtom), bodyCols)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function touch($: any) {
  lastActive = await $.clock.now()
}

const sameGaze = (a: number[], b: number[]) => a.length === b.length && a.every((g, i) => g === b[i])

/** Pone una escena; si `holdMs` > 0, pasado ese tiempo decide la siguiente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setScene($: any, sc: Scene, holdMs: number) {
  gen += 1
  const mine = gen
  const now = await $.clock.now()
  lastSceneAt = now
  holdUntil = holdMs > 0 ? now + holdMs : 0
  const prev = await read($, sceneAtom)
  // los ojos y la cara van de donde estaban a donde van, con una transición que empieza ahora
  const turned = prev.face !== sc.face || !sameGaze(prev.gaze, sc.gaze)
  const next: Scene = { ...sc, faceFrom: prev.face, gazeFrom: prev.gaze, g0: turned && sc.t0 < now ? now : sc.g0 }
  await update($, sceneAtom, () => next)
  if (holdMs > 0) {
    $.clock.after(holdMs, () => {
      if (gen === mine) void advance($)
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function advance($: any) {
  if (dragOn) return
  const prev = await read($, sceneAtom)
  const now = await $.clock.now()
  const pick = nextScene({
    mood: await read($, mood),
    typing: await read($, typing),
    prev,
    now,
    wc: await world($),
    rnd,
    idleMs: now - lastActive,
  })
  await setScene($, pick.scene, pick.holdMs)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function greet($: any) {
  if (dragOn) return
  const prev = await read($, sceneAtom)
  const now = await $.clock.now()
  const at = clamp(posAt(prev, now).x, 0, Math.max(0, (await world($)) - SPW))
  lastActive = now
  await setScene($, still('wave', at, FLOOR, now, 1, Math.floor(rnd() * 1e6)), 1800)
}

// Escenas que no se interrumpen por un cambio de ánimo: acaban y luego deciden con el ánimo nuevo.
const BUSY = new Set(['fall', 'land', 'drag', 'type', 'send'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setMood($: any, m: Mood, name = '') {
  const before = await read($, mood)
  await update($, mood, () => m)
  await update($, tool, () => name)
  await touch($)
  // el de escritorio también enseña lo que hace Claude (para estar pendiente)
  if (petReady && (m !== before || m === 'tool' || m === 'web')) await tellPet($, `mood ${m}`)
  if (m === before || dragOn) return
  const prev = await read($, sceneAtom)
  if (BUSY.has(prev.kind)) return
  const react = moodScene(m, prev, await $.clock.now(), await world($), rnd)
  if (react) await setScene($, react.scene, react.holdMs)
  else if (!(m === 'idle' && before === 'done')) await advance($) // tras celebrar ya eligió su escena: no se la pisa
}

// ── escribir: mira la barra y sigue con los ojos por dónde vas escribiendo ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startTyping($: any) {
  await update($, typing, () => true)
  await touch($)
  if (dragOn) return
  const prev = await read($, sceneAtom)
  if (BUSY.has(prev.kind)) return
  const now = await $.clock.now()
  const at = posAt(prev, now)
  await setScene($, still('type', clamp(at.x, 0, Math.max(0, (await world($)) - SPW)), FLOOR, now, prev.face, Math.floor(rnd() * 1e6)), 0)
}

/** El cursor de texto está más o menos aquí (px de la banda): los ojos van hacia él, mirando abajo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function followCaret($: any, text: string, cursor: number) {
  const sc = await read($, sceneAtom)
  if (sc.kind !== 'type' || dragOn) return
  const wc = await world($)
  const before = text.slice(0, Math.max(0, cursor))
  const col = before.length - before.lastIndexOf('\n') - 1
  const lineW = Math.max(200, wc - PROMPT_PAD * 2)
  const caret = PROMPT_PAD + ((col * CHAR_PX) % lineW)
  const now = await $.clock.now()
  const at = posAt(sc, now)
  const dx = caret - (at.x + SPW / 2)
  // sutil: hacia el lado donde escribes, siempre mirando hacia abajo
  const gaze = [q(clamp(dx / 260, -1, 1), 0.1), 0.5]
  // si escribes muy lejos a su espalda, se gira (con su animación de giro)
  const face = Math.abs(dx) > 140 ? (dx < 0 ? -1 : 1) : sc.face
  if (sameGaze(gaze, sc.gaze) && face === sc.face) return
  await setScene($, { ...sc, gaze, face }, 0)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function stopTypingIfQuiet($: any) {
  if ((await $.clock.now()) - lastEdit < 2000) return
  if (!(await read($, typing))) return
  await update($, typing, () => false)
  const prev = await read($, sceneAtom)
  if (prev.kind === 'type') await advance($)
}

// ── la banda se minimiza en vertical (suave) mientras Clawd está fuera, y se abre para recibirlo ──

let bandGen = 0

/**
 * Lleva el alto visible de la banda hasta `target` (px) con aceleración y frenado suaves. Cada paso obliga a la app
 * a recolocar la conversación, que es lo caro: por eso va de 2 en 2 px, solo cuando cambia, y dura menos si hay
 * poco camino.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function animateBand($: any, target: number) {
  bandGen += 1
  const mine = bandGen
  const from = await read($, bandH)
  if (from === target) return
  const t0 = await $.clock.now()
  const dur = Math.min(340, 140 + Math.abs(target - from) * 2.4)
  let last = from
  const tick = async () => {
    if (bandGen !== mine) return
    const k = clamp(((await $.clock.now()) - t0) / dur, 0, 1)
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    const v = k >= 1 ? target : Math.round((from + (target - from) * e) / 2) * 2
    if (v !== last) {
      last = v
      await update($, bandH, () => v)
    }
    if (k < 1) $.clock.after(24, () => void tick())
  }
  await tick()
}

// ── Clawd de escritorio: sale de la banda y pasea por el borde de tu pantalla ──

const CSC = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
let petAlive = false
let petReady = false
let petSeq = 0
let petBuilding: Promise<boolean> | null = null
let outAck = true // el de escritorio confirmó que ha salido ("out")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const petPaths = ($: any) => {
  const dir = `${String($.plugin.root).replace(/\\/g, '/')}/desktop`
  return { src: `${dir}/ClawdDesktop.cs`, exe: `${dir}/bin/ClawdDesktop.exe`, cmd: `${dir}/bin/cmd-${sidTag}.txt` }
}

/** Compila el ejecutable si falta o si el código es más nuevo (una vez; unos segundos). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPet($: any): Promise<boolean> {
  if (petBuilding) return petBuilding
  petBuilding = (async () => {
    const { src, exe } = petPaths($)
    try {
      // sin Windows no hay compilador de C#, y entonces no hay Clawd de escritorio (la banda funciona igual); si la
      // propia comprobación falla, se intenta compilar igualmente (y si no se puede, se vuelve a la banda)
      if (!(await $.fs.exists(CSC).catch(() => true))) return false
      const s = await $.fs.stat(src)
      const e = await $.fs.stat(exe).catch(() => undefined)
      if (e && e.mtimeMs >= s.mtimeMs) return true
      const r = await $.process.run(
        [CSC, '/nologo', '/target:winexe', '/optimize+', `/out:${exe}`, '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', src],
        { timeoutMs: 60000 },
      )
      await note($, `csc ${r.exitCode} ${r.stdout}`)
      return r.exitCode === 0
    } catch (err) {
      await note($, `csc falló: ${String(err)}`)
      return false
    }
  })()
  return petBuilding
}

/** Arranca el Clawd de escritorio (escondido) para que el traspaso sea inmediato. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePet($: any) {
  if (petAlive) return
  petAlive = true
  if (!(await buildPet($))) {
    petAlive = false
    petBuilding = null
    return
  }
  const { exe, cmd } = petPaths($)
  await $.fs.write(cmd, '') // órdenes viejas fuera
  petSeq = 0
  petLog.length = 0
  void (async () => {
    let buf = ''
    try {
      for await (const chunk of $.process.spawn({ argv: [exe, cmd, String(mySlot), regDir] })) {
        buf += String(chunk.text)
        let nl = buf.indexOf('\n')
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          nl = buf.indexOf('\n')
          if (line === 'ready') petReady = true
          else if (line === 'out') outAck = true
          else if (line.startsWith('home')) await comeHome($, Number(line.split(' ')[1]))
          else if (line.startsWith('near')) await setNear($, line.endsWith('1'))
          else if (line === 'usage?') await sendUsage($)
          else if (line.startsWith('say ')) await sayToClaude($, decodeURIComponent(line.slice(4)))
        }
      }
    } catch (err) {
      await note($, `Clawd de escritorio: ${String(err)}`)
    }
    petAlive = false
    petReady = false
    for (const f of pendingAnswers) await $.fs.write(f, 'app').catch(() => undefined) // la app pregunta en su lugar
    if (await read($, away)) await comeHome($, 0.5) // si se cerró estando fuera, vuelve a casa
  })()
}

// Las últimas órdenes se reescriben todas juntas: si llegan dos casi a la vez, el de escritorio no pierde ninguna
// (cada una lleva su número y solo obedece las nuevas).
const petLog: string[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tellPet($: any, verb: string) {
  petSeq += 1
  petLog.push(`${petSeq} ${verb}`)
  if (petLog.length > 12) petLog.shift()
  await $.fs.write(petPaths($).cmd, petLog.join('\n') + '\n')
}

/** Una herramienta ha terminado: estrellitas en el portátil (en la banda o en el de escritorio), nada más. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sparkle($: any) {
  if ((await read($, mood)) === 'web') return // con el libro no hay estrellitas: solo con el portátil
  if (await read($, away)) {
    if (petReady) await tellPet($, 'spark')
    return
  }
  if (dragOn) return
  const now = await $.clock.now()
  await update($, sceneAtom, sc => (BUSY.has(sc.kind) ? sc : { ...sc, spark: now }))
}

/** Por dónde va el cursor de texto (0 = al principio de la barra, 1 = al final): para que Clawd se acerque ahí. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tellTyping($: any) {
  const wc = await world($)
  const before = petText.slice(0, Math.max(0, petCursor))
  const col = before.length - before.lastIndexOf('\n') - 1
  const lineW = Math.max(200, wc - PROMPT_PAD * 2)
  const caret = PROMPT_PAD + ((col * CHAR_PX) % lineW)
  await tellPet($, `type ${clamp(caret / wc, 0, 1).toFixed(3)}`)
}

/** Texto con espacios dentro de una orden (una palabra para el de escritorio). */
const enc = (t: string) => encodeURIComponent(t.slice(0, 200))

/** Herramientas de internet: Clawd lee su libro. Lo demás, el portátil. */
const isWeb = (t: string) => /^(WebSearch|WebFetch)$|browser|chrome|web_?search|web_?fetch|fetch_?url/i.test(t)

/** Nombre corto de una herramienta (`mcp__servidor__accion` -> `accion`). */
const shortTool = (t: string) => (t.startsWith('mcp__') ? t.split('__').slice(2).join('__') || t : t)

/**
 * Sale a tu escritorio: desaparece de la banda y, a la vez, aparece bajo tu ratón tal cual lo tenías agarrado.
 * `grab` lleva dónde lo agarras (píxeles del sprite), su inclinación y cara, y dónde estaba el ratón dentro de la
 * banda: con eso el Clawd de escritorio sabe dónde está la barra de escribir para volver.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function goOut($: any, verb: 'grab' | 'drop', grab: number[] = [], inside = false) {
  if (!petReady) return false
  dragOn = false
  gen += 1 // nada pendiente en la banda
  const t = await $.clock.now()
  // `inside`: lo levantas sin salir de la banda. Ésta se queda abierta con la pista de "aquí cae" (sin encogerse y
  // volver a abrirse), hasta que lo alejes (el de escritorio avisa) o lo sueltes encima.
  nearWant = inside
  nearGen += 1
  await update($, near, () => inside)
  await update($, dockAt, () => t)
  await update($, away, () => true) // la banda se queda sin Clawd...
  if (!inside) void animateBand($, DOCK_H) // ...y se minimiza desde ya, sin esperas
  outAck = false
  // El de escritorio aparece un instante después: la banda tiene que redibujarse sin Clawd antes, o por un momento
  // se ven dos (el de la banda y el que sale).
  $.clock.after(OUT_DELAY_MS, async () => {
    if (!(await read($, away))) return
    await tellPet($, [verb, ...grab.map(n => String(Math.round(n * 100) / 100))].join(' '))
    const m = await read($, mood)
    await tellPet($, `mood ${m}`) // y sabe qué está haciendo Claude
    // si el de escritorio no confirma que ha salido (colgado, cerrado...), Clawd no se pierde: vuelve a la banda
    $.clock.after(1500, async () => {
      if (outAck || !(await read($, away))) return
      await tellPet($, 'home')
      await comeHome($, 0.5)
      $.ui.toast(t('Clawd no ha podido salir al escritorio', "Clawd couldn't go out to the desktop"))
    })
  })
  return true
}

/** Lo tienes encima de la barra de escribir: la banda se abre para recibirlo (y se cierra si te alejas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setNear($: any, on: boolean) {
  nearWant = on
  nearGen += 1
  const mine = nearGen
  if (on) {
    await applyNear($) // abrir no espera: tiene que estar abierta antes de que entre
    return
  }
  // cerrar sí espera (y se cancela si vuelve a acercarse): así no parpadea en el borde de la zona
  $.clock.after(NEAR_OFF_MS, async () => {
    if (nearGen === mine) await applyNear($)
  })
}

let nearWant = false
let nearGen = 0
const NEAR_OFF_MS = 600

/** Aplica el último "cerca / lejos" que se ha mantenido: la banda crece con la persiana subiendo, o al revés. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyNear($: any) {
  if (!(await read($, away))) return
  const on = nearWant
  if ((await read($, near)) === on) return
  const t = await $.clock.now()
  await update($, dockAt, () => t) // la sombra de "aquí cae" aparece (o se va)
  await update($, near, () => on)
  if (on) await animateBand($, HC) // crece para recibirlo
  else void animateBand($, DOCK_H) // y se vuelve a minimizar
}

/** Doble clic izquierdo en el de escritorio: cuánto queda de los límites de uso y cuándo se renuevan. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendUsage($: any) {
  let parts: string[] = []
  try {
    const u = await $.session.usage()
    parts = (u.rateLimits ?? []).map((r: { kind: string; percentUsed: number; resetsAt?: string }) =>
      `${r.kind}:${r.percentUsed}:${r.resetsAt ? Date.parse(r.resetsAt) : 0}`)
  } catch (err) {
    await note($, `usage: ${String(err)}`)
  }
  await tellPet($, `usage ${await $.clock.now()} ${parts.join(' ')}`.trim())
}

/** Doble clic derecho en el de escritorio: lo que escribas le llega a Claude como si lo escribieras tú. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sayToClaude($: any, text: string) {
  const t = text.trim()
  if (!t) return
  await $.prompt.submit({ text: t, asUser: true })
}

/** Resumen corto de lo que pide hacer una herramienta (para el botón de permiso). */
function askSummary(input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const pick = i.command ?? i.file_path ?? i.url ?? i.query ?? i.path ?? i.pattern ?? i.description
  const txt = typeof pick === 'string' ? pick : JSON.stringify(input ?? '')
  return txt.replace(/\s+/g, ' ').slice(0, 600)
}

let askSeq = 0
const pendingAnswers = new Set<string>() // permisos esperando respuesta del de escritorio

/** Vuelve a la banda: cae desde arriba, más o menos donde lo soltaste sobre la ventana. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function comeHome($: any, f: number) {
  if (!(await read($, away))) return
  nearWant = false
  nearGen += 1 // un "lejos" pendiente ya no aplica: dentro de la banda se queda abierta hasta que lo saques
  const wc = await world($)
  const x = clamp((Number.isFinite(f) ? f : 0.5) * wc - SPW / 2, 0, Math.max(0, wc - SPW))
  const now = await $.clock.now()
  const sc = await read($, sceneAtom)
  const fl = fall(x, 0, 0, 80, now, wc, sc.face, Math.floor(rnd() * 1e6))
  await setScene($, fl, fl.dur + 40) // la caída ya está puesta antes de volver: nunca se ve en su sitio viejo
  await update($, near, () => false)
  await update($, away, () => false)
  void animateBand($, HC) // y la banda crece a su tamaño
}

// ── los dibujos, reutilizados mientras no cambien ───────────────────────────

/** Clawd en la banda: un SVG nuevo solo si cambia la escena, el ánimo, la etiqueta o el ancho. */
function sceneOf(sc: Scene, m: Mood, label: string, wc: number, now: number, slot: number): string {
  const key = JSON.stringify([sc, m, label, wc, slot])
  const fresh = now - sceneDrawnAt < REUSE_MS
  sceneDrawnAt = now
  if (key !== sceneKey || !fresh) {
    sceneKey = key
    sceneSrc = tint(sceneSvg(sc, m, label, wc, now), slot)
  }
  return sceneSrc
}

/** La banda sin Clawd: un SVG nuevo solo si cambia el ancho o si lo acercas / alejas de la barra. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dockOf($: any, wc: number): Promise<string> {
  const nr = await read($, near)
  const at = await read($, dockAt)
  const slot = await read($, slotAtom)
  const key = JSON.stringify([wc, nr, at, slot])
  const now = await $.clock.now()
  const fresh = now - dockDrawnAt < REUSE_MS
  dockDrawnAt = now
  if (key !== dockKey || !fresh) {
    dockKey = key
    dockSrc = tint(dockSvg(wc, nr, (now - at) / 1000), slot)
  }
  return dockSrc
}

/** El Clawd diminuto del spinner: un SVG nuevo solo si cambia lo que hace. */
function miniOf(mode: string, web: boolean, elapsedS: number, slot: number): string {
  const key = mode + (web ? ':web' : '') + ':' + slot
  if (key !== miniKey) {
    miniKey = key
    miniSrc = tint(miniSvg(mode, 18, elapsedS, web), slot)
  }
  return miniSrc
}

// ── ratón (llega desde la capa transparente de clawd-input) ─────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function onGeo($: any, d: Record<string, unknown>) {
  const cols = Number(d.cols)
  const wc = Number(d.wc)
  if (!(cols > 0) || !(wc > 0)) return
  const px = wc / cols
  const known = await read($, cellPxAtom)
  await note($, `geo: cols=${cols} rows=${String(d.rows)} wc=${wc} -> ${px.toFixed(2)} px/celda (antes ${known.toFixed(2)}), bodyCols=${bodyCols}`)
  if (known === 0 || Math.abs(px - known) / known > 0.04) await update($, cellPxAtom, () => px)
  await fitScene($)
}

// Escenas tranquilas en las que Clawd sigue al ratón con la mirada.
const CALM = new Set(['idle', 'sit', 'look', 'wave', 'firefly'])

/** Mira hacia el ratón con suavidad (y se gira si lo tiene muy detrás) sin cortar lo que estaba haciendo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lookAt($: any, sc: Scene, at: { x: number; y: number }, px: number, py: number, now: number) {
  const dx = px - (at.x + SPW / 2)
  const dy = py - (at.y + SPH * 0.45)
  const isClose = Math.abs(dx) < 320
  // mirada continua (en pasos de 0,25): los ojos se deslizan de un punto al siguiente
  const gaze = isClose ? [q(clamp(dx / 170, -1, 1), 0.25), q(clamp(dy / 60, -1, 1), 0.5)] : []
  const face = isClose && Math.abs(dx) > 90 && sc.kind !== 'firefly' ? (dx < 0 ? -1 : 1) : sc.face
  if (sameGaze(gaze, sc.gaze) && face === sc.face) return
  // conserva el tiempo que le quedaba a la escena
  const left = holdUntil > 0 ? Math.max(400, holdUntil - now) : 0
  await setScene($, { ...sc, gaze, face }, left)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function onPointer($: any, d: Record<string, unknown>) {
  const cols = Number(d.cols)
  const rows = Number(d.rows)
  const wc = Number(d.wc)
  if (!(cols > 0) || !(rows > 0) || !(wc > 0)) return
  const type = String(d.type)
  const cx = Number(d.x)
  const cy = Number(d.y)
  const px = ((cx + 0.5) / cols) * wc
  const py = ((cy + 0.5) / rows) * HC
  const now = await $.clock.now()
  const maxX = Math.max(0, wc - SPW)
  lastActive = now
  if (pointerLogs < 30) {
    pointerLogs += 1
    await note($, `ptr ${type} celda=(${String(d.x)},${String(d.y)}) region=${cols}x${rows} -> px=(${px.toFixed(0)},${py.toFixed(0)}) lienzo=${wc}x${HC}`)
  }
  const sc = await read($, sceneAtom)

  if (await read($, away)) {
    if (type === 'down' && petReady) await tellPet($, 'home') // un clic en su sitio vacío: lo llamas
    return
  }

  if (type === 'down') {
    const at = posAt(sc, now)
    const slop = 12 // la región mide en celdas enteras: zona de agarre generosa
    const hit = px >= at.x - slop && px <= at.x + SPW + slop && py >= at.y - slop && py <= at.y + SPH + slop
    if (!hit) return
    if (String(d.b) === 'right') {
      // clic derecho: caricia
      if (!dragOn) await setScene($, still('pet', clamp(at.x, 0, maxX), Math.min(at.y, FLOOR), now, sc.face, Math.floor(rnd() * 1e6)), 1500)
      return
    }
    dragOn = true
    void ensurePet($) // por si lo sacas de la banda: que el de escritorio esté listo
    // lo agarras por donde haces clic, pero nunca más abajo de la mitad: cuelga de la cabeza
    dragGx = clamp(px - at.x, SPW * 0.2, SPW * 0.8)
    dragGy = clamp(py - at.y, 2, SPH * 0.5)
    dragMoved = 0
    dragX0 = px
    dragY0 = py
    dragT0 = now
    dragLast = now
    dragTrail = [[now, px, py]]
    // al agarrarlo da un tironcito hacia arriba
    await setScene($, drag(at, at.x, Math.max(0, at.y - 6), now, sc.face, Math.floor(rnd() * 1e6), 0, now, 140), 0)
  } else if (type === 'move') {
    if (dragOn) {
      // ¿se perdió el "soltar"? Llegan movimientos sin botón pulsado: se suelta (si no, se quedaría colgado)
      if (String(d.b ?? '') === '') {
        noButtonMoves += 1
        if (noButtonMoves >= 3) {
          await releaseDrag($, sc, now)
          return
        }
      } else noButtonMoves = 0
      // ¿lo sacas de la banda? Hay que tirar de él una distancia más allá del borde (rozarlo no basta); mientras
      // tanto se queda en el borde, y al pasar el umbral sale (con el mismo punto de agarre e inclinación)
      const outside = px < -PULL_OUT_PX || px > wc + PULL_OUT_PX || py < -PULL_OUT_PX || py > HC + PULL_OUT_PX
      // En cuanto lo arrastras de verdad, lo lleva el Clawd de escritorio, que sigue al cursor a 60 fps (redibujar la
      // banda en cada celda del ratón, de ~8x19 px, iba a saltos). Si lo sueltas sobre la barra, vuelve a la banda.
      const lifted = Math.abs(px - dragX0) + Math.abs(py - dragY0) >= LIFT_PX
      const handoff = [dragGx / U, dragGy / U, sc.tilt, sc.face, px, py, wc, HC, outside ? 0 : 1]
      if ((outside || lifted) && (await goOut($, 'grab', handoff, !outside))) return
      const at = posAt(sc, now)
      const tx = clamp(px - dragGx, 0, maxX)
      const ty = clamp(py - dragGy, 0, FLOOR)
      dragMoved = Math.max(dragMoved, Math.abs(px - dragTrail[0][1]) + Math.abs(py - dragTrail[0][2]))
      dragTrail.push([now, px, py])
      if (dragTrail.length > 6) dragTrail.shift()
      // velocidad reciente del ratón: lo inclina hacia atrás, como un muñeco colgando
      const a = dragTrail[Math.max(0, dragTrail.length - 3)]
      const vx = (px - a[1]) / Math.max(0.03, (now - a[0]) / 1000)
      const tilt = clamp(-vx * 0.035, -28, 28)
      const face = tx < at.x - 2 ? -1 : tx > at.x + 2 ? 1 : sc.face
      // el recorrido dura lo que tardó este movimiento: llega justo cuando viene el siguiente (sin tirones)
      const dur = clamp(now - dragLast, 70, 180)
      dragLast = now
      await setScene($, drag(at, tx, ty, now, face, sc.seed, tilt * face, dragT0, dur), 0)
    } else if (sc.kind === 'sleep' || sc.kind === 'yawn') {
      await advance($) // lo despierta el ratón
    } else if (CALM.has(sc.kind)) {
      lookPending = [px, py]
      if (now - lastLookAt >= LOOK_MS) {
        lastLookAt = now
        await lookAt($, sc, posAt(sc, now), px, py, now)
      } else if (!lookTimer) {
        lookTimer = true
        $.clock.after(LOOK_MS, async () => {
          lookTimer = false
          const s2 = await read($, sceneAtom)
          const t = await $.clock.now()
          if (lookPending && CALM.has(s2.kind) && !dragOn) {
            lastLookAt = t
            await lookAt($, s2, posAt(s2, t), lookPending[0], lookPending[1], t)
          }
        })
      }
    }
  } else if (type === 'leave' && !dragOn && sc.gaze.length > 0 && CALM.has(sc.kind)) {
    const left = holdUntil > 0 ? Math.max(400, holdUntil - now) : 0
    await setScene($, { ...sc, gaze: [] }, left)
  } else if (type === 'up' && dragOn) {
    await releaseDrag($, sc, now)
  }
}

/** Lo sueltas: un clic (con su temblor) lo sobresalta; arrastrado y soltado, cae con la velocidad que llevaba. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function releaseDrag($: any, sc: Scene, now: number) {
  dragOn = false
  noButtonMoves = 0
  const at = posAt(sc, now)
  if (dragMoved < CLICK_PX && now - dragT0 < 400) {
    // clic izquierdo sin arrastrar: se sobresalta con un saltito
    await setScene($, poke(at.x, Math.min(at.y, FLOOR), now, sc.face, sc.seed), 1150)
  } else {
    const a = dragTrail[0]
    const b = dragTrail[dragTrail.length - 1]
    const dt = Math.max(60, b[0] - a[0]) / 1000
    const vx = clamp((b[1] - a[1]) / dt, -900, 900)
    const vy = clamp((b[2] - a[2]) / dt, -700, 700)
    const f = fall(at.x, at.y, vx, vy, now, await world($), sc.face, sc.seed)
    await setScene($, f, f.dur + 40)
  }
}

/** La banda cambió de ancho (ventana, barra lateral, panel): si Clawd ha quedado fuera del dibujo, lo recoloca. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fitScene($: any) {
  if (dragOn || (await read($, away))) return
  const maxX = Math.max(0, (await world($)) - SPW)
  const sc = await read($, sceneAtom)
  if (!exceeds(sc, maxX)) return
  const now = await $.clock.now()
  await setScene($, still('idle', clamp(posAt(sc, now).x, 0, maxX), FLOOR, now, sc.face, Math.floor(rnd() * 1e6)), 900)
}

/** Una semilla distinta para cada sesión: dos Clawd abiertos a la vez no deben pasear idénticos. */
function seedFrom(text: string, now: number): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h ^ Math.imul(now & 0xffffff, 2654435761)) >>> 0) || 1
}

/** Se da de alta en el registro de sesiones: toma el hueco libre más bajo (el 0 es el naranja de siempre). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function joinRegistry($: any) {
  const now = await $.clock.now()
  try {
    sid = String(await $.session.id())
  } catch {
    sid = ''
  }
  sidTag = sid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || String(now % 1_000_000_007)
  seed = seedFrom(sid + sidTag, now)
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    regDir = home ? `${String(home).replace(/\\/g, '/')}/.claude/clawd-band` : ''
  } catch {
    regDir = ''
  }
  try {
    mySlot = regDir ? await claimSlot($, regDir, sid || sidTag) : 0
  } catch {
    mySlot = 0 // sin registro (no se puede escribir): naranja, como siempre
  }
  await update($, slotAtom, () => mySlot)
}

/** Renueva el hueco; si otra sesión se lo quedó (el PC durmió), toma otro y avisa al Clawd de escritorio del cambio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function slotBeat($: any) {
  if (!regDir) return
  try {
    const n = await beatSlot($, regDir, sid || sidTag, mySlot)
    if (n !== mySlot) {
      mySlot = n
      await update($, slotAtom, () => n)
      if (petReady) await tellPet($, `color ${n}`)
    }
  } catch {
    // el registro no es imprescindible
  }
}

// Si la cadena de decisiones se parase (p. ej. tras un error), la retoma.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function watchdog($: any) {
  if (dragOn && (await $.clock.now()) - dragLast > 120_000) dragOn = false // por seguridad (quieto es normal: lo sostienes)
  if (dragOn || (await read($, away))) return
  const sc = await read($, sceneAtom)
  if (sc.kind === 'sleep' || sc.kind === 'type') return
  if ((await $.clock.now()) - lastSceneAt > 15000) await advance($)
}

const HELP = t('/clawd: dormir · despertar · fuera · casa · ocultar · mostrar · mini', '/clawd: sleep · wake · out · home · hide · show · mini')

// los comandos valen en los dos idiomas
const ALIAS: Record<string, string> = { sleep: 'dormir', wake: 'despertar', out: 'fuera', home: 'casa', hide: 'ocultar', show: 'mostrar' }

// ── el mod ──────────────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    epoch = await $.clock.now()
    await joinRegistry($)
    await update($, away, () => false) // al recargar, el de escritorio se cierra: Clawd está en casa
    await update($, near, () => false)
    await update($, dockAt, () => 0)
    await update($, bandH, () => HC)
    await $.command.register({ name: 'clawd', description: t('Clawd: dormir, despertar, fuera, casa, ocultar, mostrar o mini', 'Clawd: sleep, wake, out, home, hide, show or mini') })
    $.clock.after(1500, () => void greet($)) // saluda al empezar
    $.clock.every(5000, () => void watchdog($))
    $.clock.every(SLOT_BEAT_MS, () => void slotBeat($))
    void ensurePet($) // compila (solo la primera vez tarda) y deja listo el Clawd de escritorio, escondido
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      if (regDir) await releaseSlot($, regDir, sid || sidTag, mySlot) // el hueco (y el color) queda libre al momento
    } catch {
      // no pasa nada: caduca solo
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Sin texto en la conversación (no gasta tokens): responde con un aviso flotante.
  on('command.run', { command: 'clawd' }, async ($, e) => {
    const raw = e.args.trim().toLowerCase()
    const arg = ALIAS[raw] ?? raw
    const now = await $.clock.now()
    const sc = await read($, sceneAtom)
    const x = clamp(posAt(sc, now).x, 0, Math.max(0, (await world($)) - SPW))
    if (arg === 'dormir') {
      await setScene($, still('yawn', x, FLOOR, now, sc.face, sc.seed), 1000)
      $.ui.toast(t('Clawd se echa una siesta 💤', 'Clawd takes a nap 💤'))
    } else if (arg === 'despertar') {
      await touch($)
      await greet($)
    } else if (arg === 'fuera') {
      await ensurePet($)
      for (let i = 0; i < 40 && !petReady; i++) await $.clock.sleep(100)
      if (!(await goOut($, 'drop'))) $.ui.toast(t('Clawd no ha podido salir al escritorio (solo funciona en Windows)', "Clawd couldn't go out to the desktop (Windows only)"))
    } else if (arg === 'casa') {
      if (await read($, away)) await tellPet($, 'home')
    } else if (arg === 'ocultar' || arg === 'mostrar') {
      await update($, hidden, () => arg === 'ocultar')
      if (arg === 'mostrar') await greet($)
    } else if (arg === 'mini') {
      const isOn = !(await read($, mini))
      await update($, mini, () => isOn)
      $.ui.toast(isOn ? t('Mini Clawd: encendido', 'Mini Clawd: on') : t('Mini Clawd: apagado', 'Mini Clawd: off'))
    } else {
      $.ui.toast(HELP)
    }
    return {}
  })

  on('ui.message', async ($, e, next) => {
    const d: unknown = e.data
    if (e.element === 'clawd-input' && d !== null && typeof d === 'object' && !Array.isArray(d)) {
      const rec = d as Record<string, unknown>
      if (rec.k === 'geo') await onGeo($, rec)
      else if (rec.k === 'ptr') {
        // un evento detrás de otro: si se solaparan, un "mover" retrasado podía pisar el "soltar" y dejarlo colgado
        if (rec.type === 'move') latestMove = rec
        ptrQueue = ptrQueue
          .then(() => (rec.type === 'move' && latestMove !== rec && dragOn ? undefined : onPointer($, rec))) // un movimiento atrasado sobra
          .catch(() => undefined)
        await ptrQueue
      }
    } else if (e.element === 'clawd') {
      // diagnóstico de la versión de terminal
      await note($, `[${e.surface}] ${JSON.stringify(d)}`)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    if (e.inputText !== '' || e.end > e.start) {
      lastEdit = await $.clock.now()
      if (!(await read($, typing))) await startTyping($)
      $.clock.after(2100, () => void stopTypingIfQuiet($))
    }
    const ran = await next(e)
    // los ojos siguen el cursor de texto (con el texto ya editado), como mucho cada LOOK_MS; si escribes más
    // rápido, una última actualización con lo último que escribiste
    if (await read($, typing)) {
      lastText = String(ran.text ?? e.text)
      lastCursor = Number(ran.cursor ?? e.cursor)
      const now = await $.clock.now()
      if (now - caretAt >= LOOK_MS) {
        caretAt = now
        await followCaret($, lastText, lastCursor)
      } else if (!caretTimer) {
        caretTimer = true
        $.clock.after(LOOK_MS, async () => {
          caretTimer = false
          caretAt = await $.clock.now()
          await followCaret($, lastText, lastCursor)
        })
      }
    }
    // con Clawd fuera: se acerca a la barra de escribir con curiosidad (le decimos por dónde va el cursor)
    if (petReady && (e.inputText !== '' || e.end > e.start) && (await read($, away))) {
      petText = String(ran.text ?? e.text)
      petCursor = Number(ran.cursor ?? e.cursor)
      const now = await $.clock.now()
      if (now - petTypeAt >= PET_TYPE_MS) {
        petTypeAt = now
        await tellTyping($)
      } else if (!petTypeTimer) {
        petTypeTimer = true
        $.clock.after(PET_TYPE_MS, async () => {
          petTypeTimer = false
          petTypeAt = await $.clock.now()
          await tellTyping($)
        })
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    const byUser = isUserTurn(e.origin)
    if (byUser) turnByUser = true
    else if (!turnActive) turnByUser = false // una notificación despierta a Claude solo: no es "tu" turno
    if (byUser) {
      lastEdit = 0
      await update($, typing, () => false)
    }
    await touch($)
    const sc = await read($, sceneAtom)
    if (byUser && !dragOn && sc.kind !== 'fall' && sc.kind !== 'land' && !(await read($, away))) {
      // al enviar: saltito y el mensaje sale volando
      const now = await $.clock.now()
      const x = clamp(posAt(sc, now).x, 0, Math.max(0, (await world($)) - SPW))
      await setScene($, send(x, now, sc.face, Math.floor(rnd() * 1e6)), SEND_MS)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e) // un subagente: el turno principal sigue igual
    turnActive = true
    toolGen += 1
    await setMood($, 'thinking')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    toolGen += 1
    const mine = toolGen
    await setMood($, isWeb(e.tool) ? 'web' : 'tool', e.tool)
    const ran = await next(e)
    const hasFailed = ran.deny !== undefined || ran.isError === true
    if (hasFailed) await setMood($, 'fail')
    else await sparkle($) // ha completado un subproceso: estrellitas
    // vuelve a "pensando" con un pequeño retardo: en una ráfaga de herramientas no parpadea entre estados (y a las
    // estrellitas les da tiempo de acabar)
    $.clock.after(hasFailed ? 1800 : 1150, () => {
      if (toolGen === mine) void setMood($, 'thinking')
    })
    return ran
  }).catch(($, e, next) => next(e)) // un fallo del adorno nunca debe romper la herramienta

  // Claude te pide permiso (justo cuando la app enseñaría "¿Permitir?") y Clawd está fuera: levanta las manitas
  // con sus botones para contestar desde el escritorio. Espera tu respuesta (hasta 3 min); "Claude", sin
  // respuesta o si se cancela el turno: sigue el diálogo de siempre en la app.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (!(await read($, away)) || !petReady) return next(e)
    askSeq += 1
    const id = askSeq
    const { exe, cmd } = petPaths($)
    // con un trozo al azar: nadie puede adivinar el nombre y aprobar un permiso escribiendo "allow" en él
    const nonce = `${Math.floor(rnd() * 0xffffffff).toString(36)}${Math.floor(rnd() * 0xffffffff).toString(36)}`
    const answerFile = cmd.replace(/cmd-[^/]*\.txt$/, `answer-${sidTag}-${id}-${nonce}.txt`)
    await tellPet($, `ask ${id} ${enc(shortTool(e.tool_name))} ${enc(askSummary(e.tool_input))} ${enc(answerFile)}`)
    // si el turno se cancela mientras espera, se deja de esperar (y se quita el aviso)
    pendingAnswers.add(answerFile)
    const stop = () => void $.fs.write(answerFile, 'app')
    next.signal.addEventListener('abort', stop)
    let answer = ''
    try {
      const r = await $.process.run([exe, '--wait', answerFile, '180'], { timeoutMs: 185_000 })
      answer = r.stdout.trim()
    } catch (err) {
      await note($, `permiso: ${String(err)}`)
    }
    next.signal.removeEventListener('abort', stop)
    pendingAnswers.delete(answerFile)
    await tellPet($, `askdone ${id}`)
    if (answer === 'allow') return { decision: { behavior: 'allow' as const } }
    if (answer === 'deny') return { decision: { behavior: 'deny' as const, message: 'La persona lo ha rechazado desde Clawd' } }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // un subagente que acaba no es Claude que termina (sin esto celebraba y avisaba antes de tiempo)
    if (e.agentId) return next(e)
    toolGen += 1
    const mine = toolGen
    turnActive = false
    const now = await $.clock.now()
    if (e.reason === 'answer' && turnByUser && now - lastDoneAt > DONE_COOLDOWN_MS) {
      lastDoneAt = now
      await setMood($, 'done')
      // te avisa: si está paseando, con un bocadillo; si no y no estás mirando Claude, asomándose por la esquina
      if (petReady) await tellPet($, 'done')
    } else if (e.reason === 'answer') {
      await setMood($, 'idle') // un turno que no pediste (tarea en segundo plano...) o repetido: sin celebrar
    } else if (e.reason === 'aborted') {
      await setMood($, 'idle') // lo has parado tú: ni celebra ni avisa
    } else {
      await setMood($, 'fail') // un error o una negativa: se sacude
    }
    $.clock.after(1950, () => {
      if (toolGen === mine) void setMood($, 'idle')
    })
    turnByUser = true // el siguiente turno cuenta como tuyo salvo que algo diga lo contrario
    return next(e)
  })

  // la fila de "trabajando" del escritorio: un Clawd diminuto delante de lo que está haciendo
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || (await read($, hidden)) || !(await read($, mini))) return next(e)
    const { Box, Svg, Text } = $.ui.resolve(e)
    const words = `${e.props.message ?? e.props.word}${e.props.suffix}`
    const elapsed = ((await $.clock.now()) - epoch) / 1000
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg source={miniOf(e.props.mode, (await read($, mood)) === 'web', elapsed, await read($, slotAtom))} alt="Clawd" width={22} height={18} />
        <Text dimColor>{words}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // las encuestas tienen prioridad sobre la banda; y si está paseando por el escritorio, la banda queda libre
    if (e.props.hasSurvey || (await read($, hidden))) return next(e)
    const bh = Math.max(1, await read($, bandH)) // ojo: `h` es la función de JSX
    const inputRows = Math.max(1, Math.round(bh / 19))
    if (await read($, away)) {
      // Clawd está fuera: su sitio vacío (con la pista de "aquí cae" si lo acercas)
      if (e.surface !== 'desktop') return next(e)
      bodyCols = e.props.bodyColumns // también fuera: hace falta para saber por dónde escribes
      const { Box, Svg, Client } = $.ui.resolve(e)
      const wcAway = worldWidth(await read($, cellPxAtom), e.props.bodyColumns)
      return (
        <Box flexDirection="row">
          <Box position="relative">
            <Svg source={await dockOf($, wcAway)} alt={t('Clawd está fuera (clic para llamarlo)', 'Clawd is away (click to call him back)')} width={wcAway} height={bh} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="column">
              <Client key="clawd-input" module="./clawd-input.tsx" width="100%" flexGrow={1} props={{ wc: wcAway, active: false, rows: inputRows }} />
            </Box>
          </Box>
        </Box>
      )
    }

    const m = await read($, mood)
    const name = await read($, tool)
    const sc = await read($, sceneAtom)
    const cellPx = await read($, cellPxAtom)
    const label = labelFor(m, name)
    bodyCols = e.props.bodyColumns

    // terminal: Clawd de celdas de texto (sin SVG en la terminal)
    if (e.surface === 'terminal') {
      const rows = Math.max(4, Math.min(TERMINAL_ROWS, Math.floor(e.props.maxRows) || TERMINAL_ROWS))
      const { Client } = $.ui.resolve(e)
      return <Client key="clawd" module="./clawd-client.tsx" width="100%" height={rows} props={{ mood: m, label, rows, slot: await read($, slotAtom) }} />
    }

    // escritorio: SVG nítido y animado + capa transparente que recoge el ratón (también al pasar, para mirarte)
    if (e.surface === 'desktop') {
      const wc = worldWidth(cellPx, bodyCols)
      const now = await $.clock.now()
      const { Box, Svg, Client } = $.ui.resolve(e)
      return (
        <Box flexDirection="row">
          <Box position="relative">
            <Svg source={sceneOf(sc, m, label, wc, now, await read($, slotAtom))} alt={`Clawd${label ? ', ' + label : ''}`} width={wc} height={bh} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="column">
              <Client key="clawd-input" module="./clawd-input.tsx" width="100%" flexGrow={1} props={{ wc, active: true, rows: inputRows }} />
            </Box>
          </Box>
        </Box>
      )
    }

    // VS Code y móvil: SVG sin interacción
    const { Svg } = $.ui.resolve(e)
    return <Svg source={tint(sceneSvg(still('idle', 8, FLOOR, 0, 1, 1), m, label, 200), await read($, slotAtom))} alt="Clawd" width={200} height={HC} />
  })
}
