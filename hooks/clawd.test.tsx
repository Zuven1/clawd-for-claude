import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clawd-band',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 98, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

const IN = { in: 'clawd-input' }

// la escena del SVG: lo que hay en translate(x y) del sprite
const sceneOf = (found: { props?: { source?: string } } | undefined) => found?.props?.source ?? ''
const widthOf = (found: { props?: { width?: number } } | undefined) => found?.props?.width ?? 0

test('desktop: arranca solo, se calibra, se agarra, se arrastra y cae', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const first = await ui.find({ type: 'Svg' })
  expect(first).toBeDefined()
  expect(widthOf(first)).toBe(240) // sin calibrar: lienzo pequeño y seguro

  // la capa de entrada mide 30 columnas para 240 px => 8 px por celda; la banda tiene 98 columnas
  await ui.post({ k: 'geo', cols: 30, rows: 6, wc: 240 }, IN)
  await clock.settle()
  const calibrated = await ui.find({ type: 'Svg' })
  expect(widthOf(calibrated)).toBe(Math.floor(97 * 8)) // 776: toda la banda

  // arranca solo: pasado 1,5 s decide su primera acción
  const before = sceneOf(calibrated)
  await clock.advance(1600)
  await ui.post({ k: 'geo', cols: 97, rows: 6, wc: 776 }, IN) // fuerza otro dibujo
  const afterStart = sceneOf(await ui.find({ type: 'Svg' }))
  expect(afterStart.length).toBeGreaterThan(500)

  // agarrar: el sprite está hacia el centro del lienzo (x≈120 px => celda 15); y arriba/abajo
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, cols: 97, rows: 6, wc: 776, b: 'left' }, IN)
  await clock.settle()
  const grabbed = sceneOf(await ui.find({ type: 'Svg' }))
  await ui.post({ k: 'ptr', type: 'move', x: 40, y: 1, cols: 97, rows: 6, wc: 776, b: 'left' }, IN)
  await clock.settle()
  const dragged = sceneOf(await ui.find({ type: 'Svg' }))
  expect(dragged).not.toBe(grabbed)
  await ui.post({ k: 'ptr', type: 'up', x: 40, y: 1, cols: 97, rows: 6, wc: 776, b: 'left' }, IN)
  await clock.advance(700)
  const fell = sceneOf(await ui.find({ type: 'Svg' }))
  expect(fell).not.toBe(dragged)
  expect(before).not.toBe(fell)
  await ui.unmount()
})

test('terminal: cliente de celdas; vscode y móvil: SVG fijo', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    if (surface === 'terminal') expect(await ui.find({ key: 'clawd' })).toBeDefined()
    else expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

test('escribir: Clawd se queda quieto y mira hacia abajo; al parar, vuelve a lo suyo', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const idle = sceneOf(await ui.find({ type: 'Svg' }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edit = (text: string) => ($ as any).prompt.edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: 'h' })
  await edit('')
  await clock.settle()
  const typing = sceneOf(await ui.find({ type: 'Svg' }))
  expect(typing).not.toBe(idle)
  expect(typing).toContain('?') // el signo de curiosidad de la escena de escribir

  await clock.advance(2600) // deja de escribir
  await ui.post({ k: 'geo', cols: 30, rows: 6, wc: 240 }, IN) // fuerza otro dibujo
  const back = sceneOf(await ui.find({ type: 'Svg' }))
  expect(back).not.toContain('?')
  await ui.unmount()
})

test('al escribir, los ojos siguen el cursor de texto; /clawd no deja texto en la conversación', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.post({ k: 'geo', cols: 97, rows: 6, wc: 776 }, IN)
  await clock.settle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edit = (text: string) => ($ as any).prompt.edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: 'h' })
  await edit('')
  await clock.settle()
  const atStart = sceneOf(await ui.find({ type: 'Svg' }))
  await edit('x'.repeat(70)) // el cursor ya va muy a la derecha
  await clock.advance(200) // la mirada se actualiza como mucho cada 140 ms: llega la última
  const further = sceneOf(await ui.find({ type: 'Svg' }))
  expect(further).not.toBe(atStart)
  await ui.unmount()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = await ($ as any).command.run({ command: 'clawd', args: 'mini', origin: { kind: 'composer' } })
  expect(out?.text).toBeUndefined()
})

test('te sigue con la mirada al pasar el ratón cerca, y el spinner lleva un Clawd diminuto', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  const before = sceneOf(await ui.find({ type: 'Svg' }))
  // el ratón pasa (sin botón) a la izquierda de Clawd, que está hacia x≈120 px
  await ui.post({ k: 'ptr', type: 'move', x: 5, y: 1, ...G, b: '' }, IN)
  await clock.settle()
  const looking = sceneOf(await ui.find({ type: 'Svg' }))
  expect(looking).not.toBe(before)
  await ui.unmount()

  const sp = await $.ui.mount({
    plugin: 'clawd-band', surface: 'desktop', component: 'Spinner', requestId: 'main',
    props: { word: 'Pensando', message: null, suffix: '…', mode: 'thinking' },
  })
  expect(await sp.find({ type: 'Svg' })).toBeDefined()
  await sp.unmount()
})

test('clic derecho acaricia, clic izquierdo corto sobresalta y arrastrar mueve (con el botón pulsado)', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 7, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  const idle = sceneOf(await ui.find({ type: 'Svg' }))

  // clic derecho sobre Clawd (x≈120 px => celda 15; y≈100 px => fila 5): caricia con corazones rosas
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, wc: 776, b: 'right' }, IN)
  await clock.settle()
  const pet = sceneOf(await ui.find({ type: 'Svg' }))
  expect(pet).toContain('#ff8fb1')
  await clock.advance(1700)

  // clic izquierdo corto: saltito de sorpresa (no es caricia)
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'up', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  const poked = sceneOf(await ui.find({ type: 'Svg' }))
  expect(poked).not.toContain('#ff8fb1')
  expect(poked).not.toBe(idle)
  await clock.advance(1300)

  // arrastrar: agarra con el izquierdo, mueve con el botón pulsado, suelta
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  const grab = sceneOf(await ui.find({ type: 'Svg' }))
  await ui.post({ k: 'ptr', type: 'move', x: 50, y: 1, ...G, b: 'left' }, IN)
  await clock.settle()
  const moved = sceneOf(await ui.find({ type: 'Svg' }))
  expect(moved).not.toBe(grab)
  await ui.post({ k: 'ptr', type: 'up', x: 50, y: 1, ...G, b: 'left' }, IN)
  await clock.advance(800)
  await ui.unmount()
})

test('sacarlo de la banda: sale tal cual lo tenías agarrado y la banda se cierra hacia abajo', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  // el ejecutable ya está compilado y el Clawd de escritorio dice "ready"
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // el de escritorio dice "ready" y, cuando sale, "out"
  let sayOut: () => void = () => undefined
  const outSaid = new Promise<void>(resolve => { sayOut = resolve })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await outSaid
    yield { stream: 'stdout', text: 'out\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN) // cruza el borde de arriba
  await clock.settle()
  expect(writes.some(w => / grab /.test(w))).toBe(false) // aún no: el de la banda tiene que desaparecer primero (sin duplicado)
  await clock.advance(200)
  const grab = writes.find(w => / grab /.test(w))
  expect(grab).toBeDefined()
  expect(grab!.trim().split(' ').length).toBe(11) // n grab gx gy tilt face px py wc hc dentro
  sayOut() // el de escritorio confirma que ha salido
  await clock.advance(500)
  // la banda ya no dibuja a Clawd: primero baja la persiana
  const left = await ui.find({ type: 'Svg' })
  expect(left).toBeDefined()
  expect(sceneOf(left).includes('#D97757')).toBe(false)
  expect(sceneOf(left)).not.toContain('<rect') // la banda vacía queda limpia: sin huellitas, sombras ni nada naranja
  expect(sceneOf(left)).not.toContain('<ellipse')
  // y, ya bajada, la banda se minimiza en vertical (suave) hasta una franja: solo cambia la altura, el dibujo es
  // el mismo texto (la app no lo recarga ni reinicia la animación)
  await clock.advance(1500)
  const small = await ui.find({ type: 'Svg' })
  expect((small as { props?: { height?: number } }).props?.height).toBe(26)
  expect(sceneOf(small)).toBe(sceneOf(left))
  await ui.unmount()
})

test('si el de escritorio no confirma que ha salido, Clawd no se pierde: vuelve a la banda', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('fs.write', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // dice "ready" pero luego se queda colgado: nunca dice "out"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN)
  await clock.settle()
  await clock.advance(2500)
  const back = await ui.find({ type: 'Svg' })
  expect(sceneOf(back)).toContain('#D97757') // Clawd está otra vez en la banda
  await ui.unmount()
})

test('un subagente que termina no es Claude que termina: ni celebra ni avisa', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await clock.settle()
  const base = { answer: 'hecho', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', text: '' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const complete = (e: any) => ($ as any).turn.complete(e).catch(() => undefined)
  await complete({ ...base, agentId: 'sub-1' })
  await clock.settle()
  expect(writes.some(w => / done/.test(w))).toBe(false) // el subagente: nada
  await complete(base)
  await clock.settle()
  expect(writes.some(w => / done/.test(w))).toBe(true) // el turno principal: avisa
  await ui.unmount()
})

test('al acercarlo al widget la banda se abre al instante, y al meterlo se queda abierta (sin cerrarse ni reabrirse)', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('fs.write', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // el de escritorio: ready, out, luego "near 1" y, al meterlo, "home"
  const gates: Record<string, () => void> = {}
  const wait = (k: string) => new Promise<void>(resolve => { gates[k] = resolve })
  const gOut = wait('out'), gNear = wait('near'), gHome = wait('home')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await gOut
    yield { stream: 'stdout', text: 'out\n' }
    await gNear
    yield { stream: 'stdout', text: 'near 1\n' }
    await gHome
    yield { stream: 'stdout', text: 'home 0.5\nnear 0\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  const heightOf = async () => ((await ui.find({ type: 'Svg' })) as { props?: { height?: number } }).props?.height ?? 0
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN)
  await clock.settle()
  gates.out()
  await clock.advance(1500)
  expect(await heightOf()).toBe(26) // minimizada, con Clawd fuera

  gates.near() // lo acercas a la barra
  await clock.advance(120)
  expect(await heightOf()).toBeGreaterThan(26) // ya está abriéndose: no espera
  await clock.advance(600)
  expect(await heightOf()).toBe(108) // abierta del todo antes de que entre

  gates.home() // lo metes
  await clock.advance(150)
  const inside = await ui.find({ type: 'Svg' })
  expect(sceneOf(inside)).toContain('#D97757') // Clawd cae dentro
  expect(sceneOf(inside)).not.toContain('keySplines=".4 0 .2 1"') // sin persiana abriéndose otra vez al entrar
  // y se queda abierta: ni se cierra ni se vuelve a abrir mientras esté dentro
  for (const ms of [300, 700, 1500]) {
    await clock.advance(ms)
    expect(await heightOf()).toBe(108)
  }
  await ui.unmount()
})

test('al completar una herramienta con el portátil salen estrellitas (y con el libro, no)', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('fs.write', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    await new Promise(() => undefined)
  })
  // la herramienta termina bien
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as any)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.post({ k: 'geo', cols: 97, rows: 6, wc: 776 }, IN)
  await clock.settle()
  const none = sceneOf(await ui.find({ type: 'Svg' }))
  expect(none).not.toContain('#fff3c0') // sin herramientas, sin estrellas

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(100)
  const stars = sceneOf(await ui.find({ type: 'Svg' }))
  expect(stars).toContain('#fff3c0') // las estrellitas, donde van las partículas azules

  await clock.advance(5000) // pasan: ya no hay estrellas
  expect(sceneOf(await ui.find({ type: 'Svg' }))).not.toContain('#fff3c0')

  // con el libro (internet) no hay estrellitas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ($ as any).tool.call({ tool: 'WebSearch', query: 'x' }).catch(() => undefined)
  await clock.advance(100)
  expect(sceneOf(await ui.find({ type: 'Svg' }))).not.toContain('#fff3c0')
  await ui.unmount()
})

test('con Clawd fuera, al escribir en la app se le avisa por dónde va el cursor para que se acerque a la barra', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  on('prompt.edit', (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  let sayOut: () => void = () => undefined
  const outSaid = new Promise<void>(resolve => { sayOut = resolve })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await outSaid
    yield { stream: 'stdout', text: 'out\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edit = (text: string) => ($ as any).prompt.edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: 'h' })

  // con Clawd en la banda no se le avisa a nadie
  await edit('')
  await clock.advance(400)
  expect(writes.some(w => / type /.test(w))).toBe(false)

  // lo sacas, y al escribir se le avisa de por dónde va el cursor (0 = principio de la barra, 1 = final)
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN)
  await clock.advance(300)
  sayOut()
  await clock.advance(1500)
  await edit('x'.repeat(10))
  await clock.advance(300)
  const near = /(?:^|\n)\d+ type (\d\.\d{3})/.exec(writes[writes.length - 1] ?? '')
  expect(near).not.toBeNull()
  const f1 = Number(near![1])
  await edit('x'.repeat(60)) // sigue escribiendo, más a la derecha
  await clock.advance(400)
  const lines = (writes[writes.length - 1] ?? '').trim().split('\n').filter(l => / type /.test(l))
  const f2 = Number(/ type (\d\.\d{3})/.exec(lines[lines.length - 1] ?? '')![1])
  expect(f2).toBeGreaterThan(f1) // el cursor va más lejos: Clawd lo sigue
  await ui.unmount()
})

import { FLOOR, sceneSvg, still } from './scene'

test('escribiendo: se inclina hacia el lado del cursor en pantalla, también si se gira (no se invierte)', async () => {
  const lean = (face: number, gx: number) => {
    const sc = { ...still('type', 200, FLOOR, 0, face, 1), gaze: [gx, 0.5], gazeFrom: [gx, 0.5] }
    const m = /rotate\((-?[\d.]+)\)/.exec(sceneSvg(sc, 'idle', '', 776, 0))
    return m ? Number(m[1]) : 0
  }
  expect(lean(1, 0.6)).toBeGreaterThan(0) // cursor a la derecha: hacia la derecha...
  expect(lean(-1, 0.6)).toBeGreaterThan(0) // ...mire hacia donde mire
  expect(lean(1, -0.6)).toBeLessThan(0)
  expect(lean(-1, -0.6)).toBeLessThan(0)
  expect(lean(1, 0.1)).toBe(0) // justo encima: derecho
})

import { isUserTurn, nextScene } from './scene'

test('«listo» solo se celebra en el turno que pediste tú, no en notificaciones ni tareas en segundo plano', async () => {
  for (const kind of ['composer', 'bridge', 'sdk', 'channel', 'unclassified']) expect(isUserTurn({ kind })).toBe(true)
  expect(isUserTurn({ kind: 'plugin', asUser: true })).toBe(true) // la cajita de Clawd habla como tú
  expect(isUserTurn(undefined)).toBe(true) // sin dato: mejor un aviso de más
  for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'projects-relay', 'coordinator', 'observer', 'observer-activity', 'auto-continuation', 'slack-ping'])
    expect(isUserTurn({ kind })).toBe(false)
  expect(isUserTurn({ kind: 'plugin' })).toBe(false) // otro plugin que escribe en su nombre
})

test('«listo» no se pierde si Claude termina mientras Clawd está ocupado: celebra al acabar lo que hacía', async () => {
  const pick = (prevKind: Parameters<typeof still>[0], mood: 'done' | 'idle', typing = false) =>
    nextScene({ mood, typing, prev: still(prevKind, 100, FLOOR, 0, 1, 1), now: 0, wc: 776, rnd: () => 0.5, idleMs: 0 }).scene.kind
  expect(pick('send', 'done')).toBe('cheer') // acaba de enviar
  expect(pick('land', 'done')).toBe('cheer') // acaba de aterrizar
  expect(pick('walk', 'done')).toBe('cheer')
  expect(pick('cheer', 'done')).not.toBe('cheer') // y no celebra dos veces seguidas
  expect(pick('send', 'done', true)).toBe('type') // si estás escribiendo, no le quita la atención
  expect(pick('send', 'idle')).not.toBe('cheer') // sin «listo», nada
})

test('dos respuestas seguidas no hacen celebrar ni avisar dos veces', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await clock.settle()
  const base = { answer: 'hecho', durationMs: 10, isAborted: false, reason: 'answer', text: '' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const complete = (turnId: string) => ($ as any).turn.complete({ ...base, turnId }).catch(() => undefined)
  const dones = () => (writes[writes.length - 1] ?? '').split('\n').filter(l => /^\d+ done$/.test(l)).length // solo la orden "done" (no "mood done")
  await complete('t1')
  await clock.advance(500)
  expect(dones()).toBe(1)
  await complete('t2') // otra respuesta enseguida (algo en segundo plano): no vuelve a avisar
  await clock.advance(500)
  expect(dones()).toBe(1)
  await clock.advance(5000)
  await complete('t3') // pasado un rato, una respuesta nueva sí
  await clock.advance(500)
  expect(dones()).toBe(2)
  await ui.unmount()
})

import { exceeds } from './scene'

// destino (x,y) del recorrido de arrastre que lleva el dibujo (el de la curva suave de seguirte el ratón)
const dragTarget = (svg: string) => {
  const m = /type="translate" values="[-\d.]+ [-\d.]+;([-\d.]+) ([-\d.]+)"[^>]*keySplines="\.3 0 \.2 1"/.exec(svg)
  return m ? `${m[1]},${m[2]}` : ''
}
const spriteX = (svg: string) => {
  const m = /<g transform="translate\(([-\d.]+) [-\d.]+\)"><g transform="scale\(/.exec(svg)
  return m ? Number(m[1]) : NaN
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setup = (on: any) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('fs.write', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }) as never)
}

test('exceeds: detecta cuándo un recorrido se sale de una banda más estrecha', async () => {
  const wide = { ...still('walk', 600, FLOOR, 0, 1, 1), path: [100, FLOOR, 600, FLOOR] }
  expect(exceeds(wide, 719)).toBe(false) // cabe en la banda ancha
  expect(exceeds(wide, 344)).toBe(true) // la banda se estrecha: se sale por la derecha
  expect(exceeds(still('idle', 344, FLOOR, 0, 1, 1), 344)).toBe(false) // justo en el límite, bien
})

test('mantenerlo quieto en la mano no lo suelta (el vigilante ya no lo da por perdido a los 4 s)', async ($, on) => {
  setup(on)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'move', x: 40, y: 3, ...G, b: 'left' }, IN)
  await clock.settle()
  const first = dragTarget(sceneOf(await ui.find({ type: 'Svg' })))
  expect(first).not.toBe('')
  await clock.advance(9000) // lo sostienes quieto: pasan dos vigilancias
  await ui.post({ k: 'ptr', type: 'move', x: 70, y: 2, ...G, b: 'left' }, IN)
  await clock.settle()
  const second = dragTarget(sceneOf(await ui.find({ type: 'Svg' })))
  expect(second).not.toBe(first) // sigue en tu mano: lo has movido y lo sigue
  await ui.unmount()
})

test('un clic con un pequeño temblor sigue siendo un clic (no lo deja caer)', async ($, on) => {
  setup(on)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: 4, ...G, b: 'left' }, IN) // una fila de temblor (~19 px)
  await ui.post({ k: 'ptr', type: 'up', x: 17, y: 4, ...G, b: 'left' }, IN)
  await clock.settle()
  // el saltito de sorpresa lleva su propia curva de aplastarse; la caída no
  expect(sceneOf(await ui.find({ type: 'Svg' }))).toContain('keyTimes="0;0.2;0.28;0.5;0.7;0.9;0.95;1"')
  await ui.unmount()
})

test('si se pierde el «soltar», se nota (movimientos sin botón) y se suelta: no se queda colgado', async ($, on) => {
  setup(on)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'move', x: 40, y: 2, ...G, b: 'left' }, IN)
  await clock.settle()
  expect(sceneOf(await ui.find({ type: 'Svg' }))).toContain('values="-3;3;-3"') // colgando de la mano
  for (let i = 0; i < 4; i++) await ui.post({ k: 'ptr', type: 'move', x: 41 + i, y: 2, ...G, b: '' }, IN) // ya sin botón
  await clock.advance(1500)
  expect(sceneOf(await ui.find({ type: 'Svg' }))).not.toContain('values="-3;3;-3"') // ya no cuelga
  await ui.unmount()
})

test('arrastrarlo dentro de la banda se lo pasa al de escritorio (mismo agarre, dentro de la banda)', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_: unknown, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 24, y: 5, ...G, b: 'left' }, IN)
  await clock.advance(300)
  const grab = writes.flatMap(w => w.split('\n')).find(l => / grab /.test(l))
  expect(grab).toBeDefined() // lo lleva el Clawd de escritorio
  expect(grab!.endsWith(' 1')).toBe(true) // y sabe que sigue sobre la banda (no ha salido de ella)
  // el resto del arrastre ya no lo atiende la banda: soltar o mover no crea otra orden de agarre
  const n = writes.flatMap(w => w.split('\n')).filter(l => / grab /.test(l)).length
  await ui.post({ k: 'ptr', type: 'move', x: 40, y: 3, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'up', x: 40, y: 3, ...G, b: 'left' }, IN)
  await clock.advance(300)
  expect(writes.flatMap(w => w.split('\n')).filter(l => / grab /.test(l)).length).toBe(n)
  await ui.unmount()
})

test('un clic con un pequeño temblor no levanta a Clawd: sigue siendo un clic en la banda', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_: unknown, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: 4, ...G, b: 'left' }, IN) // una fila de temblor (~19 px)
  await ui.post({ k: 'ptr', type: 'up', x: 17, y: 4, ...G, b: 'left' }, IN)
  await clock.advance(300)
  expect(writes.some(w => / grab /.test(w))).toBe(false)
  await ui.unmount()
})

test('tirar de él más allá del borde también lo saca, sin la marca de "sigue en la banda"', async ($, on) => {
  const writes: string[] = []
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_: unknown, e: any) => {
    writes.push(String(e.text))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await clock.settle()
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN) // de golpe, fuera de la banda
  await clock.advance(300)
  const grab = writes.flatMap(w => w.split('\n')).find(l => / grab /.test(l))
  expect(grab).toBeDefined()
  expect(grab!.endsWith(' 0')).toBe(true)
  await ui.unmount()
})

test('si la banda se estrecha, Clawd no se queda fuera del dibujo: se recoloca', async ($, on) => {
  setup(on)
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const wide = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const G = { cols: 97, rows: 6, wc: 776 }
  await wide.post({ k: 'geo', ...G }, IN)
  await clock.settle()
  // lo llevas hasta el extremo derecho de la banda ancha y lo sueltas
  await wide.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await wide.post({ k: 'ptr', type: 'move', x: 88, y: 5, ...G, b: 'left' }, IN)
  await clock.advance(250) // le da tiempo a llegar a donde lo llevas, antes de soltarlo
  await wide.post({ k: 'ptr', type: 'up', x: 88, y: 5, ...G, b: 'left' }, IN)
  await clock.advance(2500)
  expect(spriteX(sceneOf(await wide.find({ type: 'Svg' })))).toBeGreaterThan(400)
  await wide.unmount()
  // la ventana se estrecha: la banda pasa de 98 a 40 columnas (312 px de lienzo)
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 }, surface: 'desktop' })
  await narrow.post({ k: 'geo', cols: 39, rows: 6, wc: 312 }, IN)
  await clock.advance(500)
  const x = spriteX(sceneOf(await narrow.find({ type: 'Svg' })))
  expect(x).toBeLessThanOrEqual(312 - 56 + 1) // cabe en el lienzo nuevo (y no se ve fuera de él)
  await narrow.unmount()
})

// ── historias: avión de papel, mapa, cascos ──
import { storyFace } from './scene'

test('historias: cada una se dibuja entera, sin NaN, sin etiqueta y con tamaño razonable', async () => {
  for (const kind of ['plane', 'map', 'music'] as const) {
    for (const face of [1, -1]) {
      const svg = sceneSvg(still(kind, 120, FLOOR, 0, face, 1), 'idle', 'Etiqueta', 700, 0)
      expect(svg.includes('NaN') || svg.includes('undefined')).toBe(false)
      expect(svg).toContain('<animate')
      expect(svg).not.toContain('<text') // sin etiqueta junto a Clawd mientras cuenta su historia
      expect(svg.length).toBeLessThan(90_000)
    }
  }
})

test('historias: el avión mira hacia donde hay sitio para volar (y si no cabe, no sale)', async () => {
  expect(storyFace('plane', 20, 700, 1)).toBe(1) // cabe delante: sigue mirando ahí
  expect(storyFace('plane', 600, 700, 1)).toBe(-1) // no cabe delante: vuela hacia atrás
  expect(storyFace('plane', 20, 700, -1)).toBe(1) // no cabe hacia donde miraba
  expect(storyFace('plane', 100, 260, 1)).toBe(0) // banda estrecha: ni delante ni detrás
  expect(storyFace('map', 100, 260, -1)).toBe(-1) // el mapa y los cascos van donde sea
  expect(storyFace('music', 600, 700, 1)).toBe(1)
})

test('historias: salen de vez en cuando, nunca dos seguidas y el avión solo con sitio', async () => {
  const run = (wc: number) => {
    let r = 11
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
    let prev = still('idle', 100, FLOOR, 0, 1, 1)
    const seen: Record<string, number> = {}
    let twice = 0
    for (let i = 0; i < 3000; i++) {
      const p = nextScene({ mood: 'idle', typing: false, prev, now: i * 4000, wc, rnd, idleMs: 1000 })
      seen[p.scene.kind] = (seen[p.scene.kind] ?? 0) + 1
      const isStory = (k: string) => k === 'plane' || k === 'map' || k === 'music'
      if (isStory(prev.kind) && isStory(p.scene.kind)) twice += 1
      prev = p.scene
    }
    return { seen, twice }
  }
  const wide = run(720)
  expect(wide.twice).toBe(0)
  for (const k of ['plane', 'map', 'music']) {
    expect(wide.seen[k] ?? 0).toBeGreaterThan(40) // aparecen...
    expect(wide.seen[k] ?? 0).toBeLessThan(400) // ...pero no a todas horas
  }
  expect(run(150).seen.plane ?? 0).toBe(0) // sin sitio no vuela
})

test('historias: un cambio de ánimo (Claude se pone a pensar) corta la historia', async () => {
  // una historia no es "ocupada": cuando Claude empieza a trabajar, Clawd deja lo que hacía
  let r = 5
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647)
  const prev = still('map', 100, FLOOR, 0, 1, 1)
  const p = nextScene({ mood: 'thinking', typing: false, prev, now: 3000, wc: 720, rnd, idleMs: 0 })
  expect(['map', 'plane', 'music']).not.toContain(p.scene.kind)
})

// ── varias sesiones: colores y registro ──
import { beatSlot, claimSlot, releaseSlot, readClaim, SLOT_STALE_MS } from './slots'
import { PALETTES, paletteOf, tint } from './scene'

// un "$" falso con archivos en memoria y un reloj a mano: lo justo para probar el registro
function fakeEnv() {
  const files = new Map<string, string>()
  let now = 1_000_000
  const $ = {
    clock: { now: async () => now, sleep: async () => undefined },
    fs: {
      read: async (p: string) => {
        const v = files.get(p)
        if (v === undefined) throw new Error('no existe')
        return v
      },
      write: async (p: string, t: string) => void files.set(p, t),
    },
  }
  return { $, files, tick: (ms: number) => void (now += ms) }
}
const DIR = '/reg'

test('colores: la primera sesión es naranja (la de siempre), luego azul, amarilla, blanca...', async () => {
  expect(paletteOf(0).name).toBe('naranja')
  expect(paletteOf(1).name).toBe('azul')
  expect(paletteOf(2).name).toBe('amarillo')
  expect(paletteOf(3).name).toBe('blanco')
  expect(paletteOf(PALETTES.length).name).toBe('naranja') // si hay más sesiones que colores, se repiten
  expect(PALETTES.length).toBeGreaterThanOrEqual(6)
  expect(new Set(PALETTES.map(p => p.body)).size).toBe(PALETTES.length) // ninguno repetido
})

test('colores: el dibujo de la sesión naranja no cambia; el de otra cambia cuerpo y sombra', async () => {
  const svg = sceneSvg(still('idle', 100, FLOOR, 0, 1, 1), 'idle', '', 400, 0)
  expect(tint(svg, 0)).toBe(svg)
  const blue = tint(svg, 1)
  expect(blue).not.toContain('#D97757')
  expect(blue).not.toContain('#B85C3E')
  expect(blue).toContain(paletteOf(1).body)
  expect(blue).toContain(paletteOf(1).shade)
  expect(blue.length).toBe(svg.length) // solo cambian colores
})

test('registro: cada sesión toma el hueco libre más bajo y lo libera al irse', async () => {
  const { $ } = fakeEnv()
  expect(await claimSlot($, DIR, 'A')).toBe(0)
  expect(await claimSlot($, DIR, 'B')).toBe(1)
  expect(await claimSlot($, DIR, 'C')).toBe(2)
  await releaseSlot($, DIR, 'A', 0) // se cierra la primera...
  expect(await claimSlot($, DIR, 'D')).toBe(0) // ...y la siguiente que se abre vuelve a ser naranja
  expect((await readClaim($, DIR, 1))?.sid).toBe('B') // las demás siguen como estaban
})

test('registro: al recargar el mod la sesión conserva su hueco (no cambia de color)', async () => {
  const { $ } = fakeEnv()
  await claimSlot($, DIR, 'A')
  expect(await claimSlot($, DIR, 'B')).toBe(1)
  await releaseSlot($, DIR, 'A', 0) // el 0 queda libre, pero B ya tenía el 1
  expect(await claimSlot($, DIR, 'B')).toBe(1)
})

test('registro: un hueco abandonado (sesión caída, sin renovar) caduca y otra sesión lo toma', async () => {
  const { $, tick } = fakeEnv()
  await claimSlot($, DIR, 'A')
  tick(SLOT_STALE_MS - 1000)
  expect(await claimSlot($, DIR, 'B')).toBe(1) // A aún vive
  tick(2000)
  expect(await claimSlot($, DIR, 'C')).toBe(0) // A dejó de renovar: su hueco caducó
})

test('registro: si dos sesiones se pisan en el mismo hueco, la que lo pierde pasa a otro en el latido', async () => {
  const { $, files } = fakeEnv()
  expect(await claimSlot($, DIR, 'A')).toBe(0)
  files.set(`${DIR}/slot-0.json`, JSON.stringify({ sid: 'B', ts: 1_000_000 })) // B escribió justo después
  expect(await beatSlot($, DIR, 'A', 0)).toBe(1) // A se entera y se pasa al siguiente libre
  expect(await beatSlot($, DIR, 'B', 0)).toBe(0) // B se queda con el suyo
})

test('varias sesiones: la sesión reserva su hueco y habla con su Clawd de escritorio por archivos propios', async ($, on) => {
  const paths: string[] = []
  on('env.get', () => ({ value: 'C:/Users/prueba' }) as never) // el inicio del usuario: ahí va el registro
  on('session.id', () => ({ value: 'abc-123-def' }) as never)
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('fs.write', (_: unknown, e: any) => {
    paths.push(String(e.path))
    return { value: undefined }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on('process.spawn', async function* (): any {
    yield { stream: 'stdout', text: 'ready\n' }
    await new Promise(() => undefined)
  })
  const clock = mock.clock(on, { now: 1000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await clock.settle()
  const G = { cols: 97, rows: 6, wc: 776 }
  await ui.post({ k: 'geo', ...G }, IN)
  await ui.post({ k: 'ptr', type: 'down', x: 17, y: 5, ...G, b: 'left' }, IN)
  await ui.post({ k: 'ptr', type: 'move', x: 17, y: -4, ...G, b: 'left' }, IN) // lo saca: le habla al de escritorio
  await clock.advance(400)
  const norm = (p: string) => p.split(String.fromCharCode(92)).join('/') // barras de Windows
  expect(paths.some(p => /clawd-band\/slot-\d+\.json$/.test(norm(p)))).toBe(true) // su hueco en el registro
  const cmd = paths.filter(p => /\/cmd[^/]*\.txt$/.test(norm(p)))
  expect(cmd.length).toBeGreaterThan(0)
  for (const p of cmd) expect(/cmd-[A-Za-z0-9]+\.txt$/.test(p)).toBe(true) // nunca el cmd.txt compartido de antes
  await ui.unmount()
})
