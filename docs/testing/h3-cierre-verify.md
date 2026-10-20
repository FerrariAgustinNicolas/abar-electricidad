# H3 — Verify independiente del delta visual: PARCIAL

Candidato `97ae4853805ca408fb5f8f24cc2010fec730013a`, árbol `e2cc605b411bdf90128c3b3eb11cb9a381d86b06`. Checks afectados conformes; evidencia visual y mediciones reales pendientes por ausencia de navegador conectado al control CUA. No se declara PASS visual.

## Verificación ejecutada

| Comando / comprobación | Exit | Resultado |
|---|---:|---|
| `node --version`; `npm --version` | 0 | v26.4.0 /11.17.0 |
| `npm --prefix frontend test -- --watch=false --include=src/app/features/cart/cart-page.component.spec.ts` | 0 | 9/9;1 archivo |
| `npm --prefix frontend run build` | 0 | Build conforme |
| `npm --prefix frontend run lint` | 0 | Lint conforme |
| `git diff --exit-code f2277c5 97ae485 -- backend contracts` | 0 | Backend y contratos idénticos |
| Comparación cart-page excluyendo únicamente bloque styles | 0 | Template y lógica idénticos a f2277c5 |
| Diff b08a141→97ae485 | 0 | Solo CSS stepper,1 archivo,3 adiciones/1 eliminación |
| Catálogo HTTP propio | 0 | GET producto visual-demo-cable devuelve200 |

Extracción exacta con git archive en scratch nuevo; node_modules físicamente independientes mediante APFS cp-cR. Se reutilizó copia física dist backend de la misma implementación, sin cambiar backend ni ejecutar suites extensas. Se revisó diff documental f2277c5→b08a141: solo Markdown y PNG, archivos nuevos100644; sin cambios de código, configuración ejecutable, hooks o modos ejecutables. Los documentos describen alcance/evidencia/deuda; no alteran invariantes monetarias o stock.

## Brecha visual preservada

`cua.createBrowserTab('iab', URL, {visible:false})` devolvió exactamente `Browser is not available: iab`. Inventario fresco `cua.getState()` devolvió `browsers:[]`; sí enumera apps nativas Safari y Google Chrome for Testing. No se activaron permisos, instalaron conectores ni utilizaron automatizaciones alternativas no soportadas.

En este worker NO se obtuvieron capturas nuevas, computedstyles, composición de opacidad, ratios medidos, teclado ni estado máximo deshabilitado. Los colores esperados del código NO equivalen a mediciones reales. Zoom nativo200% tampoco verificado. Padre conserva runtime para una inspección independiente de superficies nativas disponibles.

## Recursos propios retenidos

- Scratch `/private/tmp/abar-h3-cierre.1GJQgu`.
- Locator privado `owned-env.json` modo0600 dentro del scratch; contiene exclusivamente credenciales nuevas propias. No publicar.
- Contenedor `8d5fc33379f73d2ae226fc19786a9b773440d0a0c95786e82d0f03524cc1ada9`.
- Owner label `211a468a-32d9-4f69-a973-67c9610312dc`; purpose integration; imagen postgres17.11-bookworm cached/pullnever; tmpfs; loopback61137.
- API `127.0.0.1:61152`, PID44213.
- Angular `127.0.0.1:61153`, launcher PID44214; árbol de procesos hijo propio pendiente de inventario/stop seguro del padre.
- URL UI: `http://127.0.0.1:61153/productos/visual-demo-cable`; carrito `/carrito`.
- Producto `72000000-0000-4000-8000-000000000001`; presentación `73000000-0000-4000-8000-000000000001`, METER,precio125,saldo100; solo fixture inicial, sin cambios posteriores de precio/stock.
- No se solicitaron quotes ni pedidos/pagos. Sin cleanup ni contacto con servicios existentes.

## Alcance y siguiente paso

S11.1: tests/build/lint conformes; visual/teclado/contraste pendientes por herramienta no disponible. S11.3: Verify del delta y prueba estructural de lógica/backend/contratos sin cambios conformes; Review independiente y Review nativo pertenecen al padre. No repetición de backend1234 ni PostgreSQL extensivo; evidencia previa conserva su candidato original. S11.4: informe de cierre lo integra el padre, sin autoaprobación ni publicación.

## Suplemento — evidencia visual ejecutada por el padre y revisada independientemente

Se mantiene la limitación del navegador de este worker; NO se atribuye aquí ejecución propia de CUA. El padre sí tuvo IAB disponible sin cambios de permisos y ejecutó el recorrido real contra los servicios propios anteriores. Se inspeccionaron independientemente `h3-cierre-360.jpg`, `h3-cierre-360-full.jpg` y `h3-cierre-measurements.json`, todos del mismo candidato97ae485.

**Adjudicación suplementaria: CUMPLE el delta de contraste y las verificaciones afectadas, con procedencia diferenciada.** La aritmética de contraste se recalculó independientemente desde los RGB registrados, usando luminancia relativa sRGB linealizada: `(Lmayor+0.05)/(Lmenor+0.05)`.

| Estado registrado | Colores efectivos RGB | Ratio recalculado |
|---|---|---:|
| Habilitado + | 32,38,44 sobre243,246,248 | 14.0715:1 |
| Deshabilitado − al mínimo1 | 86,97,107 sobre243,246,248 | 5.8317:1 |
| Foco + sobre superficie | 8,77,125 sobre243,246,248 | 8.1709:1 |
| Foco + sobre blanco | 8,77,125 sobre255,255,255 | 8.8682:1 |

Los cuatro resultados coinciden a cuatro decimales con JSON. Opacidad del botón y de cada ancestro1; no hay dilución adicional por opacity en los estilos registrados. El anillo observado es solid3px/offset2px y aparece claramente en ambas capturas alrededor de +. Los signos y el número1 son visibles; el − deshabilitado mantiene legibilidad. JSON registra disabled=true al mínimo, +habilitado y focusVisible=true. Captura y JSON coinciden en producto,precio1,25,cantidad1 y disposición360px. Viewport real360×800 y scrollWidth360, sin overflow horizontal reportado. No se ejecutó estado máximo1e6 en esta evidencia; no se afirma cobertura de ese límite.

Teclado: la ejecución CUA del padre observó mediante snapshots AX posteriores a render Enter1→2 y Space2→1, Tab/ShiftTab alcanzando +. No se usan como prueba las lecturas inmediatas de texto que podían preceder al render. Esto acredita funcionamiento de teclado según evidencia del ejecutor, no una segunda ejecución propia del worker. El estado final deshabilita − de forma nativa en cantidad1.

Observación no bloqueante conservada: el cursor calculado del botón deshabilitado sigue siendo pointer por especificidad preexistente; no se afirma cursor not-allowed ni se propone otra corrección fuera de alcance. No afecta los ratios ni el disabled nativo. Zoom nativo200% sigue pendiente; no se convierte viewport360 en sustituto.

Procedencia final: tests9/9,build/lint y comprobación estructural ejecutados por Verify independiente; navegador/teclado/computedstyles ejecutados por padre sobre Angular→Nest→PostgreSQL reales; capturas y cálculos contrastados independientemente por Verify. Backend/contratos/lógica siguen idénticos al baseline técnico; sin nuevas suites,contenedores,modificaciones de código ni publicación durante este suplemento. Review nativo y aprobación externa continúan separados.
