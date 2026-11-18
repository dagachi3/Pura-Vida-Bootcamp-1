// Pago de XLM en Stellar Testnet: arma la transacción, la firma con Varial
// y la envía a la red.
//
// Se hace en tres pasos separados para que la pantalla pueda mostrar el
// avance: prepararPago → firmarPago → enviarPago.
// Ninguna función lanza: todas devuelven { ok: true, ... } o
// { ok: false, motivo, mensaje }.
//
// La clave secreta nunca pasa por esta app: la firma la hace Varial.

import {
  Asset,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk'
import { signTransaction } from '@stellar/varial-sdk'
import { DECIMALES_XLM, STROOPS_POR_XLM } from './dividirGasto.js'

const URL_RPC_TESTNET = 'https://soroban-testnet.stellar.org'
const PASSPHRASE = Networks.TESTNET

// La transacción deja de ser válida 180 segundos después de armarse
// (el valor que usa la guía oficial de Stellar).
const TIEMPO_LIMITE_SEGUNDOS = 180

// Comisión por operación, en stroops: se toma lo que pagan las transacciones
// recientes (percentil 90), con un piso (mínimo de la red) y un tope.
const COMISION_MINIMA = 100
const COMISION_MAXIMA = 100_000

const servidor = new rpc.Server(URL_RPC_TESTNET)

// Mismo criterio que en wallet.js para detectar que la persona rechazó.
// POR CONFIRMAR con una cancelación real al firmar.
const CODIGO_RECHAZO = -4

function esCancelacion(error) {
  if (error?.code === CODIGO_RECHAZO) return true
  return /declin|reject|denied|cancel|refus/i.test(error?.message ?? '')
}

function fallo(motivo, mensaje, extra = {}) {
  return { ok: false, motivo, mensaje, ...extra }
}

function esperar(milisegundos) {
  return new Promise((resolver) => setTimeout(resolver, milisegundos))
}

/**
 * Convierte stroops a texto con punto decimal y siempre 7 decimales,
 * que es el formato que espera Stellar. Ej.: 33333333n -> "3.3333333"
 */
export function stroopsATextoStellar(stroops) {
  const entera = stroops / STROOPS_POR_XLM
  const decimal = (stroops % STROOPS_POR_XLM)
    .toString()
    .padStart(DECIMALES_XLM, '0')
  return `${entera.toString()}.${decimal}`
}

/**
 * Valida la dirección del destinatario antes de mostrar la revisión.
 * Devuelve { ok: true, direccion } o { ok: false, mensaje }.
 */
export function validarDestinatario(texto, origen) {
  const direccion = texto.trim()

  if (direccion === '') {
    return { ok: false, mensaje: 'Ingresa la dirección del destinatario.' }
  }
  if (!StrKey.isValidEd25519PublicKey(direccion)) {
    return {
      ok: false,
      mensaje:
        'La dirección no es válida. Debe empezar con G, tener 56 caracteres y estar en mayúsculas.',
    }
  }
  if (direccion === origen) {
    return {
      ok: false,
      mensaje:
        'El destinatario es la misma cuenta que paga. Usa una cuenta distinta.',
    }
  }
  return { ok: true, direccion }
}

/**
 * Paso 1. Arma el pago sin firmar.
 * Se llama justo después de confirmar la revisión, porque la transacción
 * solo es válida durante 180 segundos.
 *
 * Devuelve { ok: true, xdr } o { ok: false, motivo, mensaje }.
 */
export async function prepararPago({ origen, destino, stroops }) {
  if (typeof stroops !== 'bigint' || stroops <= 0n) {
    return fallo('error', 'El importe a pagar no es válido.')
  }

  let cuentaOrigen
  try {
    cuentaOrigen = await servidor.getAccount(origen)
  } catch (error) {
    console.warn('No se pudo leer la cuenta que paga:', error)
    return fallo(
      'cuenta-origen',
      'No se pudo consultar la cuenta que paga en Testnet. Comprueba que exista, que tenga fondos y que tengas conexión.',
    )
  }

  // Un pago normal no crea cuentas: el destinatario ya debe existir.
  try {
    await servidor.getAccount(destino)
  } catch (error) {
    console.warn('No se pudo leer la cuenta destinataria:', error)
    return fallo(
      'cuenta-destino',
      'No se encontró la cuenta destinataria en Testnet. Debe existir y estar fondeada (por ejemplo con Friendbot).',
    )
  }

  try {
    const { inclusionFee } = await servidor.getFeeStats()
    const recomendada = Number(inclusionFee.p90)
    const comision = Math.trunc(
      Math.min(
        Math.max(
          Number.isFinite(recomendada) ? recomendada : COMISION_MINIMA,
          COMISION_MINIMA,
        ),
        COMISION_MAXIMA,
      ),
    )

    const transaccion = new TransactionBuilder(cuentaOrigen, {
      fee: String(comision),
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: destino,
          asset: Asset.native(),
          amount: stroopsATextoStellar(stroops),
        }),
      )
      .setTimeout(TIEMPO_LIMITE_SEGUNDOS)
      .build()

    return { ok: true, xdr: transaccion.toXDR() }
  } catch (error) {
    console.error('Error al armar el pago:', error)
    return fallo(
      'error',
      'No se pudo preparar el pago. Revisa tu conexión e inténtalo de nuevo.',
    )
  }
}

/**
 * Paso 2. Pide a Varial que firme. Aquí se abre la solicitud de firma.
 *
 * Devuelve { ok: true, xdrFirmado } o { ok: false, motivo, mensaje }.
 */
export async function firmarPago({ xdr, origen }) {
  try {
    const respuesta = await signTransaction(xdr, {
      networkPassphrase: PASSPHRASE,
      address: origen,
    })

    if (respuesta.error) {
      if (esCancelacion(respuesta.error)) {
        return fallo(
          'cancelada',
          'Cancelaste la firma. No se envió ningún pago.',
        )
      }
      console.warn('Varial devolvió un error al firmar:', respuesta.error)
      return fallo(
        'error',
        `No se pudo firmar el pago: ${respuesta.error.message || 'error desconocido'}.`,
      )
    }

    if (respuesta.signerAddress !== origen) {
      return fallo(
        'firmante-distinto',
        'Varial firmó con una cuenta distinta a la conectada. No se envió ningún pago. Conecta de nuevo la cuenta correcta.',
      )
    }

    return { ok: true, xdrFirmado: respuesta.signedTxXdr }
  } catch (error) {
    console.error('Error inesperado al firmar:', error)
    return fallo(
      'error',
      'Ocurrió un error inesperado al hablar con la wallet. No se envió ningún pago.',
    )
  }
}

/**
 * Paso 3. Envía el pago firmado a Testnet y espera el resultado.
 *
 * Devuelve { ok: true, hash } o { ok: false, motivo, mensaje, hash? }.
 * motivo: 'expirada' | 'rechazada' | 'fallida' | 'sin-confirmar' | 'error'
 */
export async function enviarPago({ xdrFirmado }) {
  try {
    const transaccion = TransactionBuilder.fromXDR(xdrFirmado, PASSPHRASE)
    const limite = Number(transaccion.timeBounds?.maxTime ?? 0)

    let envio = await servidor.sendTransaction(transaccion)

    // TRY_AGAIN_LATER: la red no la aceptó esta vez. Se reintenta la misma
    // transacción firmada hasta que venza su tiempo límite.
    while (
      envio.status === 'TRY_AGAIN_LATER' &&
      Number(envio.latestLedgerCloseTime) <= limite
    ) {
      await esperar(2000)
      envio = await servidor.sendTransaction(transaccion)
    }

    if (envio.status === 'TRY_AGAIN_LATER') {
      return fallo(
        'expirada',
        'La red no aceptó el pago a tiempo y la transacción venció. No se movió ningún XLM. Vuelve a intentarlo.',
      )
    }

    // ERROR también aparece si se reenvía algo que ya entró a la red,
    // así que primero se consulta antes de darlo por rechazado.
    if (envio.status === 'ERROR') {
      const conocida = await servidor.getTransaction(envio.hash)
      if (conocida.status === 'NOT_FOUND') {
        console.warn('La red rechazó el pago:', envio.errorResult)
        return fallo(
          'rechazada',
          'La red rechazó el pago. No se movió ningún XLM. Si tardaste mucho en firmar, vuelve a intentarlo.',
        )
      }
    }

    // PENDING y DUPLICATE: la red la tiene; se espera el resultado.
    const final = await servidor.pollTransaction(envio.hash)

    if (final.status === 'SUCCESS') {
      return { ok: true, hash: envio.hash }
    }
    if (final.status === 'FAILED') {
      return fallo(
        'fallida',
        'El pago llegó a la red pero falló. El importe no se transfirió. Revisa el saldo de la cuenta y vuelve a intentarlo.',
        { hash: envio.hash },
      )
    }
    // NOT_FOUND tras esperar: no significa que haya fallado.
    return fallo(
      'sin-confirmar',
      'Todavía no se pudo confirmar el resultado. Eso no significa que haya fallado: el pago puede entrar a la red más tarde. Guarda el identificador de la transacción y compruébalo antes de reintentar.',
      { hash: envio.hash },
    )
  } catch (error) {
    console.error('Error inesperado al enviar el pago:', error)
    return fallo(
      'error',
      'Ocurrió un error inesperado al enviar el pago. Antes de reintentar, revisa el saldo de la cuenta para no pagar dos veces.',
    )
  }
}

// Explorador de Testnet para consultar el comprobante de un pago.
// Solo se abre una página pública de lectura: no firma ni envía nada.
const URL_EXPLORADOR_TESTNET = 'https://stellar.expert/explorer/testnet/tx/'

/**
 * Devuelve la URL del comprobante en Stellar Expert (Testnet), o null si el
 * identificador no tiene formato de hash (64 caracteres hexadecimales).
 */
export function urlComprobante(hash) {
  const limpio = String(hash ?? '').trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(limpio)) return null
  return `${URL_EXPLORADOR_TESTNET}${limpio}`
}
