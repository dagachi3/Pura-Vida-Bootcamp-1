// Lógica de la calculadora de Cuenta Clara.
//
// XLM admite 7 decimales: 1 XLM = 10.000.000 stroops (la unidad mínima).
// Para evitar errores de coma flotante, todo se calcula con enteros (BigInt)
// en stroops y solo se convierte a XLM al mostrar el resultado.

export const DECIMALES_XLM = 7
export const STROOPS_POR_XLM = 10_000_000n

// Máximo que Stellar puede representar (entero de 64 bits con signo).
export const MAX_STROOPS = 9_223_372_036_854_775_807n

// Límite razonable para este prototipo.
const MAX_PERSONAS = 1_000_000n

function leerTotal(texto) {
  const limpio = texto.trim()

  if (limpio === '') {
    return { error: 'Ingresa el total del gasto.' }
  }
  if (limpio.startsWith('-')) {
    return { error: 'El total debe ser mayor que cero.' }
  }

  // Aceptamos punto o coma como separador decimal, pero uno solo
  // y sin separador de miles (evita ambigüedad entre "1.500" y "1,500").
  const separadores = (limpio.match(/[.,]/g) ?? []).length
  if (separadores > 1) {
    return {
      error:
        'Usa un solo separador decimal (punto o coma) y no uses separador de miles.',
    }
  }

  const normalizado = limpio.replace(',', '.')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalizado)) {
    return { error: 'Escribe un número válido, por ejemplo 12.5 o 12,5.' }
  }

  const [entera = '', decimal = ''] = normalizado.split('.')
  if (decimal.length > DECIMALES_XLM) {
    return {
      error: `El XLM admite como máximo ${DECIMALES_XLM} decimales.`,
    }
  }

  const stroops =
    BigInt(entera || '0') * STROOPS_POR_XLM +
    BigInt(decimal.padEnd(DECIMALES_XLM, '0'))

  if (stroops <= 0n) {
    return { error: 'El total debe ser mayor que cero.' }
  }
  if (stroops > MAX_STROOPS) {
    return { error: 'El total supera el máximo que Stellar puede representar.' }
  }

  return { valor: stroops }
}

function leerPersonas(texto) {
  const limpio = texto.trim()

  if (limpio === '') {
    return { error: 'Ingresa el número de personas.' }
  }
  if (!/^\d+$/.test(limpio)) {
    return {
      error: 'El número de personas debe ser un entero positivo (1, 2, 3…).',
    }
  }

  const personas = BigInt(limpio)
  if (personas <= 0n) {
    return { error: 'Debe haber al menos 1 persona.' }
  }
  if (personas > MAX_PERSONAS) {
    return { error: 'Para este prototipo el máximo es 1.000.000 de personas.' }
  }

  return { valor: personas }
}

/**
 * Divide un gasto entre personas usando aritmética entera en stroops.
 *
 * Recibe los valores tal como los escribe la persona (texto).
 * Devuelve:
 *   { ok: true, resultado: { totalStroops, personas, parteStroops, restoStroops } }
 *   { ok: false, errores: { total?, personas? } }
 *
 * Siempre se cumple: parteStroops * personas + restoStroops === totalStroops
 */
export function dividirGasto(totalTexto, personasTexto) {
  const total = leerTotal(totalTexto)
  const personas = leerPersonas(personasTexto)

  const errores = {}
  if (total.error) errores.total = total.error
  if (personas.error) errores.personas = personas.error

  if (!total.error && !personas.error && total.valor < personas.valor) {
    errores.total =
      'El total es muy pequeño para repartirlo: cada persona debe pagar al menos 0,0000001 XLM.'
  }

  if (Object.keys(errores).length > 0) {
    return { ok: false, errores }
  }

  return {
    ok: true,
    resultado: {
      totalStroops: total.valor,
      personas: personas.valor,
      parteStroops: total.valor / personas.valor,
      restoStroops: total.valor % personas.valor,
    },
  }
}

/**
 * Convierte stroops a texto en XLM con siempre 7 decimales,
 * usando el formato de Costa Rica (coma decimal). Ej.: 25123456n -> "2,5123456"
 */
export function formatearXlm(stroops) {
  const entera = stroops / STROOPS_POR_XLM
  const decimal = (stroops % STROOPS_POR_XLM)
    .toString()
    .padStart(DECIMALES_XLM, '0')
  return `${entera.toLocaleString('es-CR')},${decimal}`
}