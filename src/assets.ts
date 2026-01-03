import { CLASSES, ISLAND_CSS, BACKUP_CSS } from './constants';

export const ICONS = {
  // Material Symbols (Rounded)
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.09a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.09a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.09a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.09a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21.0344C8.76993 21.0344 8.56708 20.9416 8.39143 20.7559C8.21579 20.5702 8.12797 20.3557 8.12797 20.1124C8.12797 19.1226 7.91503 18.2323 7.48915 17.4416C7.06327 16.6509 6.49547 16.0232 5.78575 15.5586C5.07604 15.0939 4.25807 14.8616 3.33185 14.8616C3.10178 14.8616 2.89893 14.7688 2.72329 14.5831C2.54764 14.3975 2.45982 14.1829 2.45982 13.9397C2.45982 13.6964 2.54764 13.4819 2.72329 13.2962C2.89893 13.1105 3.10178 13.0177 3.33185 13.0177C4.25807 13.0177 5.07604 12.7853 5.78575 12.3207C6.49547 11.856 7.06327 11.2283 7.48915 10.4376C7.91503 9.64692 8.12797 8.75664 8.12797 7.76681C8.12797 7.52355 8.21579 7.30903 8.39143 7.12334C8.56708 6.93765 8.76993 6.8448 9 6.8448C9.23007 6.8448 9.43292 6.93765 9.60857 7.12334C9.78421 7.30903 9.87203 7.52355 9.87203 7.76681C9.87203 8.75664 10.085 9.64692 10.5109 10.4376C10.9367 11.2283 11.5045 11.856 12.2143 12.3207C12.924 12.7853 13.742 13.0177 14.6682 13.0177C14.8982 13.0177 15.1011 13.1105 15.2767 13.2962C15.4524 13.4819 15.5402 13.6964 15.5402 13.9397C15.5402 14.1829 15.4524 14.3975 15.2767 14.5831C15.1011 14.7688 14.8982 14.8616 14.6682 14.8616C13.742 14.8616 12.924 15.0939 12.2143 15.5586C11.5045 16.0232 10.9367 16.6509 10.5109 17.4416C10.085 18.2323 9.87203 19.1226 9.87203 20.1124C9.87203 20.3557 9.78421 20.5702 9.60857 20.7559C9.43292 20.9416 9.23007 21.0344 9 21.0344Z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  dropdown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
};

export const BACKUP_STYLES = `
  :root {
    --bg: ${BACKUP_CSS.colors.bg};
    --surface: ${BACKUP_CSS.colors.surface};
    --text: ${BACKUP_CSS.colors.text};
    --border: ${BACKUP_CSS.colors.border};
    --font: ${BACKUP_CSS.font.family};
    --shadow: ${BACKUP_CSS.shadows.base};
    --img-shadow: ${BACKUP_CSS.shadows.image};
  }

  body {
    margin: 0;
    height: 100vh;
    display: flex;
    background-color: var(--bg);
    overflow: hidden;
  }

  .${CLASSES.imageContainer} {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: auto;
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    box-shadow: var(--img-shadow);
  }

  .${CLASSES.banner} {
    position: fixed;
    bottom: ${BACKUP_CSS.layout.bannerBottom}px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    color: var(--text);
    padding: ${BACKUP_CSS.layout.bannerPadding};
    border-radius: ${BACKUP_CSS.layout.bannerRadius}px;
    box-shadow: var(--shadow);
    font-family: var(--font);
    font-size: ${BACKUP_CSS.font.size}px;
    font-weight: ${BACKUP_CSS.font.weight};
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: ${BACKUP_CSS.layout.zIndex};
    border: 1px solid var(--border);
  }
`;

export const ISLAND_STYLES = `
:host {
  --bg: ${ISLAND_CSS.colors.bg};
  --surface: ${ISLAND_CSS.colors.surfaceContainer};
  --text: ${ISLAND_CSS.colors.textMain};
  --text-muted: ${ISLAND_CSS.colors.textMuted};
  --success: ${ISLAND_CSS.colors.accentSuccess};
  --error: ${ISLAND_CSS.colors.accentError};
  --hover: ${ISLAND_CSS.colors.hoverBg};
  --active: ${ISLAND_CSS.colors.activeBg};
  --gradient: ${ISLAND_CSS.colors.gradient};
  --primary: ${ISLAND_CSS.colors.primary};
  
  --p: ${ISLAND_CSS.layout.padding}px;
  --radius: ${ISLAND_CSS.layout.radius}px;
  --w-min: ${ISLAND_CSS.layout.widthCollapsed}px;
  --w-max: ${ISLAND_CSS.layout.widthExpanded}px;
  --h-min: ${ISLAND_CSS.layout.heightCollapsed}px;
  --img-size: ${ISLAND_CSS.layout.imageSize}px;
  
  --font-main: ${ISLAND_CSS.font.family};
  --font-mono: ${ISLAND_CSS.font.mono};
  --ease: ${ISLAND_CSS.animation.base};
  --shadow: ${ISLAND_CSS.shadows.base};
  --shadow-expanded: ${ISLAND_CSS.shadows.expanded};
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.${CLASSES.island} {
  position: fixed;
  z-index: ${ISLAND_CSS.layout.zIndex};
  display: block;
  padding: var(--p);
  min-width: var(--w-min);
  max-width: var(--w-max);
  min-height: var(--h-min);
  height: auto;
  
  background: var(--bg);
  box-shadow: var(--shadow);
  border-radius: var(--radius);

  font-family: var(--font-main);
  color: var(--text);
  
  transition: height var(--ease), max-height var(--ease), opacity ${ISLAND_CSS.animation.fast}, width var(--ease), box-shadow var(--ease);
  overflow: hidden;
  /* Hinting for better rendering */
  -webkit-font-smoothing: antialiased;
}

.${CLASSES.island}.${CLASSES.expanded} {
  width: var(--w-max);
  box-shadow: var(--shadow-expanded);
}

/* Gemini/Loading Gradient Border Effect */
.${CLASSES.island}::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  padding: ${ISLAND_CSS.borders.gradient};
  background: var(--gradient);
  -webkit-mask: 
     linear-gradient(#fff 0 0) content-box, 
     linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity ${ISLAND_CSS.animation.gradient};
  pointer-events: none;
  z-index: 1;
}

/* Show gradient when loading status exists inside */
.${CLASSES.island}:has(.${CLASSES.status}:not(.${CLASSES.success}):not(.${CLASSES.error}):contains("Processing"))::before,
.${CLASSES.island}.${CLASSES.loading}::before {
  opacity: 1;
}

/* Row Layout */
.${CLASSES.row} {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: ${ISLAND_CSS.spacing.xxl}px;
  width: 100%;
}

/* Image */
.${CLASSES.image} {
  width: var(--img-size);
  height: var(--img-size);
  border-radius: ${ISLAND_CSS.layout.radiusSmall}px;
  object-fit: cover;
  background: var(--surface);
  /* Subtle border just for image definition */
  border: ${ISLAND_CSS.borders.subtle};
  cursor: grab;
}
.${CLASSES.image}:active { cursor: grabbing; }

/* Content Area */
.${CLASSES.content} {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${ISLAND_CSS.spacing.xs}px;
}

.${CLASSES.status} {
  font-size: ${ISLAND_CSS.font.sizeNormal}px;
  font-weight: ${ISLAND_CSS.font.weightMedium};
  display: flex;
  align-items: center;
  gap: ${ISLAND_CSS.spacing.md}px;
  color: var(--text);
  line-height: ${ISLAND_CSS.font.lineHeightNormal};
}
.${CLASSES.status}.${CLASSES.success} { color: var(--success); }
.${CLASSES.status}.${CLASSES.error} { color: var(--error); }

.${CLASSES.preview} {
  font-size: ${ISLAND_CSS.font.sizeSmall}px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color ${ISLAND_CSS.animation.fast};
}
.${CLASSES.preview}:hover { color: var(--primary); }

/* Textarea */
.${CLASSES.textarea} {
  display: none;
  width: 100%;
  min-height: ${ISLAND_CSS.layout.heightExpanded}px;
  max-height: ${ISLAND_CSS.layout.heightMax}px;
  margin-top: var(--p);
  padding: ${ISLAND_CSS.spacing.xxl}px ${ISLAND_CSS.spacing.xxxl}px;

  /* Material Surface Container */
  background: var(--surface);
  border: none;
  border-radius: ${ISLAND_CSS.layout.radiusMedium}px;

  color: var(--text);
  font-size: ${ISLAND_CSS.font.sizeSmall}px;
  font-family: var(--font-mono);
  line-height: ${ISLAND_CSS.font.lineHeightRelaxed};
  resize: none;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: ${ISLAND_CSS.colors.scrollbarThumb} transparent;
}
.${CLASSES.textarea}::-webkit-scrollbar { width: ${ISLAND_CSS.layout.radiusSmall}px; }
.${CLASSES.textarea}::-webkit-scrollbar-track { background: transparent; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb { background: ${ISLAND_CSS.colors.scrollbarThumb}; border-radius: ${ISLAND_CSS.spacing.sm}px; }
.${CLASSES.textarea}::-webkit-scrollbar-thumb:hover { background: ${ISLAND_CSS.colors.scrollbarThumbHover}; }
.${CLASSES.textarea}:focus { box-shadow: inset 0 0 0 1px var(--primary); }

/* Actions */
.${CLASSES.actions} { display: flex; align-items: center; gap: ${ISLAND_CSS.spacing.sm}px; }

.${CLASSES.btn} {
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${ISLAND_CSS.layout.buttonSize}px;
  height: ${ISLAND_CSS.layout.buttonSize}px;
  background: transparent;
  border: none;
  border-radius: ${ISLAND_CSS.layout.radiusFull};
  cursor: pointer;
  color: var(--text-muted);
  transition: background ${ISLAND_CSS.animation.quick}, color ${ISLAND_CSS.animation.quick}, transform 0.1s ease;
}
.${CLASSES.btn}:hover { background: var(--hover); color: var(--text); }
.${CLASSES.btn}:active { background: var(--active); transform: scale(0.96); }
.${CLASSES.btn}.${CLASSES.success} { color: var(--success); background: ${ISLAND_CSS.colors.accentSuccessBg}; }
.${CLASSES.btn}.${CLASSES.loading} { color: var(--primary); }
.${CLASSES.btn}.${CLASSES.loading} svg { animation: spin ${ISLAND_CSS.animation.spin};  }
.${CLASSES.btn} svg { width: ${ISLAND_CSS.layout.iconSize}px; height: ${ISLAND_CSS.layout.iconSize}px; }

/* Settings */
.${CLASSES.settings} {
  position: relative;
  z-index: 2;
  display: none;
  flex-direction: column;
  gap: ${ISLAND_CSS.spacing.xl}px;
  padding-top: ${ISLAND_CSS.spacing.xxl}px;
  margin-top: ${ISLAND_CSS.spacing.xxl}px;
  border-top: ${ISLAND_CSS.borders.subtle};
}
.${CLASSES.island}.${CLASSES.expandSettings} .${CLASSES.settings} { display: flex; }

.${CLASSES.settingRow} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: ${ISLAND_CSS.font.sizeNormal}px;
  font-weight: ${ISLAND_CSS.font.weightMedium};
  color: var(--text-muted);
  padding: 0 ${ISLAND_CSS.spacing.xs}px;
}

.${CLASSES.toggle} {
  position: relative;
  width: ${ISLAND_CSS.layout.toggleWidth}px; /* Standard Material switch size */
  height: ${ISLAND_CSS.layout.toggleHeight}px;
  background: ${ISLAND_CSS.colors.toggleInactive}; /* Surface Variant */
  border-radius: ${ISLAND_CSS.layout.radiusPill}px;
  cursor: pointer;
  transition: background ${ISLAND_CSS.animation.fast}, border ${ISLAND_CSS.animation.fast};
  border: ${ISLAND_CSS.borders.toggle};
}
.${CLASSES.toggle}.${CLASSES.active} { 
  background: ${ISLAND_CSS.colors.toggleActive};
  border-color: ${ISLAND_CSS.colors.toggleActive};
}
.${CLASSES.toggle}::after {
  content: '';
  position: absolute;
  top: ${ISLAND_CSS.spacing.xs}px;
  left: ${ISLAND_CSS.spacing.xs}px;
  width: ${ISLAND_CSS.layout.toggleKnobSize}px;
  height: ${ISLAND_CSS.layout.toggleKnobSize}px;
  background: var(--bg);
  border-radius: ${ISLAND_CSS.layout.radiusFull};
  box-shadow: ${ISLAND_CSS.shadows.toggleKnob};
  transition: transform ${ISLAND_CSS.animation.fast}, width ${ISLAND_CSS.animation.fast}, height ${ISLAND_CSS.animation.fast};
}
.${CLASSES.toggle}:active::after {
  width: ${ISLAND_CSS.layout.toggleKnobSizeActive}px; /* Touch feedback */
}
.${CLASSES.toggle}.${CLASSES.active}::after { 
  transform: translateX(${ISLAND_CSS.layout.toggleKnobSizeActive}px);
  background: var(--bg);
}

/* Settings Action Button */
.${CLASSES.settingsActionBtn} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: ${ISLAND_CSS.layout.buttonHeightCompact}px;
  padding: 0 ${ISLAND_CSS.spacing.xxxl}px;
  min-width: unset;

  background: ${ISLAND_CSS.colors.surfaceContainerHigh};
  color: ${ISLAND_CSS.colors.textMain};
  border: 1px solid transparent; 
  border-radius: ${ISLAND_CSS.layout.radiusPill}px;

  font-family: var(--font-main);
  font-size: ${ISLAND_CSS.font.sizeNormal}px;
  font-weight: ${ISLAND_CSS.font.weightMedium};
  cursor: pointer;
  user-select: none;
  transition: background ${ISLAND_CSS.animation.fast}, color ${ISLAND_CSS.animation.fast}, transform 0.1s ease;
}
.${CLASSES.settingsActionBtn}:hover {
  background: ${ISLAND_CSS.colors.hoverBgDark};
  color: ${ISLAND_CSS.colors.primary};
}
.${CLASSES.settingsActionBtn}:active {
  background: ${ISLAND_CSS.colors.activeBgDark};
  transform: scale(0.96);
}

/* Animations */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Dropdown */
.${CLASSES.selectWrapper} {
  position: relative;
  height: ${ISLAND_CSS.layout.buttonHeightCompact}px;
  max-width: 140px;
  min-width: 140px;
}

.${CLASSES.settingsSelect} {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: ${ISLAND_CSS.layout.buttonHeightCompact}px;

  /* Material 3 Surface Container High (Same as settings buttons) */
  background: ${ISLAND_CSS.colors.surfaceContainerHigh};
  color: ${ISLAND_CSS.colors.textMain};
  border: 1px solid transparent;
  border-radius: ${ISLAND_CSS.layout.radiusPill}px;

  padding: 0 32px 0 16px;

  font-family: inherit;
  font-size: ${ISLAND_CSS.font.sizeNormal}px;
  font-weight: ${ISLAND_CSS.font.weightMedium};
  cursor: pointer;
  outline: none;

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  transition: background ${ISLAND_CSS.animation.fast}, color ${ISLAND_CSS.animation.fast}, color ${ISLAND_CSS.animation.fast},  transform 0.1s ease;
}

.${CLASSES.settingsSelect}:hover {
  background: ${ISLAND_CSS.colors.hoverBgDark};
  color: ${ISLAND_CSS.colors.primary};
}

.${CLASSES.settingsSelect}:focus {
  background: ${ISLAND_CSS.colors.surfaceContainerHigh};
  color: ${ISLAND_CSS.colors.textMuted};
}

.${CLASSES.selectIcon} {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: ${ISLAND_CSS.layout.iconSizeSmall}px;
  height: ${ISLAND_CSS.layout.iconSizeSmall}px;
  pointer-events: none; /* Clicks pass through to the select */
  color: ${ISLAND_CSS.colors.textMuted};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color ${ISLAND_CSS.animation.fast};
}
`;
