import { contextBridge } from 'electron';
import { electronBridgeApi } from '../preload';
const { setSecureSecret: _set, deleteSecureSecret: _delete, approveWorkspace: _workspace, installUpdate: _install, ...api } = electronBridgeApi;
for (const name of ['electron', 'electronBridge', 'electronAPI']) contextBridge.exposeInMainWorld(name, api);
