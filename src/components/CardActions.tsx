import { useContext, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CardActionsContext } from './CardActionsContext'
import { useNodes } from '../canvas/context'
import { useReadingMode } from '../reading/context'

const query = '(max-width: 700px), (hover: none) and (pointer: coarse)'
const subscribe = (notify: () => void) => {
  const media = matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

/** Keep the same action handlers and editor state when moving mobile controls. */
export function CardActions({ id, children }: { id: string; children: ReactNode }) {
  const mobile = useSyncExternalStore(subscribe, () => matchMedia(query).matches)
  const nodes = useNodes()
  const reading = useReadingMode()
  const activeId = reading.activeId ?? nodes.find(node => node.selected)?.id
  const { target } = useContext(CardActionsContext)
  if (!mobile) return <>{children}</>
  return target && activeId === id ? createPortal(children, target) : null
}
