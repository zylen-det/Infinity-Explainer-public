export const dictionary: Record<string, string> = {
  MFCC: "Mel-Frequency Cepstral Coefficients，梅爾頻率倒譜係數。常用於語音和聲音特徵提取，能有效模擬人耳對頻率的感知特性。",
  "Spectral Centroid": "頻譜質心。代表聲音頻譜的「重心」，通常用來衡量聲音的「亮度」（brightness）。",
  "onset detection": "起始點偵測。用來找出音頻訊號中突然出現能量的高峰，通常對應到打擊樂器（如鼓點）的開始。",
  "beat tracking": "節拍追蹤。用來分析並推測音樂中的穩定拍子位置。",
  syncopation: "切分音。打破原本規律的強弱拍子結構，產生一種跳躍或不穩定的節奏感。",
  "harmonic-percussive source separation": "和聲-打擊聲源分離。將音檔拆分為包含所有明確音高元素的「和聲」部分與包含所有敲擊元素的「打擊」部分。",
  "novelty curve": "新穎度函數。用來表示時間軸上音頻特徵變化程度的曲線，峰值通常意味著音樂段落的轉換。",
  "Self-Similarity Matrix": "SSM，自我相似矩陣。將一段音樂與它各個時間點的特徵做比較，常被用來找出歌曲中重複的段落結構。",
  "bandpass 濾波": "帶通濾波。只允許特定頻段（低頻與高頻之間）的聲音通過，過濾掉其他頻率。",
  "RMS envelope": "均方根包絡線。計算音量在一段時間內的平均能量變化。",
  "spectral flux": "頻譜通量。相鄰幀頻譜間的變化量，數值高表示變化劇烈。",
  autocorrelation: "自相關。計算信號與其延遲版本的相似度，用來尋找週期性。",
  FFT: "快速傅立葉變換。將時間域的信號轉換為頻率域，幫助分析音頻包含哪些頻率成分。",
  "periodic modulation": "週期性調變。像LFO（低頻振盪器）一樣對參數進行週期性的變化控制。",
}

/** 出現在 initialText 中的關鍵詞，預設為初始 shape 的可點擊 terms */
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
