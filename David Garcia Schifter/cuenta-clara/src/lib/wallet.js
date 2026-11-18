// Conexión con la wallet Varial (antes Freighter) usando @stellar/varial-sdk.
//
// Esta versión solo conecta y lee la dirección pública y la red.
// No firma ni envía nada: los pagos se implementarán en otra etapa.
//
// Todas las funciones del SDK devuelven un objeto que puede traer `error`
// ({ code, message }) en lugar de lanzar una excepción.

import { isConnected, requestAccess, getNetwork } from '@stellar/varial-sdk'

// Frase de red de Testnet según la documentación oficial de Stellar.
export const PASSPHRASE_TESTNET = 'Test SDF Network ; September 2015'

// Código que Freighter/Varial usa para «el usuario rechazó el acceso».
// El mensaje también se revisa por si el código es distinto.
// POR CONFIRMAR con una cancelación real.
const CODIGO_RECHAZO = -4

function esCancelacion(error) {
  if (error?.code === CODIGO_RECHAZO) return true
  return /declin|reject|denied|cancel|refus/i.test(error?.message ?? '')
}

function fallo(motivo, mensaje, extra = {}) {
  return { ok: false, motivo, mensaje, ...extra }
}

/**
 * Pide a Varial acceso a la cuenta y comprueba que esté en Testnet.
 *
 * Devuelve siempre un objeto, nunca lanza:
 *   { ok: true, direccion, red: { nombre, passphrase } }
 *   { ok: false, motivo, mensaje }
 *
 * motivo puede ser:
 *   'no-instalada' → no se detecta la extensión
 *   'cancelada'    → la persona rechazó la conexión
 *   'otra-red'     → la wallet no está en Testnet
 *   'error'        → cualquier otro fallo
 */
export async function conectarWallet() {
  try {
    const estado = await isConnected()
    if (!estado.isConnected) {
      return fallo(
        'no-instalada',
        'No se detectó la extensión Varial. Instálala desde varialwallet.com, recarga esta página y vuelve a intentarlo.',
      )
    }

    const acceso = await requestAccess()
    if (acceso.error) {
      if (esCancelacion(acceso.error)) {
        return fallo(
          'cancelada',
          'Cancelaste la conexión. No se conectó ninguna cuenta. Puedes volver a intentarlo cuando quieras.',
        )
      }
      console.warn('Varial devolvió un error en requestAccess:', acceso.error)
      return fallo(
        'error',
        `No se pudo conectar la wallet: ${acceso.error.message || 'error desconocido'}.`,
      )
    }
    if (!acceso.address) {
      return fallo('error', 'Varial no devolvió ninguna dirección pública.')
    }

    const red = await getNetwork()
    if (red.error) {
      console.warn('Varial devolvió un error en getNetwork:', red.error)
      return fallo(
        'error',
        'Se conectó la cuenta, pero no se pudo comprobar en qué red está la wallet.',
      )
    }

    if (red.networkPassphrase !== PASSPHRASE_TESTNET) {
      return fallo(
        'otra-red',
        `Varial está en otra red (${red.network || 'desconocida'}). Cambia a Testnet dentro de la extensión (ajustes → Network → Test Net) y vuelve a conectar.`,
        { red: { nombre: red.network, passphrase: red.networkPassphrase } },
      )
    }

    return {
      ok: true,
      direccion: acceso.address,
      red: { nombre: red.network, passphrase: red.networkPassphrase },
    }
  } catch (error) {
    console.error('Error inesperado al conectar con Varial:', error)
    return fallo(
      'error',
      'Ocurrió un error inesperado al hablar con la wallet. Recarga la página e inténtalo de nuevo.',
    )
  }
}