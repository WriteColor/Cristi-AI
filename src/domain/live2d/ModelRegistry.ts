/**
 * Cristi AI - Live2D Model Registry & Emotional Parameter Mapping Engine
 * 
 * Provides strongly-typed registration, discovery, parameter normalization,
 * and emotional gesture resolution across the supported Live2D Cubism models.
 */

export type OfficialModelId = 'yanderegirl' | 'jane_doe';

export { Live2DModelRegistry as ModelRegistry, live2dModelRegistry as modelRegistry } from './Live2DModelRegistry';
