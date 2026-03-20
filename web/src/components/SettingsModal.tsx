import { useState, useEffect } from 'react';
import {
  getAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../utils/audio';
import { playChime, playExit, speak } from '../utils/audio';

interface Settings {
  port: number;
  basicAuthEnabled: boolean;
  basicAuthUser: string;
  basicAuthPassword: string;
}

interface WsStats {
  limit: number;
  connections: { ip: string; count: number }[];
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => Promise<void>;
}

const LABEL_SETTINGS = '設定';
const LABEL_SERVER = 'サーバー設定';
const LABEL_PORT = 'ポート番号';
const LABEL_AUTH = 'Basic認証';
const LABEL_AUTH_ENABLE = 'Basic認証を有効にする';
const LABEL_USERNAME = 'ユーザー名';
const LABEL_PASSWORD = 'パスワード';
const LABEL_PASSWORD_NOTE = '※ 12文字以上推奨';
const LABEL_CANCEL = 'キャンセル';
const LABEL_SAVE = '保存';
const LABEL_RESTART_NOTE = '※ 設定を保存すると、サーバーが再起動されます';
const LABEL_WEBSOCKET = 'WebSocket設定';
const LABEL_WS_LIMIT = '接続数上限 (IP毎)';
const LABEL_WS_CONNECTIONS = '現在の接続数';
const LABEL_WS_CLEAR = '全接続をクリア';
const LABEL_WS_APPLY = '適用';

const INPUT_CLASS = 'bg-panel border border-border rounded-[2px] px-2 py-1.5 text-[13px] font-mono text-ink focus:outline-none focus:border-focus';

export function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
  const [port, setPort] = useState(8787);
  const [basicAuthEnabled, setBasicAuthEnabled] = useState(false);
  const [basicAuthUser, setBasicAuthUser] = useState('');
  const [basicAuthPassword, setBasicAuthPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // WebSocket settings
  const [wsLimit, setWsLimit] = useState(1000);
  const [wsStats, setWsStats] = useState<WsStats | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Audio / voice settings (client-side localStorage)
  const [audio, setAudio] = useState<AudioSettings>(getAudioSettings);

  const loadWsStats = () => {
    fetch('/api/ws/stats')
      .then(res => res.json())
      .then((data: WsStats) => {
        setWsStats(data);
        setWsLimit(data.limit);
      })
      .catch(err => {
        console.error('Failed to load WS stats:', err);
      });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) setAudio(getAudioSettings());
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/settings')
        .then(res => res.json())
        .then((data: Settings) => {
          setPort(data.port);
          setBasicAuthEnabled(data.basicAuthEnabled);
          setBasicAuthUser(data.basicAuthUser);
          setBasicAuthPassword(data.basicAuthPassword);
        })
        .catch(err => {
          console.error('Failed to load settings:', err);
        });

      loadWsStats();
    }
  }, [isOpen]);

  const handleWsLimitApply = async () => {
    try {
      await fetch('/api/ws/limit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: wsLimit })
      });
      loadWsStats();
    } catch (err) {
      console.error('Failed to set WS limit:', err);
    }
  };

  const handleWsClear = async () => {
    setIsClearing(true);
    try {
      await fetch('/api/ws/clear', { method: 'POST' });
      loadWsStats();
    } catch (err) {
      console.error('Failed to clear WS connections:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // Save audio settings immediately (localStorage, no server call)
    saveAudioSettings(audio);
    try {
      await onSave({
        port,
        basicAuthEnabled,
        basicAuthUser,
        basicAuthPassword
      });
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('設定の保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div className="modal w-[500px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="m-0 text-[14px] font-semibold" id="settings-modal-title">{LABEL_SETTINGS}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted border-b border-border pb-2">{LABEL_SERVER}</h3>

              <div className="flex flex-col gap-1">
                <label htmlFor="port" className="text-xs text-ink-muted">{LABEL_PORT}</label>
                <input
                  type="number"
                  id="port"
                  className={INPUT_CLASS}
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  min={1024}
                  max={65535}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <h4 className="m-0 text-xs font-semibold text-ink-muted">{LABEL_AUTH}</h4>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={basicAuthEnabled}
                    onChange={(e) => setBasicAuthEnabled(e.target.checked)}
                  />
                  <span>{LABEL_AUTH_ENABLE}</span>
                </label>
              </div>

              {basicAuthEnabled && (
                <>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="username" className="text-xs text-ink-muted">{LABEL_USERNAME}</label>
                    <input
                      type="text"
                      id="username"
                      className={INPUT_CLASS}
                      value={basicAuthUser}
                      onChange={(e) => setBasicAuthUser(e.target.value)}
                      required={basicAuthEnabled}
                      autoComplete="username"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="password" className="text-xs text-ink-muted">{LABEL_PASSWORD}</label>
                    <input
                      type="password"
                      id="password"
                      className={INPUT_CLASS}
                      value={basicAuthPassword}
                      onChange={(e) => setBasicAuthPassword(e.target.value)}
                      required={basicAuthEnabled}
                      minLength={12}
                      autoComplete="new-password"
                    />
                    <p className="m-0 text-[11px] text-muted">{LABEL_PASSWORD_NOTE}</p>
                  </div>
                </>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted border-b border-border pb-2">{LABEL_WEBSOCKET}</h3>

              <div className="flex flex-col gap-1">
                <label htmlFor="wsLimit" className="text-xs text-ink-muted">{LABEL_WS_LIMIT}</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    id="wsLimit"
                    className={`flex-1 ${INPUT_CLASS}`}
                    value={wsLimit}
                    onChange={(e) => setWsLimit(Number(e.target.value))}
                    min={1}
                    max={10000}
                  />
                  <button
                    type="button"
                    className="border border-border bg-transparent text-ink px-2.5 py-1 text-xs rounded-[2px] cursor-pointer hover:bg-list-hover"
                    onClick={handleWsLimitApply}
                  >
                    {LABEL_WS_APPLY}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-muted">{LABEL_WS_CONNECTIONS}</label>
                <div className="border border-border rounded-[2px] p-2 text-xs bg-bg min-h-[40px] flex flex-col gap-1">
                  {wsStats && wsStats.connections.length > 0 ? (
                    wsStats.connections.map(({ ip, count }) => (
                      <div key={ip} className="flex justify-between items-center">
                        <span className="font-mono text-ink">{ip}</span>
                        <span className="font-semibold text-ink-muted">{count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted text-center">接続なし</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="bg-[#f14c4c] text-white border-0 px-3.5 py-1.5 text-[13px] font-medium rounded-[2px] cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleWsClear}
                  disabled={isClearing}
                >
                  {isClearing ? 'クリア中...' : LABEL_WS_CLEAR}
                </button>
              </div>
            </section>

            {/* ── 音声・通知設定 ── */}
            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted border-b border-border pb-2">
                音声・通知
              </h3>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={audio.soundEnabled}
                  onChange={e => setAudio(a => ({ ...a, soundEnabled: e.target.checked }))}
                />
                <span>効果音を有効にする（BEL・プロセス終了時）</span>
                <button
                  type="button"
                  className="ml-auto text-[10px] border border-border rounded px-1.5 py-0.5 text-muted hover:text-ink hover:bg-list-hover"
                  onClick={() => playChime()}
                >試聴</button>
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={audio.voiceEnabled}
                  onChange={e => setAudio(a => ({ ...a, voiceEnabled: e.target.checked }))}
                />
                <span>音声読み上げを有効にする（ずんだもん / ブラウザTTS）</span>
              </label>

              {audio.voiceEnabled && (
                <div className="flex flex-col gap-2 pl-4 border-l-2 border-border">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-ink-muted">VOICEVOX URL（ずんだもん用）</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className={`flex-1 ${INPUT_CLASS}`}
                        value={audio.voicevoxUrl}
                        onChange={e => setAudio(a => ({ ...a, voicevoxUrl: e.target.value }))}
                        placeholder="http://localhost:50021"
                      />
                      <button
                        type="button"
                        className="text-[11px] border border-border rounded px-2 py-1 text-muted hover:text-ink hover:bg-list-hover whitespace-nowrap"
                        onClick={() => speak('こんにちは、ずんだもんなのだ！', audio)}
                      >テスト</button>
                    </div>
                    <p className="m-0 text-[11px] text-muted">VOICEVOX未起動の場合はブラウザ内蔵TTSを使用</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-ink-muted">スピーカーID（3 = ずんだもん）</label>
                    <input
                      type="number"
                      className={INPUT_CLASS}
                      value={audio.speakerId}
                      onChange={e => setAudio(a => ({ ...a, speakerId: Number(e.target.value) }))}
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <span className="text-muted">終了音テスト:</span>
                <button
                  type="button"
                  className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted hover:text-ink hover:bg-list-hover"
                  onClick={() => playExit()}
                >試聴</button>
              </label>
            </section>

            <p className="m-0 text-[11px] text-muted italic">{LABEL_RESTART_NOTE}</p>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t border-border pt-4">
            <button
              type="button"
              className="bg-transparent text-ink border-0 px-2 py-1 text-xs rounded-[2px] cursor-pointer hover:bg-list-hover"
              onClick={onClose}
              disabled={isSaving}
            >
              {LABEL_CANCEL}
            </button>
            <button
              type="submit"
              className="bg-accent text-white border-0 px-3.5 py-1.5 text-[13px] font-medium rounded-[2px] cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : LABEL_SAVE}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
