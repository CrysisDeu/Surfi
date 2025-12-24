import type { ModelFormData } from '../utils'

interface PresetButtonsProps {
  onSelectPreset: (formData: ModelFormData) => void
}

export function PresetButtons({ onSelectPreset }: PresetButtonsProps) {
  const presets: Array<{
    icon: string
    name: string
    formData: ModelFormData
  }> = [
    {
      icon: '🟢',
      name: 'OpenAI',
      formData: {
        id: `openai-${Date.now()}`,
        name: 'OpenAI GPT-4',
        provider: 'openai',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7,
        awsRegion: '',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      },
    },
    {
      icon: '🟤',
      name: 'Anthropic',
      formData: {
        id: `anthropic-${Date.now()}`,
        name: 'Anthropic Claude',
        provider: 'anthropic',
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 4096,
        temperature: 0.7,
        awsRegion: '',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      },
    },
    {
      icon: '☁️',
      name: 'AWS Bedrock',
      formData: {
        id: `bedrock-${Date.now()}`,
        name: 'AWS Bedrock Claude',
        provider: 'bedrock',
        apiEndpoint: '',
        apiKey: '',
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        maxTokens: 4096,
        temperature: 0.7,
        awsRegion: 'us-east-1',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      },
    },
    {
      icon: '🦙',
      name: 'Ollama',
      formData: {
        id: `ollama-${Date.now()}`,
        name: 'Ollama (Local)',
        provider: 'custom',
        apiEndpoint: 'http://localhost:11434/v1/chat/completions',
        apiKey: 'ollama',
        model: 'llama2',
        maxTokens: 4096,
        temperature: 0.7,
        awsRegion: '',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      },
    },
    {
      icon: '⚙️',
      name: 'Custom',
      formData: {
        id: `custom-${Date.now()}`,
        name: 'Custom Endpoint',
        provider: 'custom',
        apiEndpoint: '',
        apiKey: '',
        model: '',
        maxTokens: 4096,
        temperature: 0.7,
        awsRegion: '',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
      },
    },
  ]

  return (
    <div className="presets-grid">
      {presets.map((preset) => (
        <button
          key={preset.name}
          className="preset-btn"
          onClick={() => onSelectPreset({ ...preset.formData, id: `${preset.formData.provider}-${Date.now()}` })}
        >
          <span className="preset-icon">{preset.icon}</span>
          <span className="preset-name">{preset.name}</span>
        </button>
      ))}
    </div>
  )
}
