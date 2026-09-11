import type { APIRequest, TransportConnectionParams } from '@pipecat-ai/client-js';

export type TransportType = 'smallwebrtc';

export const AVAILABLE_TRANSPORTS: TransportType[] = ['smallwebrtc'];

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  smallwebrtc: 'SmallWebRTC',
};

export const DEFAULT_TRANSPORT: TransportType = 'smallwebrtc';

export const SERVER_BASE_URL: string =
  import.meta.env.VITE_SERVER_URL?.replace(/\/+$/, '') || '';

export function getApiBaseUrl(): string {
  return SERVER_BASE_URL;
}

const botStartUrl =
  import.meta.env.VITE_BOT_START_URL || (SERVER_BASE_URL ? `${SERVER_BASE_URL}/start` : '/start');
const botStartPublicApiKey = import.meta.env.VITE_BOT_START_PUBLIC_API_KEY;

const headers = botStartPublicApiKey
  ? new Headers({ Authorization: `Bearer ${botStartPublicApiKey}` })
  : undefined;

export function getSmallWebRTCConfig(voice: string = 'default'): APIRequest {
  return {
    endpoint: botStartUrl,
    headers,
    requestData: {
      createDailyRoom: false,
      enableDefaultIceServers: true,
      transport: 'webrtc',
      body: {
        voice,
      },
    },
  };
}

export interface TransportProps {
  connectParams?: APIRequest | TransportConnectionParams;
  startBotParams?: APIRequest;
}

export const TRANSPORT_PROPS: Record<TransportType, TransportProps> = {
  smallwebrtc: { connectParams: getSmallWebRTCConfig() },
};
