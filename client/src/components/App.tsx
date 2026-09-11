import { useEffect, useState } from 'react';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';
import {
  ConnectButton,
  ConversationPanel,
  EventsPanel,
  UserAudioControl,
} from '@pipecat-ai/voice-ui-kit';
import { DiagnosticConsole } from './DiagnosticConsole';

interface AppProps extends PipecatBaseChildProps {}

export const App = ({
  client,
  handleConnect,
  handleDisconnect,
}: AppProps) => {
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'rtvi'>('diagnostics');

  useEffect(() => {
    client?.initDevices();
  }, [client]);

  return (
    <div className="flex flex-col w-full h-screen max-w-5xl mx-auto p-4 gap-4 box-border font-sans">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-base-300 pb-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Pipecat Voice POC
          </h1>
          <p className="text-xs text-neutral-500 font-mono">
            Fish Audio (s2.1-pro-free) · LM Studio (non-thinking) · Whisper
          </p>
        </div>
        <div className="flex items-center gap-3">
          <UserAudioControl size="md" />
          <ConnectButton
            size="md"
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </header>

      {/* Main Conversation Transcript */}
      <div className="flex-1 overflow-hidden border border-base-300 rounded-lg p-3 bg-base-100 shadow-sm min-h-[220px]">
        <ConversationPanel />
      </div>

      {/* Bottom Diagnostics / Events Panel */}
      <div className="h-72 flex flex-col border border-base-300 rounded-lg overflow-hidden bg-base-200/50 shadow-inner">
        <div className="flex items-center justify-between border-b border-base-300 px-3 py-1.5 bg-base-200 text-xs">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${activeTab === 'diagnostics' ? 'bg-base-100 text-base-content font-bold shadow-xs' : 'text-base-content/60 hover:text-base-content'}`}
            >
              WebRTC & Connection Trace (Detailed)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rtvi')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${activeTab === 'rtvi' ? 'bg-base-100 text-base-content font-bold shadow-xs' : 'text-base-content/60 hover:text-base-content'}`}
            >
              RTVI Raw Events
            </button>
          </div>
          <div className="text-[11px] text-base-content/50 font-mono">
            STUN: stun.l.google.com:19302
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'diagnostics' ? (
            <DiagnosticConsole />
          ) : (
            <div className="h-full overflow-hidden p-2">
              <EventsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
