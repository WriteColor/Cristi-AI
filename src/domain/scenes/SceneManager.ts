import { eventBus, EVENTS } from '../../infrastructure/events/eventBus';
import { logger } from '../../infrastructure/logging/logger';

export interface SceneState {
  sceneId: 'transparent' | 'matrix_rain';
  isSceneVisible: boolean;
}

const STORAGE_KEY_SCENE = 'cristi_ai_scene_v4';

export class SceneManager {
  public sceneId: 'transparent' | 'matrix_rain';
  private listeners = new Set<(scene: SceneState) => void>();

  constructor() {
    this.sceneId = this.loadSavedScene();
  }

  private loadSavedScene(): 'transparent' | 'matrix_rain' {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY_SCENE);
        if (saved === 'matrix_rain') return 'matrix_rain';
      }
    } catch (_) {}
    return 'transparent'; // Por defecto siempre transparente en escritorio
  }

  private saveState(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_SCENE, this.sceneId);
      }
    } catch (_) {}
  }

  public getScene(): SceneState {
    return {
      sceneId: this.sceneId,
      isSceneVisible: this.sceneId !== 'transparent'
    };
  }

  /**
   * Alterna entre el fondo Transparente y la Lluvia de Matriz
   */
  public toggleBackdrop(): boolean {
    this.sceneId = this.sceneId === 'transparent' ? 'matrix_rain' : 'transparent';
    this.saveState();

    logger.info('SCENE', `Alternancia de fondo: ${this.sceneId}`);
    eventBus.emit(EVENTS.SCENE_CHANGED, this.getScene());
    this.notify();

    return this.sceneId !== 'transparent';
  }

  public onSceneChange(callback: (scene: SceneState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const state = this.getScene();
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('[SceneManager] Error en callback de listener:', err);
      }
    });
  }
}

export const sceneManager = new SceneManager();
export default sceneManager;
