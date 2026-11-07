import { useEffect, useRef } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { ArrowLeft, ArrowRotateCcw, Moon, Sun } from '@openai/apps-sdk-ui/components/Icon'
import { LLMConfigPanel } from './LLMConfigPanel'
import type { LLMConfig } from '../core/types'

import type { Appearance } from '../services/Appearance'

function colorHex(value: string) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  return '#' + Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    .map(channel => channel.toString(16).padStart(2, '0')).join('')
}

function ColorSetting({ name, label, token, appearance, onChange }: {
  name: 'canvas' | 'card' | 'text'
  label: string
  token: string
  appearance: Appearance
  onChange: (appearance: Appearance) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const hexInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const style = getComputedStyle(document.querySelector('.app')!)
    const value = appearance[name] ?? colorHex(style.getPropertyValue(token).trim())
    if (input.current) input.current.value = value
    if (hexInput.current) {
      hexInput.current.value = value
      hexInput.current.setCustomValidity('')
      hexInput.current.removeAttribute('aria-invalid')
    }
  }, [appearance, name, token])
  const commitHex = (field: HTMLInputElement) => {
    const raw = field.value.trim().replace(/^#/, '')
    if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(raw)) {
      field.setCustomValidity('請輸入有效的 HEX 色碼，例如 #336699。')
      field.setAttribute('aria-invalid', 'true')
      field.reportValidity()
      return
    }
    const value = '#' + (raw.length === 3 ? [...raw].map(char => char + char).join('') : raw).toLowerCase()
    field.value = value
    field.setCustomValidity('')
    field.removeAttribute('aria-invalid')
    onChange({ ...appearance, [name]: value })
  }
  return <div className="color-setting">
    <label htmlFor={`appearance-${name}`}>{label}</label>
    <div className="color-setting-inputs">
      <Button color="secondary" variant="ghost" size="lg" uniform aria-label={`重設${label}`}
        title={`重設${label}`} onClick={() => {
          const next = { ...appearance }
          delete next[name]
          onChange(next)
        }}><ArrowRotateCcw /></Button>
      <Input ref={hexInput} id={`appearance-${name}`} className="color-hex-input" size="lg"
        aria-label={`${label} HEX`} placeholder="#336699" spellCheck={false} autoComplete="off"
        onChange={event => {
          const field = event.currentTarget
          field.setCustomValidity('')
          field.removeAttribute('aria-invalid')
          if (/^#?[\da-f]{6}$/i.test(field.value.trim())) commitHex(field)
        }}
        onBlur={event => commitHex(event.currentTarget)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commitHex(event.currentTarget) }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.value = input.current!.value
            event.currentTarget.setCustomValidity('')
            event.currentTarget.removeAttribute('aria-invalid')
          }
        }} />
      <input ref={input} type="color" aria-label={label}
        onChange={event => onChange({ ...appearance, [name]: event.target.value })} />
    </div>
  </div>
}

export function SettingsPage({ appearance, onAppearanceChange, config, onSaveConfig, onClose }: {
  appearance: Appearance
  onAppearanceChange: (appearance: Appearance) => void
  config?: LLMConfig
  onSaveConfig: (config: LLMConfig) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const backdropPressed = useRef(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { previous?.focus({ preventScroll: true }) }
  }, [])

  // Read resolved theme tokens so the swatches always match the actual defaults.
  const fields = [
    ['canvas', '畫布背景顏色', '--bg'],
    ['card', 'Card 背景顏色', '--card'],
    ['text', '文字顏色', '--text'],
  ] as const

  return <dialog ref={dialog} className="settings-page" aria-labelledby="settings-title"
    onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      backdropPressed.current = event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)
    }}
    onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      if (backdropPressed.current && event.target === event.currentTarget &&
        (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose()
      backdropPressed.current = false
    }}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="settings-content">
      <header className="settings-header">
        <Button color="secondary" variant="ghost" size="xl" uniform aria-label="返回畫布" title="返回畫布" onClick={onClose}><ArrowLeft /></Button>
        <h1 id="settings-title">設定</h1>
      </header>
      <section className="appearance-settings" aria-labelledby="appearance-title">
        <div className="appearance-header">
          <h2 id="appearance-title">外觀</h2>
          <Button color="secondary" variant="ghost" size="lg" uniform aria-label="重設外觀" title="重設外觀"
            onClick={() => onAppearanceChange({ theme: appearance.theme })}><ArrowRotateCcw /></Button>
        </div>
        <p>選擇預設主題，或自訂畫布、卡片與文字的顏色。變更會自動儲存。</p>
        <div className="theme-presets" role="group" aria-label="預設主題">
          <Button color="secondary" variant="outline" aria-label="Light mode"
            aria-pressed={appearance.theme === 'light' && !appearance.canvas && !appearance.card && !appearance.text}
            onClick={() => onAppearanceChange({ theme: 'light' })}><Sun />淺色</Button>
          <Button color="secondary" variant="outline" aria-label="Dark mode"
            aria-pressed={appearance.theme === 'dark' && !appearance.canvas && !appearance.card && !appearance.text}
            onClick={() => onAppearanceChange({ theme: 'dark' })}><Moon />深色</Button>
        </div>
        {fields.map(([key, label, token]) => <ColorSetting key={key} name={key} label={label} token={token}
          appearance={appearance} onChange={onAppearanceChange} />)}
      </section>
      {config && <LLMConfigPanel config={config} onSave={onSaveConfig} />}
    </div>
  </dialog>
}
