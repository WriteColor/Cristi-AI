---
name: no-local-tests
description: Prohibición estricta de archivos locales de prueba, scripts de testing y comandos de test en package.json
always_on: true
---

# Regla: Prohibición Estricta de Archivos y Comandos de Test

- No crear ni almacenar archivos de prueba (`*.test.*`, `*.spec.*`, carpetas `tests/`, `test/`, `__tests__/`).
- No crear ni guardar scripts auxiliares de prueba o debugging en `scripts/` (como `test-*.cjs`, `test-*.ts`, `bundle-*-test.*`, `run-*-client.*`).
- No incluir comandos de testing (`test`, `test:*`) en `package.json`.
- Mantener en `package.json` únicamente los comandos esenciales de instalación (`setup`, `postinstall`), desarrollo (`dev`) y compilación del ejecutable (`build`).
