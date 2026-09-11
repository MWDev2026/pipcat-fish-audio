import { useState, useRef, useEffect } from 'react';
import { PipecatClient, RTVIEvent } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

interface ServerConfig {
  status: string;
  fish_model: string;
  lm_studio_url: string;
  lm_studio_model: string;
}

interface LogEntry {
  id: string;
  time: string;
  source: 'client' | 'server';
  level: 'info' | 'warn' | 'error';
  text: string;
}

export function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [statusText, setStatusText] = useState('Ready to connect');
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  // Debug Logging State
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'client' | 'server' | 'all'>('all');
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const clientRef = useRef<PipecatClient | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const addLog = (level: 'info' | 'warn' | 'error', text: string) => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time,
      source: 'client',
      level,
      text,
    };
    setClientLogs((prev) => [...prev.slice(-150), entry]);
  };

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        addLog('info', `Server health verified: Fish model=${data.fish_model}, LM Studio=${data.lm_studio_model}`);
      })
      .catch((err) => {
        addLog('error', `Health check failed: ${err.message || err}`);
      });
  }, []);

  // Poll server logs
  useEffect(() => {
    const fetchServerLogs = () => {
      fetch('/api/logs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.logs)) {
            setServerLogs(data.logs);
          }
        })
        .catch(() => {});
    };

    fetchServerLogs();
    const interval = setInterval(fetchServerLogs, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    if (autoScrollLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [clientLogs, serverLogs, autoScrollLogs, activeTab]);

  const startCall = async () => {
    setIsConnecting(true);
    setStatusText('Connecting with Pipecat WebRTC...');
    addLog('info', 'Starting WebRTC connection sequence...');

    try {
      addLog('info', 'Creating SmallWebRTCTransport instance with STUN & waitForICEGathering...');
      const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
      const transport = new SmallWebRTCTransport({
        iceServers,
        waitForICEGathering: true,
      });
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            setIsConnected(true);
            setIsConnecting(false);
            setStatusText('Call active (SmallWebRTC peer-to-peer)');
            addLog('info', 'WebRTC connection established successfully.');
          },
          onDisconnected: () => {
            setIsConnected(false);
            setIsConnecting(false);
            setStatusText('Call ended');
            addLog('info', 'WebRTC session disconnected.');
          },
          onTransportStateChanged: (state: string) => {
            addLog('info', `Transport state -> ${state}`);
            if (state === 'connecting') {
              setStatusText('Negotiating WebRTC media streams...');
            } else if (state === 'connected') {
              setIsConnected(true);
              setIsConnecting(false);
              setStatusText('Call active (SmallWebRTC peer-to-peer)');
            }
          },
          onBotReady: () => {
            setStatusText('Agent ready to speak');
            addLog('info', 'Bot pipeline is ready for voice interaction.');
          },
          onUserTranscript: (data: { text: string; final: boolean }) => {
            if (data?.text?.trim()) {
              addLog('info', `User transcript [final=${data.final}]: "${data.text}"`);
              setTranscript((prev) => [...prev, { role: 'user', text: data.text }]);
            }
          },
          onBotTranscript: (data: { text: string }) => {
            if (data?.text?.trim()) {
              addLog('info', `Bot transcript: "${data.text}"`);
              setTranscript((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'agent') {
                  return [...prev.slice(0, -1), { role: 'agent', text: last.text + ' ' + data.text }];
                }
                return [...prev, { role: 'agent', text: data.text }];
              });
            }
          },
          onError: (err: any) => {
            const msg = err?.message || JSON.stringify(err);
            addLog('error', `PipecatClient error: ${msg}`);
            setStatusText(`Error: ${msg}`);
            setIsConnecting(false);
          },
        },
      });

      client.on(RTVIEvent.TrackStarted, (track: MediaStreamTrack, participant: any) => {
        addLog('info', `Track started: kind=${track.kind}, id=${track.id}, local=${participant?.local}`);
        if (!participant?.local && track.kind === 'audio' && audioElRef.current) {
          audioElRef.current.srcObject = new MediaStream([track]);
          audioElRef.current.play().catch((e) => {
            addLog('warn', `Audio play rejected: ${e.message}`);
          });
        }
      });

      clientRef.current = client;

      addLog('info', 'Connecting client to /api/offer...');
      await client.connect({
        webrtcRequestParams: {
          endpoint: '/api/offer',
        },
        iceConfig: {
          iceServers,
        },
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      addLog('error', `Connection exception: ${msg}`);
      setStatusText(`Connection failed: ${msg}`);
      setIsConnecting(false);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    addLog('info', 'User initiated disconnect.');
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch (e: any) {
        addLog('warn', `Error while disconnecting: ${e?.message || e}`);
      }
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setStatusText('Call ended');
  };

  const toggleMute = () => {
    if (clientRef.current) {
      const nextMuted = !isMuted;
      clientRef.current.enableMic(!nextMuted);
      setIsMuted(nextMuted);
      addLog('info', `Microphone ${nextMuted ? 'muted' : 'unmuted'}`);
    }
  };

  const copyLogsToClipboard = () => {
    const textToCopy =
      activeTab === 'server'
        ? serverLogs.join('\n')
        : activeTab === 'client'
        ? clientLogs.map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.text}`).join('\n')
        : [
            '--- CLIENT LOGS ---',
            ...clientLogs.map((l) => `[${l.time}] [CLIENT] [${l.level.toUpperCase()}] ${l.text}`),
            '',
            '--- SERVER LOGS ---',
            ...serverLogs,
          ].join('\n');
    navigator.clipboard.writeText(textToCopy);
    addLog('info', 'Logs copied to clipboard.');
  };

  return (
    <div className="min-h-screen bg-base-200 text-base-content flex flex-col font-sans">
      {/* Header */}
      <header className="navbar bg-base-100 border-b border-base-300 px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight">Pipecat Voice Agent</span>
          <span className="badge badge-outline text-xs font-mono">
            {config ? `${config.fish_model} (free)` : 'loading...'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs opacity-70 font-mono">
          <span>LM Studio: {config?.lm_studio_model ? 'Connected' : 'Connecting'}</span>
          <span>&bull;</span>
          <span>Non-Thinking Mode: Active</span>
        </div>
      </header>

      {/* Hidden Audio Element for playback */}
      <audio ref={audioElRef} autoPlay playsInline />

      {/* Main Container */}
      <main className="container mx-auto p-4 md:p-6 max-w-4xl flex-1 flex flex-col gap-4">
        {/* Status & Call Controls */}
        <div className="card bg-base-100 border border-base-300 shadow-sm p-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-neutral animate-pulse' : 'bg-base-300'
              }`}
            />
            <span className="text-sm font-medium">{statusText}</span>
          </div>
          <div className="flex gap-2">
            {!isConnected ? (
              <button
                onClick={startCall}
                disabled={isConnecting}
                className="btn btn-neutral btn-sm px-6"
              >
                {isConnecting ? 'Connecting...' : 'Connect Call'}
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className="btn btn-outline btn-sm"
                >
                  {isMuted ? 'Unmute Mic' : 'Mute Mic'}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="btn btn-neutral btn-sm"
                >
                  Hang Up
                </button>
              </>
            )}
          </div>
        </div>

        {/* Conversation Transcript Box */}
        <div className="card bg-base-100 border border-base-300 shadow-sm flex flex-col h-[320px] max-h-[320px] p-4">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-base-200">
            <h3 className="font-semibold text-sm">Real-Time Conversation</h3>
            <button
              onClick={() => setTranscript([])}
              className="btn btn-ghost btn-xs text-xs"
            >
              Clear
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-xs opacity-50 space-y-2">
                <p>Connect call to begin speaking with the agent.</p>
                <p>Pipeline: Whisper STT &rarr; LM Studio Qwen (Direct) &rarr; Fish Audio Free TTS</p>
              </div>
            ) : (
              transcript.map((msg, i) => (
                <div
                  key={i}
                  className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}
                >
                  <div className="chat-header text-[10px] opacity-60 mb-0.5">
                    {msg.role === 'user' ? 'You' : 'Agent'}
                  </div>
                  <div className="chat-bubble bg-base-100 text-base-content border border-base-300 text-xs max-w-[85%] break-words whitespace-pre-wrap leading-relaxed shadow-none">
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Debug Logs Panel */}
        <div className="card bg-base-100 border border-base-300 shadow-sm flex flex-col h-[280px] max-h-[280px] p-4">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-base-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Debug Logs</span>
              <div className="join">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`btn btn-xs join-item ${
                    activeTab === 'all' ? 'btn-neutral' : 'btn-ghost'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveTab('client')}
                  className={`btn btn-xs join-item ${
                    activeTab === 'client' ? 'btn-neutral' : 'btn-ghost'
                  }`}
                >
                  Client ({clientLogs.length})
                </button>
                <button
                  onClick={() => setActiveTab('server')}
                  className={`btn btn-xs join-item ${
                    activeTab === 'server' ? 'btn-neutral' : 'btn-ghost'
                  }`}
                >
                  Server ({serverLogs.length})
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                className={`btn btn-xs ${
                  autoScrollLogs ? 'btn-outline' : 'btn-ghost opacity-50'
                }`}
                title="Toggle Auto Scroll"
              >
                Auto-scroll {autoScrollLogs ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={copyLogsToClipboard}
                className="btn btn-ghost btn-xs text-xs"
              >
                Copy
              </button>
              <button
                onClick={() => setClientLogs([])}
                className="btn btn-ghost btn-xs text-xs"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-base-200 rounded p-2.5 font-mono text-[11px] leading-relaxed select-text space-y-1">
            {activeTab === 'server' ? (
              serverLogs.length === 0 ? (
                <div className="opacity-40 text-center py-6">No server logs recorded yet.</div>
              ) : (
                serverLogs.map((log, i) => (
                  <div key={i} className="text-base-content/80 whitespace-pre-wrap break-all">
                    {log}
                  </div>
                ))
              )
            ) : activeTab === 'client' ? (
              clientLogs.length === 0 ? (
                <div className="opacity-40 text-center py-6">No client events logged yet.</div>
              ) : (
                clientLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="opacity-40 select-none">[{log.time}]</span>
                    <span
                      className={`font-semibold text-[10px] uppercase select-none ${
                        log.level === 'error'
                          ? 'text-error'
                          : log.level === 'warn'
                          ? 'text-warning'
                          : 'opacity-70'
                      }`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-base-content/90 whitespace-pre-wrap break-all flex-1">
                      {log.text}
                    </span>
                  </div>
                ))
              )
            ) : (
              /* Unified View */
              <>
                {clientLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="opacity-40 select-none">[{log.time}]</span>
                    <span className="badge badge-outline text-[9px] py-0 px-1 select-none">CLIENT</span>
                    <span
                      className={`font-semibold text-[10px] uppercase select-none ${
                        log.level === 'error'
                          ? 'text-error'
                          : log.level === 'warn'
                          ? 'text-warning'
                          : 'opacity-70'
                      }`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-base-content/90 whitespace-pre-wrap break-all flex-1">
                      {log.text}
                    </span>
                  </div>
                ))}
                {serverLogs.map((log, i) => (
                  <div key={`srv-${i}`} className="flex items-start gap-2 text-base-content/75">
                    <span className="badge badge-neutral text-[9px] py-0 px-1 select-none">SERVER</span>
                    <span className="whitespace-pre-wrap break-all flex-1">{log}</span>
                  </div>
                ))}
              </>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-3 bg-base-100 border-t border-base-300 text-xs opacity-70">
        <p>
          Powered by Pipecat AI &bull; LM Studio (Non-Thinking Mode) &bull; Fish Audio ({config?.fish_model || 's2.1-pro-free'})
        </p>
      </footer>
    </div>
  );
}

export default App;
