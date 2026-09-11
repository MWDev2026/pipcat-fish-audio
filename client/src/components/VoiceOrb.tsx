import { useEffect, useState } from 'react';
import { usePipecatClientTransportState, useRTVIClientEvent } from '@pipecat-ai/client-react';
import { RTVIEvent } from '@pipecat-ai/client-js';
import { Mic, Volume2, Sparkles, Loader2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';

export function VoiceOrb() {
  const transportState = usePipecatClientTransportState();
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, () => setIsBotSpeaking(true));
  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, () => setIsBotSpeaking(false));
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => setIsUserSpeaking(true));
  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () => setIsUserSpeaking(false));

  useEffect(() => {
    if (transportState !== 'ready') {
      setIsBotSpeaking(false);
      setIsUserSpeaking(false);
    }
  }, [transportState]);

  // Derive visual state
  const isConnected = transportState === 'ready';
  const isConnecting =
    transportState === 'authenticating' ||
    transportState === 'connecting' ||
    transportState === 'initializing';

  let statusBadge = <Badge variant="outline">Disconnected</Badge>;
  let statusIcon = <Radio className="size-3.5 text-neutral-400" />;
  let statusText = 'Ready to connect';

  if (isConnecting) {
    statusBadge = (
      <Badge variant="warning">
        <Loader2 className="size-3 mr-1 animate-spin" /> Connecting...
      </Badge>
    );
    statusIcon = <Loader2 className="size-3.5 text-amber-500 animate-spin" />;
    statusText = 'Negotiating WebRTC...';
  } else if (isConnected) {
    if (isBotSpeaking) {
      statusBadge = (
        <Badge variant="default" className="bg-indigo-600 text-white dark:bg-indigo-500">
          <Sparkles className="size-3 mr-1 animate-pulse" /> Speaking
        </Badge>
      );
      statusIcon = <Volume2 className="size-3.5 text-indigo-500" />;
      statusText = 'Agent is speaking';
    } else if (isUserSpeaking) {
      statusBadge = (
        <Badge variant="success">
          <Mic className="size-3 mr-1 animate-pulse" /> Listening
        </Badge>
      );
      statusIcon = <Mic className="size-3.5 text-emerald-500" />;
      statusText = 'Listening to you...';
    } else {
      statusBadge = (
        <Badge
          variant="outline"
          className="text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-700"
        >
          Idle
        </Badge>
      );
      statusIcon = <Mic className="size-3.5 text-neutral-400" />;
      statusText = 'Listening for speech';
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 gap-4">
      {/* Orb Container */}
      <div className="relative flex items-center justify-center size-40 sm:size-48">
        {/* Outer Pulsing Waves */}
        {isConnected && isBotSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 dark:bg-indigo-400/25 animate-ping duration-1000" />
            <div className="absolute -inset-4 rounded-full border border-indigo-400/40 dark:border-indigo-400/50 animate-pulse duration-700" />
            <div className="absolute -inset-8 rounded-full border border-indigo-400/20 dark:border-indigo-400/30 animate-pulse duration-1000" />
          </>
        )}

        {isConnected && isUserSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 dark:bg-emerald-400/25 animate-ping duration-1000" />
            <div className="absolute -inset-3 rounded-full border border-emerald-400/50 animate-pulse duration-500" />
          </>
        )}

        {isConnecting && (
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/60 animate-spin duration-3000" />
        )}

        {/* Core Glowing Orb Sphere */}
        <div
          className={cn(
            'relative flex items-center justify-center size-28 sm:size-32 rounded-full transition-all duration-500 shadow-xl backdrop-blur-md',
            !isConnected &&
              !isConnecting &&
              'bg-gradient-to-tr from-neutral-200 via-neutral-100 to-neutral-300 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-950 border border-neutral-300/60 dark:border-neutral-800 shadow-inner',
            isConnecting &&
              'bg-gradient-to-tr from-amber-400/30 via-neutral-100 to-amber-500/20 dark:from-amber-950 dark:via-neutral-900 dark:to-amber-900/40 border border-amber-500/40 animate-pulse',
            isConnected &&
              !isBotSpeaking &&
              !isUserSpeaking &&
              'bg-gradient-to-tr from-neutral-100 via-neutral-50 to-neutral-200 dark:from-neutral-900 dark:via-neutral-800/90 dark:to-neutral-900 border border-neutral-300 dark:border-neutral-700/80 shadow-lg',
            isConnected &&
              isUserSpeaking &&
              'bg-gradient-to-tr from-emerald-500/40 via-teal-400/20 to-emerald-600/30 dark:from-emerald-950/80 dark:via-emerald-900/50 dark:to-teal-900/40 border border-emerald-500/60 scale-105 shadow-emerald-500/20',
            isConnected &&
              isBotSpeaking &&
              'bg-gradient-to-tr from-indigo-500 via-violet-600 to-purple-500 dark:from-indigo-600 dark:via-violet-600 dark:to-purple-700 border border-indigo-400/80 scale-110 shadow-indigo-500/40'
          )}
        >
          {/* Inner ambient shine */}
          <div className="absolute top-2 left-3 size-8 rounded-full bg-white/30 dark:bg-white/10 blur-xs pointer-events-none" />

          {/* Center Graphic */}
          <div className="z-10 flex flex-col items-center justify-center transition-transform duration-300">
            {isBotSpeaking ? (
              <div className="flex items-center gap-1">
                <span className="w-1 h-5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-8 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-6 bg-white rounded-full animate-bounce" />
                <span className="w-1 h-4 bg-white rounded-full animate-bounce [animation-delay:-0.2s]" />
              </div>
            ) : isUserSpeaking ? (
              <div className="flex items-center gap-1">
                <span className="w-1 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-pulse" />
                <span className="w-1 h-7 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-pulse" />
                <span className="w-1 h-3 bg-emerald-600 dark:bg-emerald-400 rounded-full animate-pulse" />
              </div>
            ) : isConnecting ? (
              <Loader2 className="size-8 text-amber-500 animate-spin" />
            ) : (
              <Radio
                className={cn(
                  'size-7',
                  isConnected
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : 'text-neutral-400 dark:text-neutral-600'
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* Live State & Status Pill */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2">{statusBadge}</div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 font-medium">
          {statusIcon}
          {statusText}
        </p>
      </div>
    </div>
  );
}
