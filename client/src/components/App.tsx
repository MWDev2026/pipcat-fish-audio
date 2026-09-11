import { useEffect, useState } from 'react';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';
import { EventsPanel } from '@pipecat-ai/voice-ui-kit';
import { Bot, Terminal } from 'lucide-react';
import { ThemeToggle } from './ui/theme-toggle';
import { Badge } from './ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { VoiceOrb } from './VoiceOrb';
import { TranscriptView } from './TranscriptView';
import { AudioControlsBar } from './AudioControlsBar';
import { DiagnosticConsole } from './DiagnosticConsole';
import { diagnosticLogger } from '../utils/webrtcLogger';

interface AppProps extends PipecatBaseChildProps {}

export const App = ({
  client,
  handleConnect,
  handleDisconnect,
}: AppProps) => {
  const [activeDiagTab, setActiveDiagTab] = useState<'trace' | 'rtvi'>('trace');
  const [iceState, setIceState] = useState<string>('new');

  useEffect(() => {
    client?.initDevices();
  }, [client]);

  // Subscribe to logger to surface ICE state in the bottom bar
  useEffect(() => {
    return diagnosticLogger.subscribe((logs) => {
      const latestIce = [...logs].reverse().find((l) => l.category === 'ICE' && l.message.includes('state ->'));
      if (latestIce) {
        setIceState(latestIce.message.split('->').pop()?.trim() || 'new');
      }
    });
  }, []);

  return (
    <Sheet>
      <div className="flex flex-col h-screen w-full max-w-4xl mx-auto px-4 py-3 sm:py-5 gap-3 sm:gap-4 box-border font-sans select-none">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                  Antigravity Voice
                </h1>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50">
                  v2.0
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                <span>Fish Audio s2.1</span>
                <span>·</span>
                <span>LM Studio Qwen 3.5</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Center Dynamic Voice Orb */}
        <section className="shrink-0 flex items-center justify-center py-1 sm:py-2">
          <VoiceOrb />
        </section>

        {/* Live Conversation Transcript */}
        <main className="flex-1 overflow-hidden min-h-[160px]">
          <TranscriptView />
        </main>

        {/* Bottom Floating Control Bar */}
        <footer className="shrink-0">
          <AudioControlsBar
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            iceState={iceState}
          />
        </footer>

        {/* Slide-out Diagnostic Drawer */}
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-4 sm:p-6 gap-4">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <Terminal className="size-5 text-indigo-500" />
              <SheetTitle className="text-base font-bold">
                Connection & Audio Diagnostics
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs">
              Live inspection of WebRTC SDP handshakes, ICE candidates, and RTVI client events.
            </SheetDescription>
          </SheetHeader>

          {/* Sub-tabs in Sheet */}
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setActiveDiagTab('trace')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeDiagTab === 'trace'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                WebRTC Trace
              </button>
              <button
                type="button"
                onClick={() => setActiveDiagTab('rtvi')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeDiagTab === 'rtvi'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                RTVI Event Bus
              </button>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              STUN: google.com:19302
            </span>
          </div>

          <div className="flex-1 overflow-hidden min-h-[300px]">
            {activeDiagTab === 'trace' ? (
              <DiagnosticConsole />
            ) : (
              <div className="h-full overflow-hidden p-2 bg-neutral-950 rounded-lg border border-neutral-800 text-xs">
                <EventsPanel />
              </div>
            )}
          </div>
        </SheetContent>
      </div>
    </Sheet>
  );
};
