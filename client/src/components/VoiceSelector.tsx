import { useEffect, useState } from 'react';
import { Bot, RotateCw } from 'lucide-react';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { getApiBaseUrl } from '../config';

export interface VoiceOption {
  id: string;
  voice_id: string | null;
  name: string;
  type?: 'agent' | 'model' | 'preset';
  selected?: boolean;
}

interface VoiceSelectorProps {
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  disabled?: boolean;
}

export function VoiceSelector({ selectedVoice, onVoiceChange, disabled }: VoiceSelectorProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([
    { id: 'default', voice_id: null, name: 'Default (Fish Audio Native)', type: 'preset' },
    { id: '693f71b862af4e3882cace82cd42ee8c', voice_id: '693f71b862af4e3882cace82cd42ee8c', name: 'Interview Coach (693f71b8...)', type: 'agent' },
    { id: '816564b5b27f432ca48083b03cbec668', voice_id: '816564b5b27f432ca48083b03cbec668', name: 'Virtual Boyfriend (816564b5...)', type: 'agent' },
    { id: '20e299d89509414cbdda687949f81924', voice_id: '20e299d89509414cbdda687949f81924', name: 'schema-probe (20e299d8...)', type: 'agent' },
    { id: '1e1c8fe092aa4f3fb09207a6d9e4d63e', voice_id: '1e1c8fe092aa4f3fb09207a6d9e4d63e', name: 'Jensen Huang (1e1c8fe0...)', type: 'agent' },
    { id: '68b0cba2f99048f490f2f6fc1b982441', voice_id: '68b0cba2f99048f490f2f6fc1b982441', name: 'System design interview candidate (68b0cba2...)', type: 'agent' },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const loadVoices = async () => {
    setIsLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/voices`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          if (data.current_voice && !selectedVoice) {
            onVoiceChange(data.current_voice);
          }
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Bot className="size-4 text-indigo-500 shrink-0" />
      <div className="w-52 sm:w-64">
        <Select
          value={selectedVoice}
          onChange={(e) => onVoiceChange(e.target.value)}
          disabled={disabled || isLoading}
          title="Select Fish Audio Agent or Voice"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || isLoading}
        onClick={loadVoices}
        title="Refresh agents from Fish Audio"
        className="size-8 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 shrink-0"
      >
        <RotateCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
