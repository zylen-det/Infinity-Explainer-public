import type { ExplanationResult, ILLMService } from '../core/types'
import type { ExplanationTarget } from '../../shared/canvas'
import { LLMService } from './LLMService'
import { hostService, isHosted } from './CanvasHost'

/** Local API calls stay in standalone mode; hosted requests use the conversation. */
export class ExplanationService implements ILLMService {
  private local = new LLMService()
  configure: ILLMService['configure'] = config => this.local.configure(config)
  getConfig: ILLMService['getConfig'] = () => this.local.getConfig()
  explain: ILLMService['explain'] = (term, context) => this.local.explain(term, context)

  async explainStream(
    term: string,
    onProgress: (fullText: string) => void,
    signal?: AbortSignal,
    context?: string,
    target?: ExplanationTarget,
  ): Promise<ExplanationResult> {
    if (!isHosted) return this.local.explainStream(term, onProgress, signal, context)
    if (!target) throw new Error('Missing target block')
    const result = await hostService.explain(term, target, context ?? '', signal)
    onProgress(result.explanation)
    return result
  }
}
