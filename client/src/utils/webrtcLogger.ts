export interface LogItem {
  id: string;
  time: string;
  category: 'HTTP' | 'WEBRTC' | 'ICE' | 'AUDIO' | 'ERROR' | 'INFO';
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

export type LogListener = (logs: LogItem[]) => void;

class DiagnosticLogger {
  private logs: LogItem[] = [];
  private listeners: Set<LogListener> = new Set();
  private initialized = false;

  public subscribe(listener: LogListener) {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLogs(): LogItem[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public add(
    category: LogItem['category'],
    level: LogItem['level'],
    message: string,
    details?: string
  ) {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const item: LogItem = {
      id: Math.random().toString(36).substring(2, 9),
      time,
      category,
      level,
      message,
      details,
    };
    this.logs.push(item);
    if (this.logs.length > 300) {
      this.logs.shift();
    }
    this.notify();
    console.log(`[${category}] [${level.toUpperCase()}] ${message}`, details || '');
  }

  private notify() {
    const snapshot = [...this.logs];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    this.add('INFO', 'info', 'Diagnostic WebRTC logger initialized');

    // Instrument navigator.mediaDevices.getUserMedia
    if (navigator?.mediaDevices?.getUserMedia) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        this.add('AUDIO', 'info', 'Requesting microphone access...', JSON.stringify(constraints));
        try {
          const stream = await origGetUserMedia(constraints);
          const tracks = stream.getAudioTracks();
          const labels = tracks.map((t) => t.label || t.id).join(', ');
          this.add('AUDIO', 'success', `Microphone acquired: ${labels || 'Active'}`);
          return stream;
        } catch (err: any) {
          this.add('ERROR', 'error', `Microphone permission denied / error: ${err?.message || err}`);
          throw err;
        }
      };
    }

    // Instrument fetch
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      const method = (args[1]?.method || 'GET').toUpperCase();

      if (url.includes('/start') || url.includes('/offer') || url.includes('/api') || url.includes('/sessions')) {
        const isPatch = method === 'PATCH';
        let bodySnippet = '';
        if (args[1]?.body) {
          try {
            const bodyStr = String(args[1]?.body);
            if (isPatch) {
              const parsed = JSON.parse(bodyStr);
              bodySnippet = `${parsed.candidates?.length || 0} candidate(s)`;
            } else {
              bodySnippet = bodyStr.length > 120 ? bodyStr.substring(0, 120) + '...' : bodyStr;
            }
          } catch {
            bodySnippet = '[binary or unparsed]';
          }
        }

        this.add('HTTP', 'info', `Sending ${method} ${url}`, bodySnippet ? `Data: ${bodySnippet}` : undefined);
      }

      try {
        const res = await origFetch(...args);
        if (url.includes('/start') || url.includes('/offer') || url.includes('/api') || url.includes('/sessions')) {
          const status = res.status;
          const ok = res.ok;
          if (ok) {
            this.add('HTTP', 'success', `${method} ${url} succeeded (HTTP ${status})`);
          } else {
            this.add('ERROR', 'error', `${method} ${url} returned error HTTP ${status}`);
          }
        }
        return res;
      } catch (err: any) {
        if (url.includes('/start') || url.includes('/offer') || url.includes('/api') || url.includes('/sessions')) {
          this.add('ERROR', 'error', `Network failure ${method} ${url}: ${err?.message || err}`);
        }
        throw err;
      }
    };

    // Instrument RTCPeerConnection
    if (window.RTCPeerConnection) {
      const OrigPC = window.RTCPeerConnection;
      const self = this;

      // @ts-ignore
      window.RTCPeerConnection = function (config?: RTCConfiguration) {
        const pc = new OrigPC(config);
        const pcId = Math.random().toString(36).substring(2, 6);
        const servers = config?.iceServers?.map((s) => (typeof s.urls === 'string' ? s.urls : s.urls.join(', '))).join('; ') || 'None';

        self.add('WEBRTC', 'info', `[PC#${pcId}] Created new RTCPeerConnection`, `STUN/TURN: ${servers}`);

        pc.addEventListener('icegatheringstatechange', () => {
          self.add('ICE', 'info', `[PC#${pcId}] ICE gathering state -> ${pc.iceGatheringState}`);
        });

        pc.addEventListener('iceconnectionstatechange', () => {
          const state = pc.iceConnectionState;
          const level = state === 'connected' || state === 'completed' ? 'success' : state === 'failed' ? 'error' : 'info';
          self.add('ICE', level, `[PC#${pcId}] ICE connection state -> ${state}`);
        });

        pc.addEventListener('connectionstatechange', () => {
          const state = pc.connectionState;
          const level = state === 'connected' ? 'success' : state === 'failed' ? 'error' : 'info';
          self.add('WEBRTC', level, `[PC#${pcId}] PeerConnection state -> ${state}`);
        });

        pc.addEventListener('signalingstatechange', () => {
          self.add('WEBRTC', 'info', `[PC#${pcId}] Signaling state -> ${pc.signalingState}`);
        });

        pc.addEventListener('icecandidate', (ev) => {
          if (ev.candidate) {
            const cand = ev.candidate.candidate;
            const typeMatch = cand.match(/typ\s+(\w+)/);
            const candType = typeMatch ? typeMatch[1] : 'unknown';
            self.add(
              'ICE',
              candType === 'srflx' ? 'success' : 'info',
              `[PC#${pcId}] Local candidate gathered: [${candType.toUpperCase()}] ${cand.substring(0, 75)}...`
            );
          } else {
            self.add('ICE', 'info', `[PC#${pcId}] ICE candidate gathering complete (null candidate)`);
          }
        });

        pc.addEventListener('icecandidateerror', (ev: any) => {
          self.add('ERROR', 'warn', `[PC#${pcId}] ICE candidate error: ${ev.errorText || 'Code ' + ev.errorCode}`, `Address: ${ev.address}:${ev.port}, URL: ${ev.url}`);
        });

        pc.addEventListener('datachannel', (ev) => {
          self.add('WEBRTC', 'info', `[PC#${pcId}] Received remote DataChannel: ${ev.channel.label}`);
          ev.channel.addEventListener('open', () => self.add('WEBRTC', 'success', `[PC#${pcId}] Remote DataChannel '${ev.channel.label}' opened`));
        });

        // @ts-ignore
        const origCreateOffer = pc.createOffer.bind(pc);
        // @ts-ignore
        pc.createOffer = async (options?: any) => {
          self.add('WEBRTC', 'info', `[PC#${pcId}] Creating SDP offer...`);
          try {
            const offer = await origCreateOffer(options);
            self.add('WEBRTC', 'info', `[PC#${pcId}] SDP offer created (${offer.sdp?.length || 0} bytes)`);
            return offer;
          } catch (err: any) {
            self.add('ERROR', 'error', `[PC#${pcId}] createOffer failed: ${err?.message || err}`);
            throw err;
          }
        };

        const origSetRemoteDesc = pc.setRemoteDescription.bind(pc);
        // @ts-ignore
        pc.setRemoteDescription = async (desc: any) => {
          self.add('WEBRTC', 'info', `[PC#${pcId}] Setting remote description (${desc.type})...`);
          try {
            const result = await origSetRemoteDesc(desc);
            self.add('WEBRTC', 'success', `[PC#${pcId}] Remote description (${desc.type}) accepted successfully`);
            return result;
          } catch (err: any) {
            self.add('ERROR', 'error', `[PC#${pcId}] setRemoteDescription rejected: ${err?.message || err}`);
            throw err;
          }
        };

        const origCreateDataChannel = pc.createDataChannel.bind(pc);
        pc.createDataChannel = (label, opts) => {
          self.add('WEBRTC', 'info', `[PC#${pcId}] Creating local DataChannel: '${label}'`);
          const dc = origCreateDataChannel(label, opts);
          dc.addEventListener('open', () => {
            self.add('WEBRTC', 'success', `[PC#${pcId}] Local DataChannel '${label}' -> OPEN!`);
          });
          dc.addEventListener('close', () => {
            self.add('WEBRTC', 'warn', `[PC#${pcId}] Local DataChannel '${label}' -> CLOSED`);
          });
          dc.addEventListener('error', (ev: any) => {
            self.add('ERROR', 'error', `[PC#${pcId}] Local DataChannel '${label}' error: ${ev.message || 'error'}`);
          });
          return dc;
        };

        return pc;
      };

      // Preserve prototype
      window.RTCPeerConnection.prototype = OrigPC.prototype;
    }
  }
}

export const diagnosticLogger = new DiagnosticLogger();
