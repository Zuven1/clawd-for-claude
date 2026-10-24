import type { ClientModule } from 'claude-code'

// Capa transparente encima del SVG de Clawd: no dibuja nada, solo cuenta al módulo de hooks
//  · cuánto mide (columnas y filas) para poder calibrar píxeles por celda,
//  · lo que hace el ratón sobre ella (bajar, mover, soltar).
// El dibujo y la lógica viven en el módulo de hooks; aquí solo se reenvían datos.
//
// La región debe cubrir TODA la altura del lienzo (medido: sin esto solo cubría 1 fila): por eso
// dibuja `rows` filas de relleno invisible y, además, el Client crece con flexGrow.

type Props = { wc: number; active: boolean; rows: number }
type State = { cols: number; rows: number; wc: number; lx: number; ly: number; props: Props }

const NBSP = ' '

const Input: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  let s = surface.state
  if (s === undefined) {
    s = { cols: -1, rows: -1, wc: -1, lx: -1, ly: -1, props }
    surface.setState(s)
    const st = s

    const geo = () => {
      if (surface.columns !== st.cols || surface.rows !== st.rows || st.props.wc !== st.wc) {
        st.cols = surface.columns
        st.rows = surface.rows
        st.wc = st.props.wc
        surface.post({ k: 'geo', cols: surface.columns, rows: surface.rows, wc: st.props.wc })
      }
    }
    surface.every(300, geo)

    surface.onPointer(e => {
      // con un botón pulsado se reenvía SIEMPRE (arrastre); el simple paso del ratón solo si interesa
      const held = e.button !== undefined
      const isHover = !held && (e.type === 'move' || e.type === 'enter' || e.type === 'leave')
      const cur = (surface.state ?? st).props
      if (isHover && !cur.active) return
      if (e.type === 'move' && e.x === st.lx && e.y === st.ly) return // solo cuando cambia de celda
      st.lx = e.x
      st.ly = e.y
      surface.post({
        k: 'ptr', type: e.type, x: e.x, y: e.y, b: e.button ?? '',
        cols: surface.columns, rows: surface.rows, wc: cur.wc,
      })
    })
  }
  s.props = props

  const filler = []
  for (let r = 0; r < Math.max(1, Math.round(props.rows)); r++) {
    filler.push(
      <Box key={String(r)}>
        <Text mono>{NBSP}</Text>
      </Box>,
    )
  }
  return <Box flexDirection="column" width="100%">{filler}</Box>
}

export default Input
