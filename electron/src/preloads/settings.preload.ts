import { contextBridge } from 'electron';
import { electronBridgeApi } from '../preload';
const { requestLiveToken: _live, geminiGenerate: _generate,
  captureScreenNative: _screen, syncHitboxes: _hitboxes, syncInteractiveHitboxes: _interactive,
  setIgnoreMouseEvents: _mouse, memorySave: _memory, ...api } = electronBridgeApi;
for (const name of ['electron', 'electronBridge', 'electronAPI']) contextBridge.exposeInMainWorld(name, api);
