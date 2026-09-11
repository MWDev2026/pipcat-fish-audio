import { useState, useEffect } from 'react';
import { usePipecatClient, usePipecatClientTransportState } from '@pipecat-ai/client-react';
import { Mic, MicOff, PhoneCall, PhoneOff, Terminal, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { SheetTrigger } from './ui/sheet';

interface AudioControlsBarProps {
  onConnect?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  iceState?: string;
}

export function AudioControlsBar({
  onConnect,
  onDisconnect,
  iceState,
}: AudioControlsBarProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const [isMuted, setIsMuted] = useState(false);

  const isConnected = transportState === 'ready';
  const isConnecting =
    transportState === 'authenticating' ||
    transportState === 'connecting' ||
    transportState === 'initializing';

  // Keep mute state in sync
  useEffect(() => {
    if (client) {
      setIsMuted(!client.isMicEnabled);
    }
  }, [client, transportState]);

  const toggleMic = () => {
    if (!client) return;
    const newState = isMuted; // we want to enable if muted
    client.enableMic(newState);
    setIsMuted(!newState);
  };

  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 shadow-md backdrop-blur-md">
      {/* Mic Mute / Unmute Button */}
      <div className="flex items-center gap-2">
        <Button
          variant={isMuted ? 'destructive' : 'outline'}
          size="icon"
          disabled={!isConnected}
          onClick={toggleMic}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className="rounded-full size-11 shadow-xs transition-all"
        >
          {isMuted ? (
            <MicOff className="size-5" />
          ) : (
            <Mic className="size-5" />
          )}
        </Button>
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {isMuted ? 'Muted' : 'Microphone'}
          </span>
          <span className="text-[10px] text-neutral-400">
            {isMuted ? 'Click to speak' : 'Default Input'}
          </span>
        </div>
      </div>

      {/* Main Connect / Disconnect Call Button */}
      <div className="flex items-center gap-3">
        {!isConnected && !isConnecting ? (
          <Button
            size="lg"
            onClick={() => onConnect?.()}
            className="rounded-full px-6 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md font-semibold transition-all hover:scale-105 active:scale-95"
          >
            <PhoneCall className="size-4 mr-2" />
            Start Voice Call
          </Button>
        ) : isConnecting ? (
          <Button
            size="lg"
            disabled
            className="rounded-full px-6 bg-amber-500 text-white shadow-md font-semibold opacity-90 cursor-not-allowed"
          >
            <Loader2 className="size-4 mr-2 animate-spin" />
            Connecting...
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            onClick={() => onDisconnect?.()}
            className="rounded-full px-6 bg-rose-600 hover:bg-rose-700 text-white shadow-md font-semibold transition-all hover:scale-105 active:scale-95"
          >
            <PhoneOff className="size-4 mr-2" />
            End Call
          </Button>
        )}
      </div>

      {/* Slide-out Diagnostic Drawer Trigger */}
      <div className="flex items-center gap-2">
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2 font-mono text-xs border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Terminal className="size-3.5 text-indigo-500" />
            <span className="hidden md:inline">Diagnostics</span>
            {iceState && (
              <span
                className={`size-2 rounded-full ${
                  iceState === 'connected' || iceState === 'completed'
                    ? 'bg-emerald-500'
                    : iceState === 'checking'
                    ? 'bg-amber-500 animate-ping'
                    : iceState === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-neutral-400'
                }`}
                title={`ICE state: ${iceState}`}
              />
            )}
          </Button>
        </SheetTrigger>
      </div>
    </div>
  );
}
