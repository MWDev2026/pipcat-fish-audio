import type { APIRequest, TransportConnectionParams } from '@pipecat-ai/client-js';

export type TransportType = 'smallwebrtc';

export const AVAILABLE_TRANSPORTS: TransportType[] = ['smallwebrtc'];

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  smallwebrtc: 'SmallWebRTC',
};

export const DEFAULT_TRANSPORT: TransportType = 'smallwebrtc';

const botStartUrl =
  import.meta.env.VITE_BOT_START_URL || '/start';
const botStartPublicApiKey = import.meta.env.VITE_BOT_START_PUBLIC_API_KEY;

const headers = botStartPublicApiKey
  ? new Headers({ Authorization: `Bearer ${botStartPublicApiKey}` })
  : undefined;

const smallWebRTCConfig: APIRequest = {
  endpoint: botStartUrl,
  headers,
  requestData: {
    createDailyRoom: false,
    enableDefaultIceServers: true,
    transport: 'webrtc',
  },
};

export interface TransportProps {
  connectParams?: APIRequest | TransportConnectionParams;
  startBotParams?: APIRequest;
}

export const TRANSPORT_PROPS: Record<TransportType, TransportProps> = {
  smallwebrtc: { connectParams: smallWebRTCConfig },
};
