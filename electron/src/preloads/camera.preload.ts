import { contextBridge } from 'electron';
import { electronBridgeApi } from '../preload';
const api = { isElectron: true, closeCameraWindow: electronBridgeApi.closeCameraWindow,
  getAppConfig: electronBridgeApi.getAppConfig, getAppVersion: electronBridgeApi.getAppVersion };
for (const name of ['electron', 'electronBridge', 'electronAPI']) contextBridge.exposeInMainWorld(name, api);
