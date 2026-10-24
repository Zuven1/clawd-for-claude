/** Estado de ánimo de Clawd, según lo que hace la sesión. */
export type Mood = 'idle' | 'thinking' | 'tool' | 'web' | 'ok' | 'fail' | 'done'

export type Kind =
  | 'idle' | 'walk' | 'wave' | 'jump' | 'sleep' | 'yawn' | 'drag' | 'fall'
  | 'land' | 'pet' | 'dizzy' | 'shake' | 'cheer' | 'type' | 'read'
  | 'sit' | 'stretch' | 'look' | 'send' | 'firefly' | 'sneeze' | 'laptop'
  | 'plane' | 'map' | 'music'

/** Una acción de Clawd con principio y fin; el SVG de cada escena se anima solo en la app. */
export type Scene = {
  kind: Kind
  t0: number
  face: number
  faceFrom: number // hacia dónde miraba antes: el giro se anima
  path: number[]
  times: number[] // instantes (0..1) de cada muestra del camino; vacío = reparto uniforme
  ease: boolean // acelera y frena entre las dos muestras (arrastre)
  dur: number
  seed: number
  hard: number
  gaze: number[] // [gx, gy] en -1..1 hacia donde mira (el ratón, el texto); vacío = mira a su aire
  gazeFrom: number[] // hacia dónde miraba antes: los ojos se deslizan de uno a otro
  g0: number // cuándo cambió la mirada o la cara (empieza la transición)
  m0: number // cuándo empieza a recorrer `path` (al arrastrar, cada movimiento; si no, t0)
  tilt: number // inclinación al arrastrarlo (grados), según la velocidad del ratón
  spark: number // cuándo se completó la última herramienta (con el portátil salen estrellitas); 0 = nunca
}

declare module 'claude-code' {
  interface PluginState {
    'clawd-band': {
      mood: Mood
      tool: string
      scene: Scene
      typing: boolean
      cellPx: number
      hidden: boolean
      mini: boolean
      away: boolean // está fuera, paseando por el escritorio
      dockAt: number // cuándo se bajó (o se subió) la persiana de la banda: sus animaciones siguen desde ahí
      bandH: number // alto visible de la banda (px): se minimiza mientras Clawd está fuera
      near: boolean // lo tienes encima de la barra de escribir: la banda se abre para recibirlo
      slot: number // el hueco de esta sesión (0 naranja, 1 azul, 2 amarillo...): el color de su Clawd
    }
  }
}
