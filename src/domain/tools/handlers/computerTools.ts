import type { IToolHandler, ToolExecutionContext } from '../IToolHandler';

let cachedElectronBridge: any = null;

async function getElectronBridge() {
  if (cachedElectronBridge) return cachedElectronBridge;
  if (typeof window !== 'undefined' && (window as any).electronBridge) {
    cachedElectronBridge = (window as any).electronBridge;
    return cachedElectronBridge;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).electronBridge) {
    cachedElectronBridge = (globalThis as any).electronBridge;
    return cachedElectronBridge;
  }
  try {
    const mod = await import('../../../services/desktop/ElectronBridge.js');
    if (mod?.electronBridge) {
      cachedElectronBridge = mod.electronBridge;
      return cachedElectronBridge;
    }
  } catch {
    try {
      const tsPath = '../../../services/desktop/ElectronBridge.ts';
      const mod = await import(/* @vite-ignore */ tsPath);
      if (mod?.electronBridge) {
        cachedElectronBridge = mod.electronBridge;
        return cachedElectronBridge;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export const computerActionHandler: IToolHandler = {
  name: 'computer_action',
  declaration: {
    name: 'computer_action',
    description: 'Ejecuta acciones de interacción y automatización en el sistema: pulsar teclas, escribir texto, clics y captura de pantalla autorizada.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['take_screenshot', 'press_key', 'type_text', 'mouse_click', 'scroll'],
          description: 'La acción de interfaz a realizar.'
        },
        coordinate: {
          type: 'ARRAY',
          items: { type: 'INTEGER' },
          description: '[x, y] coordenadas en píxeles de la pantalla para mouse_click.'
        },
        text: {
          type: 'STRING',
          description: 'Texto a escribir si la acción es "type_text".'
        },
        key: {
          type: 'STRING',
          description: 'Tecla o combinación a presionar (ej: "Win+d", "Windows+d", "Control+s", "Alt+Tab", "Enter", "Escape") si action es "press_key".'
        },
        scroll_amount: {
          type: 'INTEGER',
          description: 'Cantidad de scroll vertical (positivo hacia abajo, negativo hacia arriba).'
        }
      },
      required: ['action']
    }
  },
  async execute(
    args: {
      action?: string;
      coordinate?: [number, number] | number[];
      text?: string;
      key?: string;
      scroll_amount?: number;
    },
    context?: ToolExecutionContext
  ) {
    if (context?.signal?.aborted) return { status: 'cancelled', message: 'Acción de computadora cancelada por señal de aborto.', cancelled: true };
    const { action } = args || {};

    switch (action) {
      case 'press_key': {
        if (!args?.key) {
          return {
            status: 'error',
            action: 'press_key',
            message: 'Parámetro "key" requerido para press_key.'
          };
        }
        const bridge = await getElectronBridge();
        if (bridge?.sendComputerInput) {
          const res = await bridge.sendComputerInput({ action: 'press_key', key: args.key });
          if (res && !res.success) {
            return {
              status: 'error',
              action: 'press_key',
              key: args.key,
              message: res.error || `Error al presionar la tecla "${args.key}".`
            };
          }
        }
        return {
          status: 'success',
          action: 'press_key',
          key: args.key,
          message: `Tecla "${args.key}" presionada con éxito.`
        };
      }

      case 'type_text': {
        if (!args?.text) {
          return {
            status: 'error',
            action: 'type_text',
            message: 'Parámetro "text" requerido para type_text.'
          };
        }
        const bridge = await getElectronBridge();
        if (bridge?.sendComputerInput) {
          const res = await bridge.sendComputerInput({ action: 'type_text', text: args.text });
          if (res && !res.success) {
            return {
              status: 'error',
              action: 'type_text',
              text: args.text,
              message: res.error || 'Error al escribir el texto.'
            };
          }
        }
        return {
          status: 'success',
          action: 'type_text',
          text: args.text,
          message: `Texto escrito con éxito (${args.text.length} caracteres).`
        };
      }

      case 'mouse_click': {
        const bridge = await getElectronBridge();
        if (bridge?.sendComputerInput) {
          await bridge.sendComputerInput({
            action: 'mouse_click',
            coordinate: (args?.coordinate as [number, number]) || undefined
          });
        }
        return {
          status: 'success',
          action: 'mouse_click',
          coordinate: args?.coordinate,
          message: 'Clic de mouse ejecutado con éxito.'
        };
      }

      case 'scroll': {
        const bridge = await getElectronBridge();
        if (bridge?.sendComputerInput) {
          await bridge.sendComputerInput({
            action: 'scroll',
            scroll_amount: args?.scroll_amount
          });
        }
        return {
          status: 'success',
          action: 'scroll',
          scroll_amount: args?.scroll_amount,
          message: 'Desplazamiento ejecutado con éxito.'
        };
      }

      case 'take_screenshot': {
        let frameData: string | null = null;
        const bridge = await getElectronBridge();
        if (bridge?.isElectron && bridge.captureScreenNative) {
          frameData = await bridge.captureScreenNative(null, true);
        }
        if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura de pantalla cancelada tras extracción.', cancelled: true };
        if (!frameData && context?.getScreenCapture) {
          frameData = await context.getScreenCapture('full', { fresh: true });
        } else if (!frameData && context?.takeScreenshot) {
          frameData = await context.takeScreenshot('full');
        }
        if (context?.signal?.aborted) return { status: 'cancelled', message: 'Captura de pantalla cancelada tras procesamiento.', cancelled: true };
        return {
          status: frameData ? 'captured' : 'error',
          action: 'take_screenshot',
          message: frameData ? 'Captura de pantalla realizada.' : 'No se pudo capturar la pantalla.',
          has_frame: !!frameData,
          frame_data: frameData
        };
      }

      default:
        return {
          status: 'error',
          action,
          message: `Acción de computadora "${action}" no reconocida.`
        };
    }
  }
};

export const computerTools: IToolHandler[] = [
  computerActionHandler
];
