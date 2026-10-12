import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { soundFxService } from '../domain/audio/SoundFxService.js';

export interface DropdownOption {
  value: string;
  label?: string;
  name?: string;
  secondaryText?: string;
  badge?: string;
}

export interface TacticalDropdownProps {
  options?: DropdownOption[];
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  maxHeight?: string;
  className?: string;
}

export const TacticalDropdown: React.FC<TacticalDropdownProps> = React.memo(function TacticalDropdown({
  options = [],
  value,
  onChange,
  placeholder = 'Seleccionar...',
  icon: IconComponent,
  maxHeight = '180px',
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Scroll selected item into view on open
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector('.tactical-option.selected') as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    soundFxService.playClick();
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (val: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    soundFxService.playClick();
    onChange?.(val);
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      className={`tactical-dropdown-container ${isOpen ? 'open' : ''} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Trigger Button */}
      <button
        type="button"
        className="tactical-dropdown-trigger"
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        <div className="tactical-dropdown-label-group">
          {IconComponent && <IconComponent size={12} className="tactical-dropdown-icon" />}
          <span className="tactical-dropdown-text">
            {selectedOption?.label || selectedOption?.name || placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="tactical-option-badge mini">{selectedOption.badge}</span>
          )}
        </div>
        <ChevronDown
          size={12}
          className={`tactical-chevron ${isOpen ? 'rotate' : ''}`}
        />
      </button>

      {/* Futuristic Obsidian Popup List */}
      {isOpen && (
        <div
          ref={listRef}
          className="tactical-dropdown-menu"
          style={{ maxHeight }}
          role="listbox"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                className={`tactical-option ${isSelected ? 'selected' : ''}`}
                onClick={(e) => handleSelect(opt.value, e)}
                role="option"
                aria-selected={isSelected}
              >
                <div className="tactical-option-left">
                  <span className="tactical-option-dot" />
                  <div className="tactical-option-info">
                    <span className="tactical-option-title">{opt.label || opt.name}</span>
                    {opt.secondaryText && (
                      <span className="tactical-option-sub">{opt.secondaryText}</span>
                    )}
                  </div>
                </div>

                <div className="tactical-option-right">
                  {opt.badge && (
                    <span className="tactical-option-badge">{opt.badge}</span>
                  )}
                  {isSelected && <Check size={11} className="tactical-check" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default TacticalDropdown;
