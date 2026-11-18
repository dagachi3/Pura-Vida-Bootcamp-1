import { useState } from 'react'
import { dividirGasto, formatearXlm } from './lib/dividirGasto.js'
import { conectarWallet } from './lib/wallet.js'
import {
  validarDestinatario,
  prepararPago,
  firmarPago,
  enviarPago,
  urlComprobante,
} from './lib/pago.js'
import './App.css'

const CAMPOS_INICIALES = { concepto: '', total: '', personas: '' }

const WALLET_INICIAL = {
  estado: 'desconectada', // 'desconectada' | 'conectando' | 'conectada' | 'error'
  direccion: '',
  red: '',
  motivo: '',
  mensaje: '',
}

// estado: 'inactivo' | 'revision' | 'preparando' | 'firmando' | 'enviando'
//         | 'exito' | 'error'
const PAGO_INICIAL = {
  estado: 'inactivo',
  datos: null, // lo que se revisó: { origen, destino, stroops, resto }
  motivo: '',
  mensaje: '',
  hash: '',
  permiteReintento: false,
}

// Si el fallo ocurre al enviar, solo es seguro reintentar cuando la red
// confirmó que no se movió ningún XLM.
const MOTIVOS_SIN_RIESGO = ['expirada', 'rechazada']

function textoStroops(cantidad) {
  return `${cantidad.toString()} ${cantidad === 1n ? 'stroop' : 'stroops'}`
}

export default function App() {
  const [campos, setCampos] = useState(CAMPOS_INICIALES)
  const [errores, setErrores] = useState({})
  const [resultado, setResultado] = useState(null)
  const [wallet, setWallet] = useState(WALLET_INICIAL)
  const [destinatario, setDestinatario] = useState('')
  const [errorDestinatario, setErrorDestinatario] = useState('')
  const [pago, setPago] = useState(PAGO_INICIAL)

  async function manejarConexion() {
    setWallet({ ...WALLET_INICIAL, estado: 'conectando' })

    const respuesta = await conectarWallet()

    if (respuesta.ok) {
      setWallet({
        ...WALLET_INICIAL,
        estado: 'conectada',
        direccion: respuesta.direccion,
        red: respuesta.red.nombre,
      })
    } else {
      setWallet({
        ...WALLET_INICIAL,
        estado: 'error',
        motivo: respuesta.motivo,
        mensaje: respuesta.mensaje,
      })
    }
  }

  function manejarCambio(evento) {
    const { name, value } = evento.target
    setCampos((anterior) => ({ ...anterior, [name]: value }))
    // Al editar, el resultado anterior ya no corresponde a lo escrito.
    setResultado(null)
    setErrores({})
  }

  function manejarEnvio(evento) {
    evento.preventDefault()

    const calculo = dividirGasto(campos.total, campos.personas)

    if (!calculo.ok) {
      setErrores(calculo.errores)
      setResultado(null)
      return
    }

    setErrores({})
    setResultado({ ...calculo.resultado, concepto: campos.concepto.trim() })
  }

  function limpiar() {
    setCampos(CAMPOS_INICIALES)
    setErrores({})
    setResultado(null)
  }

  function manejarCambioDestinatario(evento) {
    setDestinatario(evento.target.value)
    setErrorDestinatario('')
  }

  // ---------- Pago ----------

  function iniciarRevision() {
    if (wallet.estado !== 'conectada' || !resultado) return

    const validacion = validarDestinatario(destinatario, wallet.direccion)
    if (!validacion.ok) {
      setErrorDestinatario(validacion.mensaje)
      return
    }

    setErrorDestinatario('')
    // Se guarda una copia de lo que se revisa: es exactamente lo que se paga,
    // aunque después cambie otra cosa en pantalla.
    setPago({
      ...PAGO_INICIAL,
      estado: 'revision',
      datos: {
        origen: wallet.direccion,
        destino: validacion.direccion,
        stroops: resultado.parteStroops,
        resto: resultado.restoStroops,
      },
    })
  }

  function volverAlFormulario() {
    setPago(PAGO_INICIAL)
  }

  function revisarDeNuevo() {
    setPago({ ...PAGO_INICIAL, estado: 'revision', datos: pago.datos })
  }

  async function confirmarYFirmar() {
    const datos = pago.datos
    if (!datos) return

    setPago({ ...PAGO_INICIAL, estado: 'preparando', datos })
    const preparado = await prepararPago({
      origen: datos.origen,
      destino: datos.destino,
      stroops: datos.stroops,
    })
    if (!preparado.ok) {
      setPago({
        ...PAGO_INICIAL,
        estado: 'error',
        datos,
        motivo: preparado.motivo,
        mensaje: preparado.mensaje,
        permiteReintento: true,
      })
      return
    }

    setPago({ ...PAGO_INICIAL, estado: 'firmando', datos })
    const firmado = await firmarPago({
      xdr: preparado.xdr,
      origen: datos.origen,
    })
    if (!firmado.ok) {
      setPago({
        ...PAGO_INICIAL,
        estado: 'error',
        datos,
        motivo: firmado.motivo,
        mensaje: firmado.mensaje,
        permiteReintento: true,
      })
      return
    }

    setPago({ ...PAGO_INICIAL, estado: 'enviando', datos })
    const enviado = await enviarPago({ xdrFirmado: firmado.xdrFirmado })
    if (!enviado.ok) {
      setPago({
        ...PAGO_INICIAL,
        estado: 'error',
        datos,
        motivo: enviado.motivo,
        mensaje: enviado.mensaje,
        hash: enviado.hash ?? '',
        permiteReintento: MOTIVOS_SIN_RIESGO.includes(enviado.motivo),
      })
      return
    }

    setPago({ ...PAGO_INICIAL, estado: 'exito', datos, hash: enviado.hash })
  }

  const hayResto = resultado !== null && resultado.restoStroops > 0n
  const conectando = wallet.estado === 'conectando'
  const walletConectada = wallet.estado === 'conectada'
  const pagoActivo = pago.estado !== 'inactivo'
  const pagoEnCurso = ['preparando', 'firmando', 'enviando'].includes(
    pago.estado,
  )
  const datosPago = pago.datos

  // Solo hay enlace si el pago está confirmado (estado 'exito') y el
  // identificador parece un hash. En pendiente, error o cancelado no se muestra.
  const enlaceComprobante =
    pago.estado === 'exito' ? urlComprobante(pago.hash) : null

  return (
    <main className="app">
      <header className="encabezado">
        <span className="insignia">Prototipo · Stellar Testnet</span>
        <h1 className="titulo">Cuenta Clara</h1>
        <p className="subtitulo">
          Divide un gasto entre varias personas, sin sorpresas en los
          decimales.
        </p>
      </header>

      <section className="tarjeta wallet" aria-label="Wallet">
        <h2 className="wallet__titulo">Wallet</h2>

        <div aria-live="polite">
          {wallet.estado === 'conectada' ? (
            <div className="wallet__conectada">
              <p className="wallet__estado wallet__estado--ok">
                Wallet conectada
                <span className="etiqueta-red">
                  Testnet{wallet.red ? ` · ${wallet.red}` : ''}
                </span>
              </p>
              <p className="wallet__etiqueta">Dirección pública</p>
              <p className="wallet__direccion">{wallet.direccion}</p>
              <p className="ayuda">
                Solo se lee tu dirección pública. Tu clave secreta nunca pasa
                por esta página: la firma la hace Varial.
              </p>
            </div>
          ) : (
            <p className="wallet__estado">
              {conectando
                ? 'Esperando respuesta de Varial…'
                : 'Ninguna wallet conectada.'}
            </p>
          )}

          {wallet.estado === 'error' && (
            <div
              className={`mensaje-wallet mensaje-wallet--${wallet.motivo}`}
              role="alert"
            >
              <p>{wallet.mensaje}</p>
              {wallet.motivo === 'no-instalada' && (
                <p>
                  <a
                    href="https://varialwallet.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ir a varialwallet.com
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        {wallet.estado !== 'conectada' && (
          <button
            type="button"
            className="boton boton--principal"
            onClick={manejarConexion}
            disabled={conectando}
          >
            {conectando
              ? 'Conectando…'
              : wallet.estado === 'error'
                ? 'Intentar de nuevo'
                : 'Conectar wallet'}
          </button>
        )}
      </section>

      {pagoActivo && datosPago ? (
        <div aria-live="polite">
          <section className="tarjeta pago" aria-label="Pago">
            {pago.estado === 'revision' && (
              <>
                <h2 className="pago__titulo">Revisa antes de firmar</h2>
                <p className="ayuda">
                  Todavía no se ha firmado ni enviado nada. La solicitud de
                  firma de Varial se abre solo cuando confirmes.
                </p>

                <p className="pago__etiqueta">Importe a pagar</p>
                <p className="pago__monto">
                  {formatearXlm(datosPago.stroops)}
                  <span className="resultado__unidad"> XLM</span>
                </p>

                <dl className="detalle">
                  <div className="detalle__fila detalle__fila--direccion">
                    <dt>Paga (tu wallet)</dt>
                    <dd>{datosPago.origen}</dd>
                  </div>
                  <div className="detalle__fila detalle__fila--direccion">
                    <dt>Recibe</dt>
                    <dd>{datosPago.destino}</dd>
                  </div>
                  <div className="detalle__fila">
                    <dt>Red</dt>
                    <dd>Stellar Testnet (XLM de prueba)</dd>
                  </div>
                </dl>

                {datosPago.resto > 0n && (
                  <p className="ayuda">
                    Este pago es solo tu parte. No incluye el resto de{' '}
                    {formatearXlm(datosPago.resto)} XLM (
                    {textoStroops(datosPago.resto)}).
                  </p>
                )}
                <p className="ayuda">
                  Además del importe, la red cobra una comisión pequeña.
                </p>

                <div className="acciones">
                  <button
                    type="button"
                    className="boton boton--principal"
                    onClick={confirmarYFirmar}
                  >
                    Confirmar y firmar
                  </button>
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={volverAlFormulario}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {pagoEnCurso && (
              <>
                <h2 className="pago__titulo">
                  {pago.estado === 'preparando' && 'Preparando el pago…'}
                  {pago.estado === 'firmando' && 'Esperando tu firma en Varial'}
                  {pago.estado === 'enviando' && 'Enviando a Testnet…'}
                </h2>
                <p className="pago__monto pago__monto--pequeno">
                  {formatearXlm(datosPago.stroops)}
                  <span className="resultado__unidad"> XLM</span>
                </p>
                <p className="ayuda">
                  {pago.estado === 'preparando' &&
                    'Se está armando la transacción. Un momento.'}
                  {pago.estado === 'firmando' &&
                    'Revisa la ventana de Varial y aprueba o rechaza la firma. Si no aparece, abre la extensión desde la barra del navegador.'}
                  {pago.estado === 'enviando' &&
                    'Esperando la confirmación de la red. No cierres ni recargues esta página.'}
                </p>
              </>
            )}

            {pago.estado === 'exito' && (
              <>
                <h2 className="pago__titulo pago__titulo--ok">
                  Pago confirmado en Testnet
                </h2>
                <p className="pago__monto">
                  {formatearXlm(datosPago.stroops)}
                  <span className="resultado__unidad"> XLM</span>
                </p>
                <p className="pago__etiqueta">Identificador de la transacción</p>
                <p className="wallet__direccion">{pago.hash}</p>
                <div className="acciones">
                  {enlaceComprobante && (
                    <a
                      className="boton boton--principal"
                      href={enlaceComprobante}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver comprobante en Stellar Expert
                    </a>
                  )}
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={volverAlFormulario}
                  >
                    Volver al formulario
                  </button>
                </div>
                <p className="ayuda">
                  Se abre una página pública de Stellar Expert (Testnet) en una
                  pestaña nueva. Solo consulta la transacción: no firma ni
                  envía nada.
                </p>
              </>
            )}

            {pago.estado === 'error' && (
              <>
                <h2 className="pago__titulo">El pago no se completó</h2>
                <div
                  className={`mensaje-wallet mensaje-wallet--${
                    pago.motivo === 'cancelada' ? 'cancelada' : 'error'
                  }`}
                  role="alert"
                >
                  <p>{pago.mensaje}</p>
                  {pago.hash && (
                    <p>
                      Identificador de la transacción: <br />
                      <span className="pago__hash">{pago.hash}</span>
                    </p>
                  )}
                </div>
                {!pago.permiteReintento && (
                  <p className="ayuda">
                    No se ofrece reintentar desde aquí para evitar pagar dos
                    veces. Comprueba primero el saldo de tu cuenta.
                  </p>
                )}
                <div className="acciones">
                  {pago.permiteReintento && (
                    <button
                      type="button"
                      className="boton boton--principal"
                      onClick={revisarDeNuevo}
                    >
                      Revisar de nuevo
                    </button>
                  )}
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={volverAlFormulario}
                  >
                    Volver al formulario
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <>
          <form
            className="tarjeta formulario"
            onSubmit={manejarEnvio}
            noValidate
          >
            <div className="campo">
              <label htmlFor="concepto">Concepto del gasto</label>
              <input
                id="concepto"
                name="concepto"
                type="text"
                value={campos.concepto}
                onChange={manejarCambio}
                placeholder="Ej.: Cena del bootcamp"
                maxLength={80}
                autoComplete="off"
              />
              <p className="ayuda">
                Opcional. Solo sirve para identificar el gasto.
              </p>
            </div>

            <div className="campo">
              <label htmlFor="total">Total del gasto (XLM de prueba)</label>
              <div className="entrada-con-sufijo">
                <input
                  id="total"
                  name="total"
                  type="text"
                  inputMode="decimal"
                  value={campos.total}
                  onChange={manejarCambio}
                  placeholder="0,0000000"
                  autoComplete="off"
                  aria-invalid={errores.total ? 'true' : 'false'}
                  aria-describedby={
                    errores.total ? 'error-total' : 'ayuda-total'
                  }
                />
                <span className="sufijo" aria-hidden="true">
                  XLM
                </span>
              </div>
              {errores.total ? (
                <p className="error" id="error-total" role="alert">
                  {errores.total}
                </p>
              ) : (
                <p className="ayuda" id="ayuda-total">
                  Hasta 7 decimales. Puedes usar punto o coma.
                </p>
              )}
            </div>

            <div className="campo">
              <label htmlFor="personas">Número de personas</label>
              <input
                id="personas"
                name="personas"
                type="text"
                inputMode="numeric"
                value={campos.personas}
                onChange={manejarCambio}
                placeholder="Ej.: 3"
                autoComplete="off"
                aria-invalid={errores.personas ? 'true' : 'false'}
                aria-describedby={
                  errores.personas ? 'error-personas' : 'ayuda-personas'
                }
              />
              {errores.personas ? (
                <p className="error" id="error-personas" role="alert">
                  {errores.personas}
                </p>
              ) : (
                <p className="ayuda" id="ayuda-personas">
                  Cuéntate a ti también. Debe ser un entero positivo.
                </p>
              )}
            </div>

            <div className="acciones">
              <button type="submit" className="boton boton--principal">
                Calcular mi parte
              </button>
              <button
                type="button"
                className="boton boton--secundario"
                onClick={limpiar}
              >
                Limpiar
              </button>
            </div>
          </form>

          <div aria-live="polite">
            {resultado && (
              <section className="tarjeta resultado" aria-label="Resultado">
                {resultado.concepto && (
                  <p className="resultado__concepto">{resultado.concepto}</p>
                )}

                <p className="resultado__etiqueta">Tu parte</p>
                <p className="resultado__monto">
                  {formatearXlm(resultado.parteStroops)}
                  <span className="resultado__unidad"> XLM</span>
                </p>

                <dl className="detalle">
                  <div className="detalle__fila">
                    <dt>Total del gasto</dt>
                    <dd>{formatearXlm(resultado.totalStroops)} XLM</dd>
                  </div>
                  <div className="detalle__fila">
                    <dt>Personas</dt>
                    <dd>{resultado.personas.toLocaleString('es-CR')}</dd>
                  </div>
                </dl>

                {hayResto ? (
                  <div className="resto resto--con-resto" role="note">
                    <p className="resto__titulo">La división no es exacta</p>
                    <p>
                      Sobran{' '}
                      <strong>
                        {formatearXlm(resultado.restoStroops)} XLM
                      </strong>{' '}
                      ({textoStroops(resultado.restoStroops)}) que no se pueden
                      repartir en partes iguales con 7 decimales. Cuenta Clara
                      no lo redondea: el grupo decide quién lo cubre.
                    </p>
                  </div>
                ) : (
                  <div className="resto resto--exacto" role="note">
                    <p className="resto__titulo">División exacta</p>
                    <p>No sobra ningún resto.</p>
                  </div>
                )}

                <p className="comprobacion">
                  Comprobación: {formatearXlm(resultado.parteStroops)} ×{' '}
                  {resultado.personas.toLocaleString('es-CR')}
                  {hayResto && <> + {formatearXlm(resultado.restoStroops)}</>} ={' '}
                  {formatearXlm(
                    resultado.parteStroops * resultado.personas +
                      resultado.restoStroops,
                  )}{' '}
                  XLM
                </p>
              </section>
            )}

            {resultado && (
              <section
                className="tarjeta pagar"
                aria-label="Pagar mi parte"
              >
                <h2 className="pago__titulo">Pagar mi parte</h2>

                <div className="campo">
                  <label htmlFor="destinatario">
                    Dirección del destinatario (Testnet)
                  </label>
                  <input
                    id="destinatario"
                    name="destinatario"
                    type="text"
                    value={destinatario}
                    onChange={manejarCambioDestinatario}
                    placeholder="G…"
                    autoComplete="off"
                    spellCheck="false"
                    aria-invalid={errorDestinatario ? 'true' : 'false'}
                    aria-describedby={
                      errorDestinatario
                        ? 'error-destinatario'
                        : 'ayuda-destinatario'
                    }
                  />
                  {errorDestinatario ? (
                    <p className="error" id="error-destinatario" role="alert">
                      {errorDestinatario}
                    </p>
                  ) : (
                    <p className="ayuda" id="ayuda-destinatario">
                      Pega la dirección pública de quien recibe. Debe existir y
                      estar fondeada en Testnet.
                    </p>
                  )}
                </div>

                {!walletConectada && (
                  <p className="ayuda">
                    Conecta tu wallet arriba para poder pagar tu parte.
                  </p>
                )}

                <div className="acciones">
                  <button
                    type="button"
                    className="boton boton--principal"
                    onClick={iniciarRevision}
                    disabled={!walletConectada}
                  >
                    Pagar mi parte
                  </button>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      <p className="aviso">
        Los pagos se envían solo a Stellar Testnet con XLM de prueba. Tu clave
        secreta nunca pasa por esta página: la firma Varial.
      </p>
    </main>
  )
}