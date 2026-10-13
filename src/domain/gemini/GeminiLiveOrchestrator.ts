/**
 * Cristi AI - GeminiLiveOrchestrator
 * Model Orchestrator that maps each Gemini model family to its specialized controller.
 */

import { resolveLiveModelId, getLiveModelContract } from '../../config/models';
import type { IGeminiModelController } from './GeminiModelController';
import { gemini25NativeAudioController } from './Gemini25NativeAudioController';
import { gemini31LiveController } from './Gemini31LiveController';
import { gemini38LiveController } from './Gemini38LiveController';
import { gemini38ExtendedThinkingController } from './Gemini38ExtendedThinkingController';

export class GeminiLiveOrchestrator {
  public getController(modelId?: string): IGeminiModelController {
    const resolved = resolveLiveModelId(modelId);
    const contract = getLiveModelContract(resolved);

    switch (contract.family) {
      case 'gemini-3.8-live-extended-thinking':
        return gemini38ExtendedThinkingController;
      case 'gemini-3.8-live':
        return gemini38LiveController;
      case 'gemini-3.1-live':
        return gemini31LiveController;
      case 'gemini-2.5-native-audio':
      default:
        return gemini25NativeAudioController;
    }
  }
}

export const geminiLiveOrchestrator = new GeminiLiveOrchestrator();
export default geminiLiveOrchestrator;
