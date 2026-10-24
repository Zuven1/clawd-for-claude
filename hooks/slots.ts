// Registro de sesiones: cada sesión de Claude Code abierta toma un hueco (0, 1, 2...) y, con él, el color de su Clawd.
//
// La primera sesión que se abre se queda con el hueco 0 (naranja, como siempre); la segunda, el 1 (azul); y así. Un
// hueco es un archivo `slot-N.json` con quién lo tiene y cuándo lo renovó por última vez. Mientras la sesión vive
// lo renueva cada pocos segundos; si deja de hacerlo (se cerró, o el PC se durmió) pasados SLOT_STALE_MS cualquiera
// puede tomarlo. Al cerrarse una sesión libera el suyo al momento, así el siguiente que abras vuelve a ser naranja.
// Si dos sesiones se abren en el mismo instante y toman el mismo hueco, en el siguiente latido la que lo perdió
// (porque el archivo ya dice otra cosa) toma el siguiente libre.

export const SLOT_STALE_MS = 15_000
export const SLOT_BEAT_MS = 5_000
const MAX_SLOTS = 64
const SCAN = 16 // cuántos huecos se miran al buscar el que ya era suyo (al recargar el mod)

export type Claim = { sid: string; ts: number }

const file = (dir: string, n: number) => `${dir}/slot-${n}.json`

function parse(text: unknown): Claim | null {
  try {
    const o = JSON.parse(String(text)) as Partial<Claim> | null
    return o && typeof o.sid === 'string' && typeof o.ts === 'number' ? { sid: o.sid, ts: o.ts } : null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readClaim($: any, dir: string, n: number): Promise<Claim | null> {
  try {
    return parse(await $.fs.read(file(dir, n)))
  } catch {
    return null // no existe: libre
  }
}

/** ¿Tiene el hueco otra sesión que sigue viva? */
export const heldByOther = (c: Claim | null, sid: string, now: number) => c !== null && c.sid !== sid && c.sid !== '' && now - c.ts < SLOT_STALE_MS

/**
 * Toma un hueco: el que ya era suyo si lo conserva (al recargar el mod no cambia de color) o, si no, el libre más bajo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimSlot($: any, dir: string, sid: string): Promise<number> {
  const now = await $.clock.now()
  for (let n = 0; n < SCAN; n++) {
    const c = await readClaim($, dir, n)
    if (c !== null && c.sid === sid) {
      await $.fs.write(file(dir, n), JSON.stringify({ sid, ts: now }))
      return n
    }
  }
  for (let n = 0; n < MAX_SLOTS; n++) {
    if (heldByOther(await readClaim($, dir, n), sid, now)) continue
    await $.fs.write(file(dir, n), JSON.stringify({ sid, ts: now }))
    return n
  }
  return 0
}

/** Renueva el hueco (y, si otra sesión se lo quedó mientras tanto, toma otro). Devuelve el que tiene ahora. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function beatSlot($: any, dir: string, sid: string, mine: number): Promise<number> {
  const now = await $.clock.now()
  const c = await readClaim($, dir, mine)
  if (c !== null && c.sid === sid) {
    await $.fs.write(file(dir, mine), JSON.stringify({ sid, ts: now }))
    return mine
  }
  return claimSlot($, dir, sid) // quedó libre o se lo quedó otra: se vuelve a tomar uno
}

/** Libera el hueco al cerrarse la sesión. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseSlot($: any, dir: string, sid: string, mine: number): Promise<void> {
  const c = await readClaim($, dir, mine)
  if (c !== null && c.sid === sid) await $.fs.write(file(dir, mine), JSON.stringify({ sid: '', ts: 0 }))
}
