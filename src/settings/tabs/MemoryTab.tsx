import React, { useState, useEffect } from 'react';
import { Database, Plus, Trash2, Search, Tag, Filter } from 'lucide-react';
import { memoryService, MEMORY_CATEGORIES } from '../../domain/integrations/memory/MemoryService.js';
import { soundFxService } from '../../domain/audio/SoundFxService.js';
import { toastService } from '../../infrastructure/notifications/toastService.js';

export const MemoryTab: React.FC = () => {
  const [memories, setMemories] = useState<any[]>(() => {
    try {
      return memoryService.getAllMemories() || [];
    } catch (_) {
      return [];
    }
  });

  const [memSearch, setMemSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemCategory, setNewMemCategory] = useState<string>(MEMORY_CATEGORIES.FACT);

  const refreshMemories = async () => {
    await memoryService.loadMemories();
    memoryService.rebuildIndex();
    setMemories(memoryService.getAllMemories() || []);
  };

  useEffect(() => {
    let disposed = false;
    void memoryService.initialize()
      .catch(() => undefined)
      .finally(() => {
        if (!disposed) void refreshMemories().catch(() => undefined);
      });
    return () => { disposed = true; };
  }, []);

  const handleSaveMemory = async () => {
    if (!newMemKey.trim() || !newMemContent.trim()) return;
    soundFxService.playClick();
    await memoryService.remember({
      key: newMemKey.trim(),
      content: newMemContent.trim(),
      category: newMemCategory
    });
    await refreshMemories();
    setNewMemKey('');
    setNewMemContent('');
    toastService.success('Recuerdo añadido', `Se guardó "${newMemKey.trim()}" en la memoria de Cristi.`);
  };

  const handleDeleteMemory = async (key: string) => {
    soundFxService.playClick();
    let removed = false;
    if (typeof (memoryService as any).deleteMemory === 'function') {
      removed = await (memoryService as any).deleteMemory(key);
    } else if (typeof (memoryService as any).forget === 'function') {
      removed = await (memoryService as any).forget(key);
    } else {
      removed = (await (memoryService as any).manageMemory({ action: 'forget', key })).status === 'success';
    }
    if (!removed) throw new Error('El recuerdo ya no existe o no se pudo eliminar.');
    await refreshMemories();
    toastService.info('Recuerdo eliminado', `Se eliminó "${key}".`);
  };

  const filteredMemories = memories.filter((m) => {
    const matchesSearch =
      !memSearch ||
      (m.key && m.key.toLowerCase().includes(memSearch.toLowerCase())) ||
      (m.content && m.content.toLowerCase().includes(memSearch.toLowerCase()));
    const matchesCategory =
      selectedCategoryFilter === 'all' || m.category === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categoryBadgeColors: Record<string, string> = {
    fact: 'text-blue-300 bg-blue-950/60 border-blue-800/60',
    preference: 'text-purple-300 bg-purple-950/60 border-purple-800/60',
    relationship: 'text-rose-300 bg-rose-950/60 border-rose-800/60',
    task: 'text-amber-300 bg-amber-950/60 border-amber-800/60',
    conversation: 'text-cyan-300 bg-cyan-950/60 border-cyan-800/60'
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1">
      {/* Encabezado */}
      <div>
        <h2 className="text-sm font-semibold font-mono uppercase tracking-wider text-zinc-100 flex items-center gap-2">
          <Database size={16} className="text-zinc-400" />
          Memoria Contextual a Largo Plazo
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Hechos, gustos y rutinas consolidados en la memoria de Cristi.
        </p>
      </div>

      {/* Buscador y Filtro por Categoría */}
      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={memSearch}
            onChange={(e) => setMemSearch(e.target.value)}
            placeholder="Buscar recuerdos almacenados por clave o contenido..."
            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Filter size={12} className="text-zinc-500" />
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-sm focus:outline-none focus:border-zinc-600"
          >
            <option value="all">Todas las categorías ({memories.length})</option>
            {Object.values(MEMORY_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Formulario Añadir Recuerdo Manual */}
      <div className="border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2 rounded-sm">
        <span className="text-xs font-mono font-medium text-zinc-200 block">
          Añadir Recuerdo Manual
        </span>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={newMemKey}
            onChange={(e) => setNewMemKey(e.target.value)}
            placeholder="Clave única (ej. comida_favorita)..."
            className="px-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-500"
          />
          <select
            value={newMemCategory}
            onChange={(e) => setNewMemCategory(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-500"
          >
            {Object.values(MEMORY_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={newMemContent}
          onChange={(e) => setNewMemContent(e.target.value)}
          placeholder="Descripción detallada del recuerdo o hecho..."
          className="w-full px-3 py-1.5 text-xs font-mono bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-sm focus:outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          onClick={handleSaveMemory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-white rounded-sm border border-zinc-700 transition-colors font-medium"
        >
          <Plus size={12} /> Guardar Recuerdo
        </button>
      </div>

      {/* Lista de Recuerdos */}
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        {filteredMemories.map((m) => {
          const colorClasses = categoryBadgeColors[m.category] || 'text-zinc-400 bg-zinc-800 border-zinc-700';
          return (
            <div
              key={m.key || m.id}
              className="flex items-center justify-between p-2.5 bg-zinc-900/40 border border-zinc-800 rounded-sm text-xs font-mono hover:border-zinc-700 transition-colors"
            >
              <div className="min-w-0 flex-1 mr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-200">{m.key || m.id}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-none border ${colorClasses}`}>
                    {m.category}
                  </span>
                  {m.confidence !== undefined && (
                    <span className="text-[10px] text-zinc-500">
                      Conf: {Math.round(m.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{m.content}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteMemory(m.key || m.id)}
                className="p-1 text-zinc-500 hover:text-rose-400 transition-colors shrink-0"
                title="Eliminar recuerdo"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {filteredMemories.length === 0 && (
          <p className="text-xs text-zinc-500 font-mono italic text-center py-6 border border-dashed border-zinc-800/80 rounded-sm">
            {memories.length === 0
              ? 'No hay recuerdos almacenados aún.'
              : 'No se encontraron recuerdos que coincidan con la búsqueda.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default MemoryTab;
