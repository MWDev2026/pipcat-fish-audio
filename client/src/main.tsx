import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemeProvider,
  FullScreenContainer,
  PipecatAppBase,
  SpinLoader,
  ErrorCard,
} from '@pipecat-ai/voice-ui-kit';
import type { PipecatBaseChildProps } from '@pipecat-ai/voice-ui-kit';

import { App } from './components/App';
import {
  DEFAULT_TRANSPORT,
  TRANSPORT_PROPS,
  type TransportType,
} from './config';
import { diagnosticLogger } from './utils/webrtcLogger';
import './index.css';

diagnosticLogger.init();

const STABLE_TRANSPORT_OPTIONS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const Main = () => {
  const [transportType] = useState<TransportType>(DEFAULT_TRANSPORT);
  const transportProps = TRANSPORT_PROPS[transportType];

  return (
    <ThemeProvider defaultTheme="terminal" disableStorage>
      <FullScreenContainer>
        <PipecatAppBase
          {...transportProps}
          transportType={transportType}
          transportOptions={STABLE_TRANSPORT_OPTIONS}
        >
          {({ client, handleConnect, handleDisconnect, error }: PipecatBaseChildProps) =>
            !client ? (
              <SpinLoader />
            ) : error ? (
              <ErrorCard>{error}</ErrorCard>
            ) : (
              <App
                client={client}
                handleConnect={handleConnect}
                handleDisconnect={handleDisconnect}
              />
            )
          }
        </PipecatAppBase>
      </FullScreenContainer>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Main />
  </StrictMode>
);
