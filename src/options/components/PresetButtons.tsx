import { type ModelFormData, createEmptyFormData } from '../utils'

interface PresetButtonsProps {
  onSelectPreset: (formData: ModelFormData) => void
}

export function PresetButtons({ onSelectPreset }: PresetButtonsProps) {
  const handlePresetClick = (provider: ModelFormData['provider'], overrides: Partial<{ name: string; model: string; apiKey: string; apiEndpoint: string }> = {}) => {
    const formData = createEmptyFormData(provider)
    const finalFormData = {
      ...formData,
      id: `${provider}-${Date.now()}`,
      ...(overrides.name && { name: overrides.name }),
      ...(overrides.model && { model: overrides.model }),
      ...(overrides.apiKey && 'apiKey' in formData && { apiKey: overrides.apiKey }),
      ...(overrides.apiEndpoint && 'apiEndpoint' in formData && { apiEndpoint: overrides.apiEndpoint }),
    } as ModelFormData
    onSelectPreset(finalFormData)
  }

  const presets = [
    { icon: '🟢', name: 'OpenAI', provider: 'openai' as const, displayName: 'OpenAI GPT-4' },
    { icon: '🟤', name: 'Anthropic', provider: 'anthropic' as const, displayName: 'Anthropic Claude' },
    { icon: '☁️', name: 'AWS Bedrock', provider: 'bedrock' as const, displayName: 'AWS Bedrock Claude Sonnet 4.5' },
    { icon: '🦙', name: 'Ollama', provider: 'custom' as const, displayName: 'Ollama (Local)', model: 'llama2', apiKey: 'ollama', apiEndpoint: 'http://localhost:11434/v1/chat/completions' },
    { icon: '🎯', name: 'LM Studio', provider: 'custom' as const, displayName: 'LM Studio (Local)', model: '', apiKey: 'lm-studio', apiEndpoint: 'http://localhost:1234/v1/chat/completions' },
    { icon: '⚙️', name: 'Custom', provider: 'custom' as const, displayName: 'Custom Endpoint' },
  ]

  return (
    <div className="presets-grid">
      {presets.map((preset) => (
        <button
          key={preset.name}
          className="preset-btn"
          onClick={() => handlePresetClick(preset.provider, { 
            name: preset.displayName,
            model: preset.model,
            apiKey: preset.apiKey,
            apiEndpoint: preset.apiEndpoint,
          })}
        >
          <span className="preset-icon">{preset.icon}</span>
          <span className="preset-name">{preset.name}</span>
        </button>
      ))}
    </div>
  )
}
