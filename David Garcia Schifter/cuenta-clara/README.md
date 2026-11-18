# Cuenta Clara

Prototipo · Stellar Testnet — Pura Vida Bootcamp

Aplicación que divide un gasto entre varias personas y permite pagar tu parte
con XLM de prueba en Stellar Testnet. Solo funciona en Testnet: no se usa
dinero real.

## Qué hace

- Pide el concepto del gasto, el total en XLM de prueba y el número de personas.
- Calcula la parte de cada persona con precisión de 7 decimales.
- Si la división deja un resto, lo muestra de forma explícita.
- Valida que el total sea positivo y que las personas sean un entero positivo.

## Wallet

- Botón «Conectar wallet» con la extensión **Varial** (antes Freighter),
  mediante `@stellar/varial-sdk`.
- Muestra la dirección pública de la cuenta conectada y comprueba que la
  wallet esté en Testnet.
- Mensajes claros si se cancela la conexión, si la extensión no está
  instalada o si la wallet está en otra red.

## Pagar mi parte

1. Después de calcular, se ingresa la dirección pública del destinatario
   (debe existir y estar fondeada en Testnet).
2. Una pantalla de revisión muestra el importe exacto, la cuenta que paga, la
   cuenta que recibe y la red. **Hasta ese punto no se ha firmado ni enviado
   nada**, y «Cancelar» devuelve al formulario con los datos intactos.
3. Solo al pulsar «Confirmar y firmar» se arma el pago y se abre la solicitud
   de firma de Varial.
4. Tras firmar, el pago se envía a Testnet y se espera la confirmación.

Detalles del diseño:

- El pago es solo la parte de la persona. El resto de la división, si lo hay,
  no se incluye y la revisión lo avisa.
- La clave secreta nunca pasa por la aplicación: la firma la hace Varial.
- La transacción vence a los 180 segundos de armarse, por eso se arma después
  de confirmar la revisión y no antes.
- La comisión sale de las estadísticas recientes de la red (percentil 90), con
  un mínimo de 100 stroops y un tope de 100.000 stroops por operación.
- Si el resultado no se puede confirmar, la app no dice que falló: muestra el
  identificador de la transacción y no ofrece reintentar, para evitar pagar
  dos veces.

## Qué no hace todavía

- No hay backend ni contratos inteligentes.
- No funciona en Mainnet.

## Cómo probarla

Requisitos: Node.js y npm, y Firefox o Chrome con la extensión Varial
(https://varialwallet.com).

1. Instala Varial y crea una cuenta **de prueba**. Nunca uses una cuenta con
   fondos reales ni compartas tu clave secreta o tu frase de recuperación.
2. En Varial cambia la red a Testnet (ajustes → Network → Test Net).
3. Fondea la cuenta con Friendbot (Varial lo ofrece, o usa
   https://lab.stellar.org/account/create con la red en Testnet).
4. Crea una segunda cuenta de prueba en Stellar Lab, fondéala con Friendbot y
   copia solo su dirección pública (empieza con `G`). Esa será el destinatario.
5. Si el pago se confirma, aparece el botón «Ver comprobante en Stellar
   Expert», que abre la transacción en el explorador de Testnet. Solo
   consulta la transacción: no firma ni envía nada.

Testnet se reinicia con regularidad, así que las cuentas y los saldos de prueba
pueden desaparecer. Si pasa, vuelve a fondearlas.

Probada en Firefox con Varial.

## Cómo ejecutarla

Desde esta carpeta (`cuenta-clara`):

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección que aparece en la terminal, normalmente
`http://localhost:5173/`.

En otros sistemas o terminales se puede usar `npm` en lugar de `npm.cmd`.

Otros comandos:

```powershell
npm.cmd run lint     # revisa el código con ESLint
npm.cmd run build    # genera la versión de producción en dist/
npm.cmd run preview  # sirve la versión generada
```

## Precisión de los importes

El XLM admite 7 decimales: 1 XLM = 10.000.000 stroops, y el stroop es la unidad
mínima. Por eso la calculadora trabaja con enteros (`BigInt`) en stroops, sin
números decimales de JavaScript, y solo convierte a XLM al mostrar el resultado
o al armar el pago. Si el total tiene más de 7 decimales, se rechaza en lugar
de redondearlo.

Siempre se cumple: `parte × personas + resto = total`.

## Verificación con Stellar Raven

Se consultó Stellar Raven (documentación oficial de Stellar) en tres momentos.

**Precisión de XLM** (`stellarDocs.search_docs`, 14/11/2026), con las búsquedas
«stroop 7 decimal places amount precision», «lumens XLM smallest unit stroop» y
«asset amount 7 decimals int64 scaled». Las páginas oficiales confirman:

- Los importes se guardan como enteros de 64 bits con signo, escalados por
  10.000.000 (https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets#amount-precision).
- 10.000.000 stroops = 1 XLM
  (https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers#total-coins).
- El máximo representable, 922.337.203.685,4775807, excede lo que un `Number`
  de JavaScript guarda con exactitud
  (https://developers.stellar.org/docs/build/guides/basics/verify-trustlines#checking-the-trustline-limit).

**Wallet** (`stellarDocs.get_doc_page` y `stellarDocs.search_docs`, 14/11/2026),
sobre `/docs/tools/developer-tools/wallets`,
`/docs/build/guides/freighter/connect-testnet` y
`/docs/build/guides/dapps/frontend-guide`:

- Varial (antes Freighter) es la extensión de wallet de la Stellar Development
  Foundation, y `@stellar/varial-sdk` es el nuevo nombre de
  `@stellar/freighter-api`.
- Los nombres de las funciones y lo que devuelven se confirmaron en los tipos
  del paquete instalado (versión 7.0.0): `requestAccess` y `getAddress`
  devuelven `{ address }`, `getNetwork` devuelve `{ network, networkPassphrase }`,
  y todas pueden incluir `error`.
- Testnet se reconoce por su frase de red: `Test SDF Network ; September 2015`.

**Pago de XLM** (`stellarDocs.get_doc_page` y `stellarDocs.search_docs`,
16/11/2026), sobre `/docs/build/guides/transactions/send-and-receive-payments`,
`/docs/build/guides/transactions/submit-transaction-wait`,
`/docs/build/guides/transactions/create-account`, `/docs/networks`,
`/docs/tools/lab/account` y `/docs/tools/sdks/js-sdk-helpers`:

- El pago se arma con `TransactionBuilder`, `Operation.payment`,
  `Asset.native()` y `Networks.TESTNET`, con un tiempo límite (`setTimeout`) y
  una comisión tomada de `getFeeStats()` con tope.
- `sendTransaction` responde con `PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER` o
  `ERROR`; solo `ERROR` es un rechazo definitivo, y `getTransaction` /
  `pollTransaction` devuelven `NOT_FOUND` hasta que la transacción entra a un
  ledger (`NOT_FOUND` no significa que haya fallado).
- Un pago normal no crea cuentas: el destinatario debe existir. En Testnet,
  Friendbot fondea cuentas con XLM de prueba.
- Testnet se reinicia con regularidad.
- En los tipos de `@stellar/varial-sdk` 7.0.0, `signTransaction` recibe el XDR y
  las opciones `networkPassphrase` y `address`, y devuelve `signedTxXdr` y
  `signerAddress` (más `error` opcional). En los de `@stellar/stellar-sdk`
  17.4.0 se verificaron `getAccount`, `getFeeStats`, `sendTransaction`,
  `pollTransaction`, `fromXDR` e `isValidEd25519PublicKey`.

Pendiente de confirmar: el código exacto de error que devuelve Varial al
cancelar (la conexión o la firma). Por eso la cancelación también se detecta
por el texto del mensaje.

Verificación del pago en la red: tras un pago de prueba, los saldos consultados
en Horizon Testnet (`https://horizon-testnet.stellar.org/accounts/<dirección>`)
reflejaron el importe transferido y la comisión.

## Estructura

```
cuenta-clara/
  index.html
  src/
    main.jsx             punto de entrada
    App.jsx              pantalla
    App.css              estilos de la pantalla
    index.css            estilos globales
    lib/dividirGasto.js  lógica de la calculadora
    lib/wallet.js        conexión con la wallet Varial
    lib/pago.js          armado, firma y envío del pago
```

## Tecnologías

React, Vite y JavaScript, con `@stellar/varial-sdk` para la wallet y
`@stellar/stellar-sdk` para armar y enviar el pago.