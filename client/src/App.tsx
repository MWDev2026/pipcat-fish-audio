import { useState, useRef, useEffect } from 'react';
import { PipecatClient, RTVIEvent } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

interface ServerConfig {
  status: string;
  fish_model: string;
  lm_studio_url: string;
  lm_studio_model: string;
}

export function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [statusText, setStatusText] = useState('Ready to connect');
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  const clientRef = useRef<PipecatClient | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.warn('Could not fetch server health:', err));
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startCall = async () => {
    setIsConnecting(true);
    setStatusText('Connecting with Pipecat WebRTC...');

    try {
      const transport = new SmallWebRTCTransport();
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            setIsConnected(true);
            setIsConnecting(false);
            setStatusText('Call active (SmallWebRTC peer-to-peer)');
          },
          onDisconnected: () => {
            setIsConnected(false);
            setIsConnecting(false);
            setStatusText('Call ended');
          },
          onTransportStateChanged: (state: string) => {
            console.log('WebRTC transport state:', state);
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
          },
          onUserTranscript: (data: { text: string; final: boolean }) => {
            if (data?.text?.trim()) {
              setTranscript((prev) => [...prev, { role: 'user', text: data.text }]);
            }
          },
          onBotTranscript: (data: { text: string }) => {
            if (data?.text?.trim()) {
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
            console.error('PipecatClient error:', err);
            setStatusText(`Error: ${err?.message || err}`);
            setIsConnecting(false);
          },
        },
      });

      client.on(RTVIEvent.TrackStarted, (track: MediaStreamTrack, participant: any) => {
        if (!participant?.local && track.kind === 'audio' && audioElRef.current) {
          audioElRef.current.srcObject = new MediaStream([track]);
          audioElRef.current.play().catch((e) => console.warn('Audio play error:', e));
        }
      });

      clientRef.current = client;

      await client.connect({
        webrtcRequestParams: {
          endpoint: '/api/offer',
        },
      });
    } catch (err: any) {
      console.error('Connection failed:', err);
      setStatusText(`Connection failed: ${err?.message || err}`);
      setIsConnecting(false);
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
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
    }
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
        {/* Status & Diagnostics */}
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
        <div className="card bg-base-100 border border-base-300 shadow-sm flex-1 flex flex-col h-[520px] max-h-[520px] p-4">
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
