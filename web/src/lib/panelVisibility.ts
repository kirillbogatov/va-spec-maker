import { createContext, type Dispatch, type RefObject, type SetStateAction } from 'react';

/** Основное меню и список объектов сворачиваются одной кнопкой в шапке списка. */
export const PanelVisibilityContext = createContext<{
  collapsed: boolean;
  restoreButton: RefObject<HTMLButtonElement | null>;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
} | null>(null);
