/**
 * Cristi AI - External Hardware & IoT Sensor Layer [STANDBY / BETA NO DISPONIBLE]
 * Módulo en modo Standby / No disponible.
 * No ejecuta sondeos, no crea hardware virtual y no satura logs.
 */

export interface ExternalDeviceStatus {
  isStandby: boolean;
  status: string;
  description: string;
}

export interface RGBState {
  r: number;
  g: number;
  b: number;
  mode: string;
  brightness: number;
  standby: boolean;
}

export class ExternalDeviceManager {
  public status = 'standby_beta_unavailable';
  public isStandby = true;
  public connectedDevices = new Map<string, unknown>();
  public virtualSensorsActive = false;
  public virtualSensorInterval: ReturnType<typeof setInterval> | null = null;
  public rgbState: RGBState = { r: 160, g: 32, b: 240, mode: 'goth_purple', brightness: 0.8, standby: true };

  registerDevice(deviceDescriptor: unknown): { status: string; message: string; device: unknown } {
    return {
      status: 'standby',
      message: 'Módulo de hardware en standby (desarrollo beta no disponible).',
      device: deviceDescriptor
    };
  }

  disconnectDevice(_id: string): { status: string } {
    return { status: 'standby' };
  }

  handleSensorSignal(_sensorType: string, _data: unknown): { status: string } {
    return { status: 'standby' };
  }

  setRGBColor(_r: number, _g: number, _b: number, _mode = 'static'): { status: string; message: string } {
    return {
      status: 'standby',
      message: 'Control RGB en standby (desarrollo beta no disponible).'
    };
  }

  enableVirtualSensors(): void {
    this.virtualSensorsActive = false;
  }

  disableVirtualSensors(): void {
    this.virtualSensorsActive = false;
    if (this.virtualSensorInterval) {
      clearInterval(this.virtualSensorInterval);
      this.virtualSensorInterval = null;
    }
  }

  getConnectedDevices(): unknown[] {
    return [];
  }

  getRGBState(): RGBState {
    return this.rgbState;
  }

  getStatus(): ExternalDeviceStatus {
    return {
      isStandby: true,
      status: 'standby_beta_unavailable',
      description: 'Control de dispositivos inalámbricos (Arduino, sensores, luces) en standby de desarrollo.'
    };
  }
}

export const externalDeviceManager = new ExternalDeviceManager();
export default externalDeviceManager;
