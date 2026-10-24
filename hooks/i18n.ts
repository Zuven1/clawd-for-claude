// Idioma de los textos: español si Windows está en español; inglés en cualquier otro caso.
export const ES: boolean = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('es')
  } catch {
    return false
  }
})()

/** El texto en el idioma de la persona: `t('hola', 'hello')`. */
export const t = (es: string, en: string): string => (ES ? es : en)
