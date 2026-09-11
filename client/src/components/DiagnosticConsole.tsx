import { useEffect, useRef, useState } from 'react';
import { diagnosticLogger, type LogItem } from '../utils/webrtcLogger';

export const DiagnosticConsole = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    diagnosticLogger.init();
    return diagnosticLogger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'ERRORS') return log.level === 'error' || log.category === 'ERROR';
    return log.category === filter;
  });

  const handleCopy = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.time}] [${l.category}] [${l.level.toUpperCase()}] ${l.message}${
            l.details ? `\n  ↳ ${l.details}` : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Derive connection state from latest logs
  const latestIce = [...logs].reverse().find((l) => l.category === 'ICE' && l.message.includes('state ->'));
  const iceState = latestIce ? latestIce.message.split('->').pop()?.trim() : 'idle';

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200 rounded-lg overflow-hidden border border-neutral-700 font-mono text-xs shadow-md">
      {/* Console Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-100 flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${iceState === 'connected' || iceState === 'completed' ? 'bg-emerald-500 animate-pulse' : iceState === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-neutral-500'}`} />
            Live WebRTC Diagnostics
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300">
            ICE: <span className="font-bold">{iceState}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <div className="flex gap-1 text-[10px]">
            {['ALL', 'ICE', 'WEBRTC', 'HTTP', 'ERRORS'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`px-1.5 py-0.5 rounded transition-colors ${filter === cat ? 'bg-neutral-200 text-neutral-900 font-bold' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-0.5 rounded text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors font-sans"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => diagnosticLogger.clear()}
            className="px-2 py-0.5 rounded text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors font-sans"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-neutral-500 italic p-2 text-center">
            Click Connect to capture live connection negotiation traces...
          </div>
        ) : (
          filteredLogs.map((log) => {
            const badgeColor =
              log.category === 'ERROR' || log.level === 'error'
                ? 'bg-rose-900/80 text-rose-300 border-rose-700'
                : log.level === 'success'
                ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
                : log.category === 'ICE'
                ? 'bg-sky-900/60 text-sky-300 border-sky-700'
                : log.category === 'HTTP'
                ? 'bg-purple-900/60 text-purple-300 border-purple-700'
                : 'bg-neutral-700 text-neutral-300 border-neutral-600';

            return (
              <div key={log.id} className="leading-relaxed hover:bg-neutral-800/60 px-1 py-0.5 rounded">
                <span className="text-neutral-500 mr-2">{log.time}</span>
                <span className={`inline-block px-1 rounded text-[9px] border mr-2 uppercase ${badgeColor}`}>
                  {log.category}
                </span>
                <span className={log.level === 'error' ? 'text-rose-400 font-semibold' : log.level === 'success' ? 'text-emerald-300' : 'text-neutral-200'}>
                  {log.message}
                </span>
                {log.details && (
                  <div className="text-neutral-400 text-[10px] pl-4 mt-0.5 break-all opacity-85">
                    ↳ {log.details}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
