import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'release/**',
      'public/**',
      'node_modules/**',
      '*.zip',
      'native/**',
      'electron/dist/**',
      'src/mcp/servers/spotify/spotify-mcp-server/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'electron/**/*.{js,cjs,ts}', 'scripts/**/*.{js,cjs,mjs}', '*.config.{js,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        window: 'readonly',
        Response: 'readonly',
        BroadcastChannel: 'readonly',
        ClipboardItem: 'readonly',
        HTMLImageElement: 'readonly',
        Audio: 'readonly',
        ResizeObserver: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        AudioWorkletNode: 'readonly',
        ImageData: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FileReader: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        WebSocket: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-constant-condition': 'off',
      'no-useless-assignment': 'off'
    }
  },
  {
    files: [
      'src/domain/gemini/*.ts',
      'src/app/**/*.{ts,tsx}',
      'src/infrastructure/config/LegacySettingsMigration.ts',
      'src/infrastructure/config/ConfigManager.ts',
      'src/domain/tools/ToolExecutor.ts',
      'src/services/desktop/ElectronBridge.ts',
      'shared/**/*.ts',
      'electron/src/security/**/*.ts',
      'electron/src/protocol/**/*.ts',
      'src/domain/audio/StreamingResampler.ts',
      'src/domain/audio/AudioPlayoutQueue.ts',
      'src/domain/transcription/**/*.ts',
      'src/worklets/**/*.ts'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  }
];
