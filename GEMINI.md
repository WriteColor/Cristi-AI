# Reglas del Proyecto — Cristi AI

## Prohibición de Archivos y Comandos de Pruebas Locales
1. **No guardar archivos de test ni scripts de prueba locales**:
   - Está estrictamente prohibido crear, guardar o persistir archivos de prueba en el proyecto (`*.test.*`, `*.spec.*`, carpetas `tests/`, `test/`, `__tests__/`, o scripts de prueba en `scripts/` como `test-*`, `bundle-*-test`, `run-*-client`, `debug-*`).
   - El proyecto no admite suites de test automatizadas persistidas en disco.
2. **No crear comandos de test en `package.json`**:
   - `package.json` únicamente debe contener comandos de instalación/preparación (`setup`, `postinstall`), ejecución en desarrollo (`dev`) y compilación del ejecutable (`build`).
   - Queda terminantemente prohibido añadir scripts como `test`, `test:*`, o comandos auxiliares de prueba.
3. **Verificación en caliente**:
   - Cualquier validación de funcionalidad, compatibilidad o integración debe comprobarse directamente a través del flujo de ejecución del entorno (`dev`, `build` o diagnóstico TUI), sin dejar archivos residuales en el repositorio.
