import { createContext } from 'react'

export const CardActionsContext = createContext<{
  target: HTMLElement | null
  setTarget: (target: HTMLDivElement | null) => void
}>(null!)
