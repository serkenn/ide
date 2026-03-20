#!/usr/bin/env node
/**
 * mcp-speak.js
 * 軽量MCPサーバー: Claude Codeのspeakツール呼び出しを
 * Deck IDEの /api/speak エンドポイントに転送し、
 * ブラウザ（スマホ含む）でずんだもんを喋らせる。
 */

const DECK_IDE_URL = process.env.DECK_IDE_URL || 'http://localhost:8787';

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try { handleMessage(JSON.parse(line)); } catch { /* ignore */ }
  }
});

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'deck-ide-speak', version: '1.0.0' },
      },
    });

  } else if (method === 'notifications/initialized') {
    // 通知なので返答不要

  } else if (method === 'tools/list') {
    send({
      jsonrpc: '2.0', id,
      result: {
        tools: [{
          name: 'speak',
          description:
            'Deck IDEブラウザ（スマホ含む）でずんだもん（VOICEVOX）が音声読み上げする。' +
            'タスク開始・進捗・完了・エラー時に呼ぶ。ずんだもん口調（〜のだ）で100文字以内に。',
          inputSchema: {
            type: 'object',
            properties: {
              text:    { type: 'string', description: '読み上げテキスト（100文字以内、ずんだもん口調）' },
              speaker: { type: 'number', description: 'VOICEVOXスピーカーID（3=ずんだもんノーマル）', default: 3 },
              async:   { type: 'boolean', description: '非同期再生（trueを推奨）', default: true },
            },
            required: ['text'],
          },
        }],
      },
    });

  } else if (method === 'tools/call' && params?.name === 'speak') {
    const text    = String(params.arguments?.text ?? '').slice(0, 100);
    const speaker = Number(params.arguments?.speaker ?? 3);

    try {
      await fetch(`${DECK_IDE_URL}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker }),
        signal: AbortSignal.timeout(3000),
      });
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '🔊 ずんだもん読み上げ中' }] } });
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      // Deck IDEが落ちていてもエラーにしない（サイレント）
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `(Deck IDE未接続: ${msg2})` }] } });
    }

  } else if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}
