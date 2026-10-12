/**
 * Cristi AI — Master Service & Domain Facade (TypeScript)
 * Unifies new domain engines, Zustand stores, and service adapters.
 */

// Modern domain engines & stores

// Core utilities
export { eventBus, EVENTS } from '../infrastructure/events/eventBus';
export { logger } from '../infrastructure/logging/logger';
export { ToastService, toastService, toast } from '../infrastructure/notifications/toastService';
export { ElectronBridge, electronBridge } from '../services/desktop/ElectronBridge';
export { ClickThroughService, clickThroughService } from '../services/desktop/ClickThroughService';

// Legacy service adapters & instances
export { AudioAnalysisService } from '../domain/audio/AudioAnalysisService';
export { GeminiLiveClient as GeminiLiveSocket } from '../domain/gemini/GeminiLiveClient';
export { AudioInputProcessor as AudioInputService } from '../domain/gemini/AudioInputProcessor';
export { AudioOutputPlayer as AudioOutputService } from '../domain/gemini/AudioOutputPlayer';
export { CameraService } from '../domain/sensory/CameraService';
export { LocalVisionRuntime } from '../domain/sensory/LocalVisionRuntime';
export { ScreenCaptureService } from '../domain/sensory/ScreenCaptureService';
export { SystemTrayService } from '../services/desktop/SystemTrayService';
export { ToolExecutor } from '../domain/tools/ToolExecutor';
export { VisionDetectionService } from '../domain/sensory/VisionDetectionService';
export { Live2DModelRegistry, live2dModelRegistry, Live2DAdapter, Live2DController, ContextualEmotionOrchestrator, contextualEmotionOrchestrator } from '../domain/live2d/index';
export { ExternalDeviceManager, externalDeviceManager } from '../domain/integrations/externalDevices/index';
export { ModelManager, modelManager } from '../domain/gemini/ModelManager';
export { ConfigManager, configManager } from '../infrastructure/config/ConfigManager';
export { SoundFxService, soundFxService } from '../domain/audio/SoundFxService';
export { ProactiveTriggerService, proactiveTriggerService } from '../domain/interaction/ProactiveTriggerService';
export { ProactiveScheduler, proactiveScheduler } from '../domain/interaction/ProactiveScheduler';
export { SceneManager, sceneManager } from '../domain/scenes/SceneManager';
export { PerformanceProfilerService, performanceProfiler } from '../infrastructure/profiler/PerformanceProfilerService';
export { RuntimeBudgetCoordinator, runtimeBudgetCoordinator } from '../domain/runtime/RuntimeBudgetCoordinator';
export { RuntimeDiagnosticsRecorder, runtimeDiagnosticsRecorder } from '../domain/runtime/RuntimeDiagnosticsRecorder';
export { MemoryService, memoryService, MEMORY_CATEGORIES } from '../domain/integrations/memory/MemoryService';
export { MemoryRepository } from '../domain/integrations/memory/MemoryRepository';
export { MemoryIndex } from '../domain/integrations/memory/MemoryIndex';
export { MCPClientManager, mcpClientManager } from '../domain/integrations/mcp/MCPClientManager';
export { VisionStreamManager, visionStreamManager } from '../domain/sensory/vision/VisionStreamManager';
export { VisionFrameDispatcher, visionFrameDispatcher } from '../domain/sensory/vision/VisionFrameDispatcher';
export { IntegrationHealthRegistry, integrationHealthRegistry } from '../domain/integrations/IntegrationHealth';
