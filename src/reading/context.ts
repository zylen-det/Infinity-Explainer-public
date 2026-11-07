import { createContext, useContext, type ReactNode } from 'react'

type ReadingContextValue = {
  overlay: ReactNode
  activeId: string | null
  hoveredTarget: string | null
  hover: (id: string | null) => void
  enter: (id?: string) => void
  exit: () => void
  snap: () => void
  zoomTo: (zoom?: number) => void
}
export const ReadingContext = createContext<ReadingContextValue>(null!)
export const useReadingMode = () => useContext(ReadingContext)
