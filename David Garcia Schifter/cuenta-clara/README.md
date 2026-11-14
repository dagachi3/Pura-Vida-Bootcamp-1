# Cuenta Clara

Prototipo · Stellar Testnet — Pura Vida Bootcamp

Aplicación que divide un gasto entre varias personas. Esta versión incluye la
pantalla, la calculadora y la conexión de una wallet (solo lectura).

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
- Para probarla: instala Varial desde https://varialwallet.com, crea una
  cuenta de prueba y cambia la red a Testnet (ajustes → Network → Test Net).
  Usa una cuenta de prueba, nunca una con fondos reales.

## Qué no hace todavía

- No firma ni envía pagos en Stellar Testnet.
- No hay backend ni contratos inteligentes.

## Cómo ejecutarla

Requisitos: Node.js y npm instalados.

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
números decimales de JavaScript, y solo convierte a XLM al mostrar el resultado.
Si el total tiene más de 7 decimales, se rechaza en lugar de redondearlo.

Siempre se cumple: `parte × personas + resto = total`.

Verificación hecha con Stellar Raven (búsquedas en la documentación oficial de
Stellar, `stellarDocs.search_docs`, el 14/11/2026):

- "stroop 7 decimal places amount precision"
- "lumens XLM smallest unit stroop"
- "asset amount 7 decimals int64 scaled"

Qué confirman las páginas oficiales:

- Los importes se guardan como enteros de 64 bits con signo, escalados por
  10.000.000 (https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets#amount-precision).
- 10.000.000 stroops = 1 XLM
  (https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers#total-coins).
- El máximo representable, 922.337.203.685,4775807, excede lo que un `Number`
  de JavaScript guarda con exactitud
  (https://developers.stellar.org/docs/build/guides/basics/verify-trustlines#checking-the-trustline-limit).

## Verificación de la wallet

Hecha con Stellar Raven (`stellarDocs.get_doc_page` y `stellarDocs.search_docs`,
14/11/2026), sobre las páginas oficiales
`/docs/tools/developer-tools/wallets`, `/docs/build/guides/freighter/connect-testnet`
y `/docs/build/guides/dapps/frontend-guide`:

- Varial (antes Freighter) es la extensión de wallet de la Stellar Development
  Foundation, y `@stellar/varial-sdk` es el nuevo nombre de
  `@stellar/freighter-api`.
- Los nombres de las funciones y lo que devuelven se confirmaron en los tipos
  del paquete instalado (versión 7.0.0): `requestAccess`, `getAddress` y
  `getNetwork` devuelven `{ address }` o `{ network, networkPassphrase }`,
  y pueden incluir `error`.
- Testnet se reconoce por su frase de red: `Test SDF Network ; September 2015`.
- Pendiente de confirmar: el código exacto de error que devuelve Varial al
  cancelar. Por eso la cancelación también se detecta por el texto del mensaje.

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
```

## Tecnologías

React, Vite y JavaScript, con `@stellar/varial-sdk` para la wallet.