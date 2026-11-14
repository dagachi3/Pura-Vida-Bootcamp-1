import { useState } from 'react'
import { dividirGasto, formatearXlm } from './lib/dividirGasto.js'
import { conectarWallet } from './lib/wallet.js'
import './App.css'

const CAMPOS_INICIALES = { concepto: '', total: '', personas: '' }

const WALLET_INICIAL = {
  estado: 'desconectada', // 'desconectada' | 'conectando' | 'conectada' | 'error'
  direccion: '',
  red: '',
  motivo: '',
  mensaje: '',
}

function textoStroops(cantidad) {
  return `${cantidad.toString()} ${cantidad === 1n ? 'stroop' : 'stroops'}`
}

export default function App() {
  const [campos, setCampos] = useState(CAMPOS_INICIALES)
  const [errores, setErrores] = useState({})
  const [resultado, setResultado] = useState(null)
  const [wallet, setWallet] = useState(WALLET_INICIAL)

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

  const hayResto = resultado !== null && resultado.restoStroops > 0n
  const conectando = wallet.estado === 'conectando'

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
                Solo se lee tu dirección pública. No se firma ni se envía
                ningún pago.
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

      <form className="tarjeta formulario" onSubmit={manejarEnvio} noValidate>
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
          <p className="ayuda">Opcional. Solo sirve para identificar el gasto.</p>
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
              aria-describedby={errores.total ? 'error-total' : 'ayuda-total'}
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
          <button type="button" className="boton boton--secundario" onClick={limpiar}>
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
                  <strong>{formatearXlm(resultado.restoStroops)} XLM</strong> (
                  {textoStroops(resultado.restoStroops)}) que no se pueden
                  repartir en partes iguales con 7 decimales. Cuenta Clara no
                  lo redondea: el grupo decide quién lo cubre.
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
      </div>

      <p className="aviso">
        Esta versión calcula y puede leer la dirección pública de tu wallet. No
        se realiza ningún pago.
      </p>
    </main>
  )
}