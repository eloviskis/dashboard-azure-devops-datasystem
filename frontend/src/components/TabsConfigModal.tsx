import React, { useState, useEffect } from 'react';

interface TabConfig {
  id: string;
  label: string;
  visible: boolean;
}

interface TabsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: TabConfig[];
  onSave: (tabs: TabConfig[]) => void;
}

const STORAGE_KEY = 'dashboard-tabs-config';

export const loadTabsConfig = (defaultTabs: TabConfig[]): TabConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: TabConfig[] = JSON.parse(saved);
      // Merge: keep saved order/visibility but add any new tabs
      const savedIds = parsed.map(t => t.id);
      const newTabs = defaultTabs.filter(t => !savedIds.includes(t.id));
      return [...parsed.filter(t => defaultTabs.some(dt => dt.id === t.id)), ...newTabs];
    }
  } catch {}
  return defaultTabs;
};

export const saveTabsConfig = (tabs: TabConfig[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
};

const TabsConfigModal: React.FC<TabsConfigModalProps> = ({ isOpen, onClose, tabs, onSave }) => {
  const [localTabs, setLocalTabs] = useState<TabConfig[]>(tabs);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setLocalTabs(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newTabs = [...localTabs];
    [newTabs[index - 1], newTabs[index]] = [newTabs[index], newTabs[index - 1]];
    setLocalTabs(newTabs);
  };

  const handleMoveDown = (index: number) => {
    if (index === localTabs.length - 1) return;
    const newTabs = [...localTabs];
    [newTabs[index], newTabs[index + 1]] = [newTabs[index + 1], newTabs[index]];
    setLocalTabs(newTabs);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newTabs = [...localTabs];
    const [movedItem] = newTabs.splice(dragIndex, 1);
    newTabs.splice(index, 0, movedItem);
    setLocalTabs(newTabs);
    setDragIndex(index);
  };

  const handleSelectAll = () => setLocalTabs(prev => prev.map(t => ({ ...t, visible: true })));
  const handleDeselectAll = () => setLocalTabs(prev => prev.map(t => ({ ...t, visible: false })));

  const handleSave = () => {
    onSave(localTabs);
    saveTabsConfig(localTabs);
    onClose();
  };

  const handleReset = () => {
    const resetTabs = tabs.map(t => ({ ...t, visible: true }));
    setLocalTabs(resetTabs);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-ds-border flex items-center justify-between">
          <h2 className="text-ds-light-text font-bold text-lg">⚙️ Configurar Abas</h2>
          <button onClick={onClose} className="text-ds-text hover:text-ds-light-text text-xl">&times;</button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
          <div className="flex gap-2 mb-3">
            <button onClick={handleSelectAll} className="text-xs bg-ds-green/10 text-ds-green px-3 py-1 rounded-md hover:bg-ds-green/20">Mostrar Todas</button>
            <button onClick={handleDeselectAll} className="text-xs bg-red-900/20 text-red-300 px-3 py-1 rounded-md hover:bg-red-900/30">Ocultar Todas</button>
            <button onClick={handleReset} className="text-xs bg-ds-muted/20 text-ds-text px-3 py-1 rounded-md hover:bg-ds-muted/30">Restaurar Padrão</button>
          </div>

          {localTabs.map((tab, index) => (
            <div
              key={tab.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 p-3 rounded-lg border ${dragIndex === index ? 'border-ds-green bg-ds-green/10' : 'border-ds-border bg-ds-navy'} cursor-grab active:cursor-grabbing`}
            >
              <span className="text-ds-text text-sm">☰</span>
              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tab.visible}
                  onChange={() => handleToggle(tab.id)}
                  className="form-checkbox h-4 w-4 text-ds-green rounded border-ds-border bg-ds-navy"
                />
                <span className={`text-sm ${tab.visible ? 'text-ds-light-text' : 'text-ds-text line-through'}`}>{tab.label}</span>
              </label>
              <div className="flex gap-1">
                <button onClick={() => handleMoveUp(index)} disabled={index === 0} className="text-xs px-2 py-1 bg-ds-muted/20 text-ds-text rounded hover:bg-ds-muted/30 disabled:opacity-30">▲</button>
                <button onClick={() => handleMoveDown(index)} disabled={index === localTabs.length - 1} className="text-xs px-2 py-1 bg-ds-muted/20 text-ds-text rounded hover:bg-ds-muted/30 disabled:opacity-30">▼</button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-ds-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-muted/20 text-ds-text rounded-md hover:bg-ds-muted/30">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue rounded-md font-semibold hover:bg-ds-green/80">Salvar</button>
        </div>
      </div>
    </div>
  );
};

export default TabsConfigModal;
