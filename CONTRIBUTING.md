# Guia de Contribucion para Cristi AI Companion

Gracias por tu interes en contribuir a **Cristi AI Companion**. Este proyecto es una plataforma de codigo abierto de alto rendimiento para companeros virtuales de escritorio con avatares Live2D, streaming multimodal con Gemini Live y persistencia estructurada con SQLite.

---

## 1. Codigo de Conducta
Mantenemos una comunidad abierta, respetuosa e inclusiva. Asegurate de mantener un tono constructivo y profesional en issues, discusiones y Pull Requests.

---

## 2. Entorno de Desarrollo y Requisitos

### Gestor de Paquetes Exclusivo: pnpm
> **Regla Critica:** Este proyecto utiliza **estrictamente pnpm**. No utilices `npm` ni `yarn` bajo ninguna circunstancia.

Para habilitar pnpm en tu sistema:
```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

### Puesta en Marcha en 1 Clic
```powershell
pnpm install
pnpm run setup:env
```

---

## 3. Estandares de Arquitectura y Rendimiento

Todo desarrollo debe respetar las normas detalladas en [docs/DEVELOPMENT_GUIDELINES.md](file:///c:/React-Nextjs-Projects/Cristi%20AI/docs/DEVELOPMENT_GUIDELINES.md):

1. **Rendimiento de la UI & Zero-Lag:**
   - Prohibido el uso de `backdrop-filter: blur(...)` sobre ventanas transparentes de Electron.
   - Todo componente pesado debe envolverse con `React.memo` para evitar re-renderizados innecesarios.
2. **Ciclo de Vida de Live2D & WebGL:**
   - Nunca acoplar el ciclo de vida del canvas WebGL a estados reactivos de texto o audio.
   - Liberar siempre los recursos de modelos y texturas con `model.destroy({ children: true, texture: true, baseTexture: true })`.
3. **Fronteras IPC Seguras & No Bloqueantes:**
   - Todos los canales de IPC deben estar tipados y validados en `shared/contracts.ts`.
   - Prohibido ejecutar operaciones intensivas de I/O o scraping en el hilo principal de Electron. Utilizar hilos de trabajo dedicados (`Worker Threads`).
4. **Proteccion de Credenciales & Privacidad:**
   - Prohibido el hardcoding de claves de API en el codigo fuente.
   - Toda salida de logs debe procesarse con `publicSettings` y `redactText`.

---

## 4. Verificacion y Pipeline de CI Obligatorio

Antes de abrir un Pull Request o enviar cambios a produccion, debes verificar que el pipeline completo de 7 compuertas pase con exito:

```powershell
pnpm run ci
```

Este comando ejecuta de manera secuencial:
1. `pnpm run clean`: Limpieza de temporales y caches.
2. `pnpm run typecheck`: Validacion de TypeScript estricto en renderer y electron.
3. `pnpm run lint`: Analisis estatico con ESLint.
4. `pnpm run test`: Ejecucion de la suite completa de 65+ pruebas unitarias y de contratos.
5. `pnpm run build`: Compilacion del frontend con Vite.
6. `pnpm run build:electron`: Compilacion de procesos Main y Preloads.
7. `pnpm run test:e2e`: Prueba de integracion E2E en Electron headless.
