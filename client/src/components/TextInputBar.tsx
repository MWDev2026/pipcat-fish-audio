import React, { useState, useRef, useEffect } from 'react';
import { usePipecatClient, usePipecatClientTransportState } from '@pipecat-ai/client-react';
import { SendHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface TextInputBarProps {
  onSendMessage?: (text: string) => void;
}

export function TextInputBar({ onSendMessage }: TextInputBarProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isConnected = transportState === 'ready';

  // Automatically focus input when connection becomes ready
  useEffect(() => {
    if (isConnected) {
      inputRef.current?.focus();
    }
  }, [isConnected]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !isConnected || isSending) return;

    setIsSending(true);
    try {
      // Send text message to Pipecat server through RTVI protocol
      // run_immediately: true interrupts bot and triggers immediate LLM response
      if (typeof client?.sendText === 'function') {
        await client.sendText(text, { run_immediately: true, audio_response: true });
      }
      onSendMessage?.(text);
      setInputText('');
    } catch (err) {
      console.error('Failed to send text message to Pipecat:', err);
    } finally {
      setIsSending(false);
      // Immediately refocus input box so user can type subsequent messages without clicking
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  return (
    <form
      onSubmit={handleSend}
      className="flex items-center gap-2 p-2 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/80"
    >
      <Input
        ref={inputRef}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={!isConnected || isSending}
        placeholder={
          isConnected
            ? 'Type a message to the agent (press Enter to send)...'
            : 'Start call to enable text input...'
        }
        className="h-8 text-xs bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 focus-visible:ring-indigo-500 rounded-lg placeholder:text-neutral-400"
      />
      <Button
        type="submit"
        size="sm"
        disabled={!isConnected || !inputText.trim() || isSending}
        className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs gap-1.5 shadow-xs shrink-0 transition-colors"
      >
        <span>Send</span>
        <SendHorizontal className="size-3" />
      </Button>
    </form>
  );
}
