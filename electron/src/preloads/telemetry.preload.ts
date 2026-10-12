import { contextBridge } from 'electron';
import { electronBridgeApi } from '../preload';

const api = {
  isElectron: true,
  closeTelemetryWindow: electronBridgeApi.closeTelemetryWindow,
  getTelemetrySnapshot: electronBridgeApi.getTelemetrySnapshot,
  getProcessMemoryInfo: electronBridgeApi.getProcessMemoryInfo,
  getGpuFeatureStatus: electronBridgeApi.getGpuFeatureStatus,
  getGpuInfo: electronBridgeApi.getGpuInfo,
  getAppVersion: electronBridgeApi.getAppVersion,
  windowsMediaStatus: electronBridgeApi.windowsMediaStatus,
};

for (const name of ['electron', 'electronBridge', 'electronAPI']) {
  contextBridge.exposeInMainWorld(name, api);
}
