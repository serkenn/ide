/**
 * Audio utilities – sound effects + VOICEVOX (Zundamon) TTS via server proxy
 *
 * VOICEVOX requests go through /api/tts (backend proxy) to avoid browser CORS restrictions.
 * Falls back to Web Speech API if VOICEVOX is unreachable.
 */

// ── LocalStorage keys ──────────────────────────────────────────────────────
export const STORAGE_KEY_AUDIO_SOUND    = 'deck-audio-sound';
export const STORAGE_KEY_AUDIO_VOICE    = 'deck-audio-voice';
export const STORAGE_KEY_AUDIO_VOICEVOX = 'deck-audio-voicevox-url';
export const STORAGE_KEY_AUDIO_SPEAKER  = 'deck-audio-speaker-id';

export interface AudioSettings {
  soundEnabled: boolean;
  voiceEnabled: boolean;
  voicevoxUrl: string;
  speakerId: number;
}

export function getAudioSettings(): AudioSettings {
  return {
    soundEnabled: localStorage.getItem(STORAGE_KEY_AUDIO_SOUND)    !== 'off',
    voiceEnabled: localStorage.getItem(STORAGE_KEY_AUDIO_VOICE)    === 'on',
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

function getCtx(): AudioContext | null {
  try {
    if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
    if (_ctx.state === 'suspended')       void _ctx.resume();
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
  type: OscillatorType = 'sine',
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
  const ac = getCtx();
  if (!ac) return;
  try {
    tone(ac, 880,  0,    0.35, 0.14);
    tone(ac, 1100, 0.12, 0.35, 0.12);
    tone(ac, 1320, 0.24, 0.45, 0.10);
  } catch {}
}

/** 終了・停止サウンド */
export function playExit(): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    tone(ac, 550, 0,    0.28, 0.13);
    tone(ac, 390, 0.22, 0.40, 0.10);
  } catch {}
}

// ── Debounce ───────────────────────────────────────────────────────────────
const _timers = new Map<string, ReturnType<typeof setTimeout>>();
function debounce(key: string, fn: () => void, ms: number) {
  if (_timers.has(key)) clearTimeout(_timers.get(key)!);
  _timers.set(key, setTimeout(() => { _timers.delete(key); fn(); }, ms));
}

// ── TTS via /api/tts proxy ─────────────────────────────────────────────────

let _voicevoxWorking: boolean | null = null; // cached probe result
let _lastProbeUrl = '';

function resetProbeCache(url: string) {
  if (url !== _lastProbeUrl) {
    _lastProbeUrl = url;
    _voicevoxWorking = null;
  }
}

async function playVoicevox(
  text: string,
  settings: AudioSettings,
): Promise<boolean> {
  resetProbeCache(settings.voicevoxUrl);

  // AudioContext を即時ウォームアップ（ユーザージェスチャーが有効なうちに）
  // fetch の完了を待つと autoplay ポリシーで play() がブロックされるため
  const ac = getCtx();

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voicevoxUrl: settings.voicevoxUrl,
        speakerId:   settings.speakerId,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      _voicevoxWorking = false;
      console.warn('[TTS] VOICEVOX proxy error:', res.status, await res.text().catch(() => ''));
      return false;
    }

    const arrayBuffer = await res.arrayBuffer();

    // AudioContext 経由で再生（autoplay ポリシーを回避）
    if (ac) {
      try {
        const audioBuffer = await ac.decodeAudioData(arrayBuffer);
        const source = ac.createBufferSource();
        const gainNode = ac.createGain();
        gainNode.gain.value = 0.85;
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(ac.destination);
        source.start(0);
        _voicevoxWorking = true;
        return true;
      } catch (decodeErr) {
        console.warn('[TTS] AudioContext decode failed, falling back to Audio element:', decodeErr);
      }
    }

    // フォールバック: Audio 要素（AudioContext 使用不可の場合）
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.85;
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    _voicevoxWorking = true;
    return true;
  } catch (err) {
    _voicevoxWorking = false;
    console.warn('[TTS] VOICEVOX failed:', err);
    return false;
  }
}

function playWebSpeech(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'ja-JP';
    utterance.rate  = 1.1;
    utterance.pitch = 1.2;
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith('ja'));
    if (jaVoice) utterance.voice = jaVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {}
}

/**
 * テキスト読み上げ。
 * 1. /api/tts 経由で VOICEVOX (ずんだもん) を使用
 * 2. 失敗したら Web Speech API にフォールバック
 */
export async function speak(
  text: string,
  settings?: AudioSettings,
): Promise<void> {
  const s = settings ?? getAudioSettings();
  if (!s.voiceEnabled) return;

  const ok = await playVoicevox(text, s);
  if (!ok) playWebSpeech(text);
}

// ── Convenience ────────────────────────────────────────────────────────────

/** BEL検出時（コマンド完了） */
export function notifyComplete(settings?: AudioSettings, command?: string): void {
  const s = settings ?? getAudioSettings();
  debounce('complete', () => {
    if (s.soundEnabled) playChime();
    const text = command ? `${command} が完了しました` : '完了しました';
    void speak(text, s);
  }, 300);
}

/** ターミナル終了時 */
export function notifyExit(settings?: AudioSettings, command?: string): void {
  const s = settings ?? getAudioSettings();
  if (s.soundEnabled) playExit();
  const text = command ? `${command} が終了しました` : 'プロセスが終了しました';
  void speak(text, s);
}

/** 現在の状態を読み上げ（ボタン押下時） */
export function speakStatus(shellTitle: string, lastCommand: string, settings?: AudioSettings): void {
  const s = settings ?? getAudioSettings();
  if (!s.voiceEnabled && !s.soundEnabled) return;
  let text: string;
  if (shellTitle) {
    text = shellTitle;
  } else if (lastCommand) {
    text = `${lastCommand} を実行中`;
  } else {
    text = '待機中';
  }
  void speak(text, s);
}
