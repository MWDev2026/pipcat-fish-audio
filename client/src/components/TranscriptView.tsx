import { useEffect, useRef, useState } from 'react';
import { useRTVIClientEvent } from '@pipecat-ai/client-react';
import { RTVIEvent, type BotLLMTextData, type TranscriptData } from '@pipecat-ai/client-js';
import { Bot, User, Sparkles, MessageSquareDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isInterim?: boolean;
}

export function TranscriptView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getNowFormatted = () => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // User Speech Transcript
  useRTVIClientEvent(RTVIEvent.UserTranscript, (data: TranscriptData) => {
    const text = data.text?.trim();
    if (!text) return;

    setMessages((prev) => {
      // If last message was interim user transcript, replace or update it
      const last = prev[prev.length - 1];
      if (last && last.role === 'user' && last.isInterim) {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            text,
            isInterim: !data.final,
          },
        ];
      }

      return [
        ...prev,
        {
          id: `user-${Date.now()}-${Math.random()}`,
          role: 'user',
          text,
          timestamp: getNowFormatted(),
          isInterim: !data.final,
        },
      ];
    });
  });

  // Assistant LLM Text Output
  useRTVIClientEvent(RTVIEvent.BotLlmText, (data: BotLLMTextData) => {
    const chunk = data.text;
    if (!chunk) return;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            text: last.text + chunk,
          },
        ];
      }

      return [
        ...prev,
        {
          id: `bot-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          text: chunk,
          timestamp: getNowFormatted(),
        },
      ];
    });
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xs overflow-hidden shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/80">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-indigo-500" />
          <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
            Live Dialogue
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            Clear transcript
          </button>
        )}
      </div>

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-[160px] scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10 text-neutral-400 dark:text-neutral-500">
            <MessageSquareDashed className="size-8 stroke-1 mb-2 text-neutral-300 dark:text-neutral-700" />
            <p className="text-xs font-medium">No conversation yet</p>
            <p className="text-[11px] text-neutral-400">
              Connect and say "Hello" to start speaking with the agent.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col max-w-[85%] sm:max-w-[75%]',
                msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                {msg.role === 'user' ? (
                  <>
                    <span className="text-[10px] text-neutral-400">{msg.timestamp}</span>
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                      You <User className="size-3 text-neutral-500" />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <Bot className="size-3" /> Assistant
                    </span>
                    <span className="text-[10px] text-neutral-400">{msg.timestamp}</span>
                  </>
                )}
              </div>

              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs',
                  msg.role === 'user'
                    ? 'bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900 rounded-tr-xs'
                    : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50 rounded-tl-xs border border-neutral-200/50 dark:border-neutral-700/50',
                  msg.isInterim && 'opacity-70 italic'
                )}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
