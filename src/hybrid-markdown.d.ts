declare module 'codemirror-markdown-hybrid' {
  import type { Extension } from '@codemirror/state'
  import type { EditorView } from '@codemirror/view'
  export function hybridMarkdown(options?: { theme?: 'light' | 'dark'; enablePreview?: boolean; enableCollapse?: boolean }): Extension[]
  export function setTheme(view: EditorView, theme: 'light' | 'dark'): void
}
