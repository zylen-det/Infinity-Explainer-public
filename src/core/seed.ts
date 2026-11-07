import type { ExplainerNodeData } from './types'
import { dictionary } from '../dictionary'
import { createId } from './createId'

export const demoTerms = Object.keys(dictionary)

export const initialText = `各特徵對應提取方式：
• 音色（Timbre）：用 MFCC（Mel-Frequency Cepstral Coefficients）、Spectral Centroid、Spectral Contrast、Zero Crossing Rate。這些最能捕捉音色的「質感」。
• 鼓點安排方式（Drum Patterns）：用 onset detection + beat tracking 算出 kick/snare/hat 的密度、間隔模式、syncopation（切分音）。可先用 harmonic-percussive source separation 把鼓分離出來再分析。
• 整首歌結構（Song Structure）：用 novelty curve（新穎度函數）或 Self-Similarity Matrix（SSM）來偵測 verse-chorus-drop 段落變化。常見做法是對 chroma 或 MFCC 算結構重複性。
• Wobble處理（Future Bass 特色）：這部分沒有現成函數，需要自訂。做法是：
    • 先 bandpass 濾波低頻區（20-250 Hz，bass 範圍）。
    • 計算該頻段的 RMS envelope 或 spectral flux。
    • 用 autocorrelation 或 FFT 偵測是否有週期性調變（LFO 效果，通常 0.5-8 Hz 的 wobble 頻率）。
    • 若有明顯的 periodic modulation，就給高分。`

export function createSeedNode(): {
  id: string
  type: string
  position: { x: number; y: number }
  width: number
  height: number
  data: ExplainerNodeData
} {
  return {
    id: createId(),
    type: 'explainer',
    position: { x: 200, y: 100 },
    width: 700,
    height: 420,
    data: {
      text: initialText,
      terms: demoTerms,
      userTerms: [],
      status: 'idle',
      errorMessage: '',
      w: 700,
      h: 420,
    },
  }
}
