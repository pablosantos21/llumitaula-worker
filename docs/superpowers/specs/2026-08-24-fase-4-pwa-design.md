# Fase 4: PWA

## Objetivo

Hacer que Llumitaula pueda instalarse desde Safari en un iPad y abrirse como una aplicación independiente. La interfaz base debe poder arrancar sin conexión, pero los datos y operaciones de Supabase seguirán requiriendo red.

## Alcance

- Añadir manifest web y metadatos de instalación para iOS/iPadOS.
- Producir iconos PNG a partir del símbolo SVG existente.
- Añadir splash screens para las orientaciones horizontal y vertical del iPad.
- Añadir un service worker manual para precachear el app shell y assets generados.
- Documentar y automatizar las comprobaciones posibles del flujo PWA.

Queda fuera de alcance cachear datos de Supabase, soportar operaciones de negocio offline o añadir sincronización posterior.

## Arquitectura

Astro continuará usando `output: "static"` y no se añadirá una dependencia PWA. El manifest se publicará como `public/manifest.webmanifest`. El service worker se publicará como `public/sw.js`, con alcance raíz, y se registrará desde `MainLayout.astro` mediante un script pequeño del navegador.

El manifest usará el nombre `Llumitaula`, `start_url: "/"`, `display: "standalone"`, orientación `any`, y los colores de la interfaz existente. Incluirá iconos de 192x192 y 512x512, además del icono Apple de 180x180. Los recursos se servirán con rutas absolutas desde la raíz.

El service worker tendrá una versión explícita de caché. Durante `install` precargará el app shell y assets producidos en `dist`; durante `activate` eliminará cachés de versiones anteriores. Las navegaciones usarán el recurso de red cuando haya conexión y recurrirán al HTML cacheado (`/index.html`) sin conexión. Los assets estáticos usarán `cache-first` con actualización controlada. Las peticiones externas y de Supabase no se cachearán.

Una precarga fallida no debe dejar inutilizable la aplicación online: los assets opcionales se añadirán de forma tolerante y los siguientes ciclos de instalación podrán reintentarlos.

## Compatibilidad visual

Los iconos y splash usarán el símbolo del favicon actual sobre un fondo verde sólido de la aplicación, con margen interno para evitar recortes en máscaras de iOS. Se añadirán variantes `maskable` cuando el formato lo permita.

El layout incluirá `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` y enlaces a los recursos de inicio. Las imágenes de inicio cubrirán las dimensiones modernas principales del iPad en orientación horizontal y vertical mediante media queries; Safari conservará un fallback para modelos no cubiertos.

## Actualización y errores

Cada despliegue incrementará la versión del caché. El service worker no interceptará ni transformará errores de autenticación o de API. Si se abre una ruta desconocida offline, se servirá el shell principal para que el cliente pueda resolver la navegación; si una operación requiere Supabase, la interfaz existente mostrará su estado de error de red.

## Verificación

La automatización comprobará:

- `npm run build` genera manifest, service worker, iconos y splash en `dist`.
- Un script de build valida las rutas críticas, el `display` standalone y el precache esperado.
- `npm run check`, `npm run lint` y `npm run format:check` siguen pasando.

La verificación manual en Safari de iPad comprobará: compartir, “Añadir a pantalla de inicio”, apertura sin pestaña Safari, orientación horizontal y vertical, y arranque del app shell con modo avión. También se confirmará que las vistas protegidas no presentan datos falsos offline y que las operaciones de Supabase permanecen condicionadas a conexión.
