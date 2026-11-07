import { TermRegistry } from './TermRegistry'
import { ExplanationService } from '../services/ExplanationService'

/**
 * Global singleton for explainer services.
 * Components import these directly instead of using React Context,
 * which avoids the $RefreshSig$ transform issue with custom hooks.
 */
export const termRegistry = new TermRegistry()
export const llmService = new ExplanationService()
