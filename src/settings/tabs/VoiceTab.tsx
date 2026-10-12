import React from 'react';
import {
  Sliders,
  VolumeX,
  Volume1,
  Sparkles,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { GEMINI_STANDARD_VOICES } from '../../config/voices.js';
import { soundFxService } from '../../domain/audio/SoundFxService.js';

export const VoiceTab: React.FC = () => {
  const modelId = useSettingsStore((s) => s.modelId);
  const voiceName = useSettingsStore((s) => s.voiceName);
  const voiceVolume = useSettingsStore((s) => s.voiceVolume);
  const setField = useSettingsStore((s) => s.setField);

  const selectedVoiceDef = GEMINI_STANDARD_VOICES.find((v) => v.name === voiceName);

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1">
      {/* Encabezado */}
      <div>
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-100 flex items-center gap-2">
          <span>Voces Femeninas Oficiales ({GEMINI_STANDARD_VOICES.length})</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Voces nativas de Google Gemini Live disponibles para Gemini 2.5, 3.1 y 3.8. Al cambiar la voz, la sesión se reinicia limpiamente para aplicar el nuevo timbre de forma inmediata.
        </p>
      </div>

      {/* Grid de Voces Oficiales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {GEMINI_STANDARD_VOICES.map((v) => {
          const isSelected = voiceName === v.name;
          return (
            <div
              key={v.name}
              onClick={() => {
                soundFxService.playClick();
                setField('voiceName', v.name);
              }}
              className={`p-3.5 border rounded-sm cursor-pointer transition-colors flex items-start justify-between gap-4 ${
                isSelected
                  ? 'bg-zinc-900 border-zinc-500 text-white shadow-sm'
                  : 'bg-zinc-900/30 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-semibold text-zinc-100">{v.name}</span>
                  {isSelected && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-emerald-300 rounded-none border border-emerald-800">
                      Activa
                    </span>
                  )}
                  {v.isRecommended && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-rose-950/70 text-rose-300 rounded-none border border-rose-700/60 flex items-center gap-1">
                      <Sparkles size={10} /> Principal
                    </span>
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-800/70">
                    Oficial (2.5, 3.1 & 3.8)
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-none border border-zinc-700/60">
                    {v.gender}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400 truncate">
                    • {v.trait}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {v.description}
                </p>
                {modelId?.includes('2.5') && !v.isUniversal && (
                  <p className="text-[11px] font-mono text-amber-400/90 mt-1.5">
                    En Gemini 2.5 se reproduce como {v.fallbackVoice}
                  </p>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* Controles Avanzados de Audio y Parámetros */}
      <div className="border border-zinc-800 bg-zinc-900/40 p-4 rounded-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <Sliders size={14} className="text-zinc-400" />
            Parámetros Acústicos & Detección de Voz
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Volumen Maestro */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-200 flex items-center gap-1.5">
                {voiceVolume === 0 ? <VolumeX size={13} className="text-zinc-400" /> : <Volume1 size={13} className="text-zinc-400" />}
                Volumen de Respuesta: {voiceVolume}%
              </span>
              <span className="text-zinc-400 text-[11px]">
                {voiceVolume > 80 ? 'Alto' : voiceVolume > 40 ? 'Normal' : 'Atenuado'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={voiceVolume}
              onChange={(e) => setField('voiceVolume', parseInt(e.target.value, 10))}
              className="w-full accent-zinc-200 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-zinc-500 block">
              Ajusta la ganancia de salida de audio generada por la síntesis neuronal.
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default VoiceTab;
