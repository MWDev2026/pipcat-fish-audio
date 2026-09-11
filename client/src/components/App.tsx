import { useEffect } from 'react';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';
import {
  ConnectButton,
  ConversationPanel,
  EventsPanel,
  UserAudioControl,
} from '@pipecat-ai/voice-ui-kit';

interface AppProps extends PipecatBaseChildProps {}

export const App = ({
  client,
  handleConnect,
  handleDisconnect,
}: AppProps) => {
  useEffect(() => {
    client?.initDevices();
  }, [client]);

  return (
    <div className="flex flex-col w-full h-screen max-w-5xl mx-auto p-4 gap-4 box-border">
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
      <div className="flex-1 overflow-hidden border border-base-300 rounded-lg p-3 bg-base-100 shadow-sm">
        <ConversationPanel />
      </div>

      {/* Real-time WebRTC & Transport Events */}
      <div className="h-60 overflow-hidden border border-base-300 rounded-lg p-2 bg-base-200/50 shadow-inner">
        <EventsPanel />
      </div>
    </div>
  );
};
