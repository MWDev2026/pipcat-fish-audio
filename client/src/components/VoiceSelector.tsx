import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Select } from './ui/select';

interface VoiceOption {
  id: string;
  voice_id: string | null;
  name: string;
  selected?: boolean;
}

interface VoiceSelectorProps {
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  disabled?: boolean;
}

export function VoiceSelector({ selectedVoice, onVoiceChange, disabled }: VoiceSelectorProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([
    { id: 'default', voice_id: null, name: 'Default (Fish Audio s2.1 Free)' },
    { id: 'ai_assistant', voice_id: 'e47ccbcdcf4642f2b4b2174e3938cca7', name: 'AI Assistant (Natural Female)' },
    { id: 'tech_assistant', voice_id: '4aa90c24bfdd4e628306d39377f4e3db', name: 'AI Voice Assistant (Crisp Female)' },
    { id: 'customer_service', voice_id: '54cc428cee614c0c8c208659b0cbd66a', name: 'Customer Service (Warm Male)' },
    { id: 'announcer', voice_id: '90e65eaaf50e4470b8e6d43ee6afd7d5', name: 'Dynamic Announcer (Cinematic Male)' },
    { id: 'google_assistant', voice_id: '27098a25110c40d4aad5b72ef4737192', name: 'Google Assistant (Modern)' },
  ]);

  useEffect(() => {
    // Fetch live voices from backend if available
    fetch('/api/voices')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          if (data.current_voice && !selectedVoice) {
            onVoiceChange(data.current_voice);
          }
        }
      })
      .catch(() => {
        // Graceful fallback to default curated list
      });
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Volume2 className="size-3.5 text-neutral-400 shrink-0" />
      <div className="w-56 sm:w-64">
        <Select
          value={selectedVoice}
          onChange={(e) => onVoiceChange(e.target.value)}
          disabled={disabled}
          title="Select Fish Audio reference voice"
        >
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
