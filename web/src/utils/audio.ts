/**
 * Audio utilities – sound effects + VOICEVOX (Zundamon) / Web Speech API TTS
 */

// ── LocalStorage keys ──────────────────────────────────────────────────────
export const STORAGE_KEY_AUDIO_SOUND     = 'deck-audio-sound';
export const STORAGE_KEY_AUDIO_VOICE     = 'deck-audio-voice';
export const STORAGE_KEY_AUDIO_VOICEVOX  = 'deck-audio-voicevox-url';
export const STORAGE_KEY_AUDIO_SPEAKER   = 'deck-audio-speaker-id';

export interface AudioSettings {
  soundEnabled: boolean;
  voiceEnabled: boolean;
  voicevoxUrl: string;
  speakerId: number;
}

export function getAudioSettings(): AudioSettings {
  return {
    soundEnabled: localStorage.getItem(STORAGE_KEY_AUDIO_SOUND)  !== 'off',
    voiceEnabled: localStorage.getItem(STORAGE_KEY_AUDIO_VOICE)  === 'on',
    voicevoxUrl:  localStorage.getItem(STORAGE_KEY_AUDIO_VOICEVOX) ?? 'http://localhost:50021',
    speakerId:    Number(localStorage.getItem(STORAGE_KEY_AUDIO_SPEAKER) ?? '3'),
  };
}

export function saveAudioSettings(s: AudioSettings): void {
  localStorage.setItem(STORAGE_KEY_AUDIO_SOUND,    s.soundEnabled ? 'on' : 'off');
  localStorage.setItem(STORAGE_KEY_AUDIO_VOICE,    s.voiceEnabled ? 'on' : 'off');
  localStorage.setItem(STORAGE_KEY_AUDIO_VOICEVOX, s.voicevoxUrl);
  localStorage.setItem(STORAGE_KEY_AUDIO_SPEAKER,  String(s.speakerId));
}

// ── AudioContext (lazy, shared) ────────────────────────────────────────────
let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
    if (_ctx.state === 'suspended')       _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume = 0.15,
  type: OscillatorType = 'sine'
): void {
  const t    = ac.currentTime + startOffset;
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

// ── Sound Effects ──────────────────────────────────────────────────────────

/** 完了チャイム（BEL や進捗完了時） */
export function playChime(): void {
  const ac = ctx();
  if (!ac) return;
  try {
    // 上昇3音ベル
    tone(ac, 880,  0,    0.35, 0.14);
    tone(ac, 1100, 0.12, 0.35, 0.12);
    tone(ac, 1320, 0.24, 0.45, 0.10);
  } catch {}
}

/** 終了・停止サウンド（プロセス終了時） */
export function playExit(): void {
  const ac = ctx();
  if (!ac) return;
  try {
    // 下降2音 + 短いノイズ感
    tone(ac, 550, 0,    0.28, 0.13);
    tone(ac, 390, 0.22, 0.40, 0.10);
  } catch {}
}

// ── Debounce helper ────────────────────────────────────────────────────────
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
function debounce(key: string, fn: () => void, ms: number) {
  if (_timers.has(key)) clearTimeout(_timers.get(key)!);
  _timers.set(key, setTimeout(() => { _timers.delete(key); fn(); }, ms));
}

// ── TTS ───────────────────────────────────────────────────────────────────

let _voicevoxAvailable: boolean | null = null; // cache probe result

async function probeVoicevox(baseUrl: string): Promise<boolean> {
  if (_voicevoxAvailable !== null) return _voicevoxAvailable;
  try {
    const res = await fetch(`${baseUrl}/version`, {
      signal: AbortSignal.timeout(1000),
    });
    _voicevoxAvailable = res.ok;
  } catch {
    _voicevoxAvailable = false;
  }
  return _voicevoxAvailable;
}

// Reset probe cache when URL changes
let _lastVoicevoxUrl = '';
function resetProbeIfUrlChanged(url: string) {
  if (url !== _lastVoicevoxUrl) {
    _lastVoicevoxUrl = url;
    _voicevoxAvailable = null;
  }
}

/**
 * テキストを音声読み上げ。
 * 1. VOICEVOX (ずんだもん) を試みる
 * 2. 失敗したら Web Speech API (ブラウザ内蔵TTS) にフォールバック
 */
export async function speak(
  text: string,
  settings?: AudioSettings
): Promise<void> {
  const s = settings ?? getAudioSettings();
  if (!s.voiceEnabled) return;

  resetProbeIfUrlChanged(s.voicevoxUrl);

  // ── VOICEVOX ──
  const available = await probeVoicevox(s.voicevoxUrl);
  if (available) {
    try {
      const queryRes = await fetch(
        `${s.voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${s.speakerId}`,
        { method: 'POST', signal: AbortSignal.timeout(3000) }
      );
      if (queryRes.ok) {
        const query = await queryRes.json() as Record<string, unknown>;
        // 少し速く話す
        if (typeof query['speedScale'] === 'number') query['speedScale'] = 1.15;
        const synthRes = await fetch(
          `${s.voicevoxUrl}/synthesis?speaker=${s.speakerId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
            signal: AbortSignal.timeout(6000),
          }
        );
        if (synthRes.ok) {
          const blob = await synthRes.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = 0.85;
          audio.play().catch(() => {});
          audio.onended = () => URL.revokeObjectURL(url);
          return;
        }
      }
    } catch {
      _voicevoxAvailable = false; // 次回は直接フォールバック
    }
  }

  // ── Web Speech API フォールバック ──
  try {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'ja-JP';
    utterance.rate  = 1.1;
    utterance.pitch = 1.2;
    // 日本語ボイスがあれば使う
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith('ja'));
    if (jaVoice) utterance.voice = jaVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {}
}

// ── Convenience: play + speak together ────────────────────────────────────

/** BEL検出時（コマンド完了通知など）*/
export function notifyComplete(settings?: AudioSettings): void {
  const s = settings ?? getAudioSettings();
  debounce('complete', () => {
    if (s.soundEnabled) playChime();
    speak('完了', s);
  }, 300);
}

/** ターミナル終了時 */
export function notifyExit(settings?: AudioSettings): void {
  const s = settings ?? getAudioSettings();
  if (s.soundEnabled) playExit();
  speak('プロセスが終了しました', s);
}
