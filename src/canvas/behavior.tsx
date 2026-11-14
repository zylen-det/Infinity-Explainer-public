import { createContext, useContext } from 'react'
import type { SelectionAnchor } from '../core/selectionAnchor'
import type { ILLMService } from '../core/types'
import type { Viewport } from './store'

/** Optional UI actions. Omitted callbacks retain the standalone local behavior. */
export interface CanvasBehavior {
  persistence?: 'browser' | 'manual'
  modelSettings?: boolean
  resultUpdates?: 'stream' | 'manual'
  onCreateCard?(id: string, parentId: string | null, selection?: SelectionAnchor): Promise<void>
  onSaveCard?(id: string, text: string): Promise<void>
  onImport?(json: string): Promise<{ viewport?: Viewport }>
  onDelete?(ids: string[], detachIds: string[]): Promise<void>
  onAsk?(id: string, text: string, selection: SelectionAnchor): Promise<string>
  onCancel?(id: string): Promise<void>
  explain?: ILLMService['explainStream']
}

const defaults: CanvasBehavior = {}
export const CanvasBehaviorContext = createContext<CanvasBehavior>(defaults)
export const useCanvasBehavior = () => useContext(CanvasBehaviorContext)
