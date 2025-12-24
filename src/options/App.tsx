import { useState, useEffect } from 'react'
import type { Settings, ModelConfig } from '../types'

const DEFAULT_SETTINGS: Settings = {
  activeModelId: 'default',
  models: [
    {
      id: 'default',
      name: 'OpenAI GPT-4',
      provider: 'openai',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-4',
      maxTokens: 4096,
      temperature: 0.7,
    },
  ],
  theme: 'dark',
}

// Form data type that can hold all fields
interface ModelFormData {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'bedrock' | 'custom'
  model: string
  maxTokens: number
  temperature: number
  // API-based providers
  apiEndpoint: string
  apiKey: string
  // Bedrock-specific
  awsRegion: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken: string
}

function formDataToModelConfig(data: ModelFormData): ModelConfig {
  const base = {
    id: data.id,
    name: data.name,
    model: data.model,
    maxTokens: data.maxTokens,
    temperature: data.temperature,
  }

  switch (data.provider) {
    case 'openai':
      return { ...base, provider: 'openai', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
    case 'anthropic':
      return { ...base, provider: 'anthropic', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
    case 'bedrock':
      return {
        ...base,
        provider: 'bedrock',
        awsRegion: data.awsRegion,
        awsAccessKeyId: data.awsAccessKeyId,
        awsSecretAccessKey: data.awsSecretAccessKey,
        ...(data.awsSessionToken ? { awsSessionToken: data.awsSessionToken } : {}),
      }
    case 'custom':
      return { ...base, provider: 'custom', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
  }
}

function modelConfigToFormData(config: ModelConfig): ModelFormData {
  const base = {
    id: config.id,
    name: config.name,
    provider: config.provider,
    model: config.model,
    maxTokens: config.maxTokens || 4096,
    temperature: config.temperature || 0.7,
    apiEndpoint: '',
    apiKey: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsSessionToken: '',
  }

  switch (config.provider) {
    case 'openai':
    case 'anthropic':
    case 'custom':
      return { ...base, apiEndpoint: config.apiEndpoint, apiKey: config.apiKey }
    case 'bedrock':
      return {
        ...base,
        awsRegion: config.awsRegion,
        awsAccessKeyId: config.awsAccessKeyId,
        awsSecretAccessKey: config.awsSecretAccessKey,
        awsSessionToken: config.awsSessionToken || '',
      }
  }
}

function getModelEndpointDisplay(model: ModelConfig): string {
  switch (model.provider) {
    case 'bedrock':
      return `AWS Bedrock (${model.awsRegion})`
    default:
      return model.apiEndpoint
  }
}

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [editingModel, setEditingModel] = useState<ModelFormData | null>(null)
  const [isAddingModel, setIsAddingModel] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    chrome.storage.sync.get('settings', (result) => {
      if (result.settings) {
        setSettings(result.settings)
      }
    })
  }, [])

  const saveSettings = async (newSettings: Settings) => {
    setSaveStatus('saving')
    await chrome.storage.sync.set({ settings: newSettings })
    setSettings(newSettings)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  const handleAddModel = () => {
    setEditingModel({
      id: `model-${Date.now()}`,
      name: 'New Model',
      provider: 'custom',
      apiEndpoint: '',
      apiKey: '',
      model: '',
      maxTokens: 4096,
      temperature: 0.7,
      awsRegion: 'us-east-1',
      awsAccessKeyId: '',
      awsSecretAccessKey: '',
      awsSessionToken: '',
    })
    setIsAddingModel(true)
  }

  const handleSaveModel = (formData: ModelFormData) => {
    const model = formDataToModelConfig(formData)
    let newModels: ModelConfig[]
    
    if (isAddingModel) {
      newModels = [...settings.models, model]
    } else {
      newModels = settings.models.map((m) => (m.id === model.id ? model : m))
    }

    const newSettings = { ...settings, models: newModels }
    
    if (newModels.length === 1) {
      newSettings.activeModelId = model.id
    }

    saveSettings(newSettings)
    setEditingModel(null)
    setIsAddingModel(false)
  }

  const handleDeleteModel = (modelId: string) => {
    if (settings.models.length <= 1) {
      alert('You must have at least one model configured.')
      return
    }

    const newModels = settings.models.filter((m) => m.id !== modelId)
    const newSettings = { ...settings, models: newModels }
    
    if (settings.activeModelId === modelId) {
      newSettings.activeModelId = newModels[0].id
    }

    saveSettings(newSettings)
  }

  const handleSetActiveModel = (modelId: string) => {
    saveSettings({ ...settings, activeModelId: modelId })
  }

  const handleEditModel = (model: ModelConfig) => {
    setEditingModel(modelConfigToFormData(model))
    setIsAddingModel(false)
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>🤖 Browser AI Settings</h1>
        <p>Configure your AI models and preferences</p>
      </header>

      <main className="options-main">
        <section className="section">
          <div className="section-header">
            <h2>AI Models</h2>
            <button className="btn btn-primary" onClick={handleAddModel}>
              + Add Model
            </button>
          </div>

          <div className="models-list">
            {settings.models.map((model) => (
              <div
                key={model.id}
                className={`model-card ${settings.activeModelId === model.id ? 'active' : ''}`}
              >
                <div className="model-info">
                  <div className="model-name">
                    {model.name}
                    {settings.activeModelId === model.id && (
                      <span className="badge">Active</span>
                    )}
                  </div>
                  <div className="model-details">
                    <span className="provider">{model.provider}</span>
                    <span className="model-id">{model.model}</span>
                  </div>
                  <div className="model-endpoint">{getModelEndpointDisplay(model)}</div>
                </div>
                <div className="model-actions">
                  {settings.activeModelId !== model.id && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleSetActiveModel(model.id)}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleEditModel(model)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDeleteModel(model.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Agent Settings</h2>
          <div className="settings-group">
            <div className="form-group">
              <label htmlFor="maxIterations">Max Iterations</label>
              <input
                type="number"
                id="maxIterations"
                value={settings.maxIterations || 10}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 10
                  saveSettings({ ...settings, maxIterations: Math.max(1, Math.min(50, value)) })
                }}
                min="1"
                max="50"
              />
              <small className="form-hint">
                Maximum number of tool use iterations per message (1-50). Higher values allow more complex tasks but may cost more tokens.
              </small>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Quick Add Presets</h2>
          <div className="presets-grid">
            <button
              className="preset-btn"
              onClick={() => {
                setEditingModel({
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
                })
                setIsAddingModel(true)
              }}
            >
              <span className="preset-icon">🟢</span>
              <span className="preset-name">OpenAI</span>
            </button>
            <button
              className="preset-btn"
              onClick={() => {
                setEditingModel({
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
                })
                setIsAddingModel(true)
              }}
            >
              <span className="preset-icon">🟤</span>
              <span className="preset-name">Anthropic</span>
            </button>
            <button
              className="preset-btn"
              onClick={() => {
                setEditingModel({
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
                })
                setIsAddingModel(true)
              }}
            >
              <span className="preset-icon">☁️</span>
              <span className="preset-name">AWS Bedrock</span>
            </button>
            <button
              className="preset-btn"
              onClick={() => {
                setEditingModel({
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
                })
                setIsAddingModel(true)
              }}
            >
              <span className="preset-icon">🦙</span>
              <span className="preset-name">Ollama</span>
            </button>
            <button
              className="preset-btn"
              onClick={() => {
                setEditingModel({
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
                })
                setIsAddingModel(true)
              }}
            >
              <span className="preset-icon">⚙️</span>
              <span className="preset-name">Custom</span>
            </button>
          </div>
        </section>

        {saveStatus !== 'idle' && (
          <div className={`save-status ${saveStatus}`}>
            {saveStatus === 'saving' ? 'Saving...' : 'Settings saved!'}
          </div>
        )}
      </main>

      {editingModel && (
        <ModelEditor
          formData={editingModel}
          onSave={handleSaveModel}
          onCancel={() => {
            setEditingModel(null)
            setIsAddingModel(false)
          }}
          isNew={isAddingModel}
        />
      )}
    </div>
  )
}

// Parse AWS credentials from export statements blob
function parseAWSCredentialsBlob(blob: string): {
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsSessionToken?: string
} {
  const result: {
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsSessionToken?: string
  } = {}

  // Match patterns like: export AWS_ACCESS_KEY_ID=value or AWS_ACCESS_KEY_ID=value
  const accessKeyMatch = blob.match(/(?:export\s+)?AWS_ACCESS_KEY_ID=([^\s\n]+)/)
  const secretKeyMatch = blob.match(/(?:export\s+)?AWS_SECRET_ACCESS_KEY=([^\s\n]+)/)
  const sessionTokenMatch = blob.match(/(?:export\s+)?AWS_SESSION_TOKEN=([^\s\n]+)/)

  if (accessKeyMatch) result.awsAccessKeyId = accessKeyMatch[1]
  if (secretKeyMatch) result.awsSecretAccessKey = secretKeyMatch[1]
  if (sessionTokenMatch) result.awsSessionToken = sessionTokenMatch[1]

  return result
}

function ModelEditor({
  formData: initialFormData,
  onSave,
  onCancel,
  isNew,
}: {
  formData: ModelFormData
  onSave: (formData: ModelFormData) => void
  onCancel: () => void
  isNew: boolean
}) {
  const [formData, setFormData] = useState<ModelFormData>(initialFormData)
  const [showSecrets, setShowSecrets] = useState(false)
  const [showProfileHelper, setShowProfileHelper] = useState(false)
  const [profileName, setProfileName] = useState('default')
  const [credentialBlob, setCredentialBlob] = useState('')
  const [showCredentialPaste, setShowCredentialPaste] = useState(false)

  const handleParseCredentials = () => {
    const parsed = parseAWSCredentialsBlob(credentialBlob)
    if (parsed.awsAccessKeyId || parsed.awsSecretAccessKey || parsed.awsSessionToken) {
      setFormData({
        ...formData,
        awsAccessKeyId: parsed.awsAccessKeyId || formData.awsAccessKeyId,
        awsSecretAccessKey: parsed.awsSecretAccessKey || formData.awsSecretAccessKey,
        awsSessionToken: parsed.awsSessionToken || formData.awsSessionToken,
      })
      setCredentialBlob('')
      setShowCredentialPaste(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  const isBedrock = formData.provider === 'bedrock'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Add New Model' : 'Edit Model'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Display Name</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My Custom Model"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={formData.provider}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  provider: e.target.value as ModelFormData['provider'],
                })
              }
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="bedrock">AWS Bedrock</option>
              <option value="custom">Custom (OpenAI-compatible)</option>
            </select>
          </div>

          {/* API-based providers */}
          {!isBedrock && (
            <>
              <div className="form-group">
                <label htmlFor="apiEndpoint">API Endpoint</label>
                <input
                  type="url"
                  id="apiEndpoint"
                  value={formData.apiEndpoint}
                  onChange={(e) => setFormData({ ...formData, apiEndpoint: e.target.value })}
                  placeholder="https://api.example.com/v1/chat/completions"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="apiKey">API Key</label>
                <div className="input-with-toggle">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    id="apiKey"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowSecrets(!showSecrets)}
                  >
                    {showSecrets ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* AWS Bedrock */}
          {isBedrock && (
            <>
              <div className="form-group">
                <label htmlFor="awsRegion">AWS Region</label>
                <select
                  id="awsRegion"
                  value={formData.awsRegion}
                  onChange={(e) => setFormData({ ...formData, awsRegion: e.target.value })}
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">Europe (Ireland)</option>
                  <option value="eu-central-1">Europe (Frankfurt)</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                  <option value="ap-southeast-2">Asia Pacific (Sydney)</option>
                </select>
              </div>

              {/* Paste Credentials Section */}
              <div className="credential-paste-section">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCredentialPaste(!showCredentialPaste)}
                  style={{ width: '100%', marginBottom: showCredentialPaste ? '12px' : '0' }}
                >
                  📋 {showCredentialPaste ? 'Hide' : 'Paste'} AWS Credentials
                </button>
                
                {showCredentialPaste && (
                  <div className="credential-paste-box">
                    <label htmlFor="credentialBlob" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>
                      Paste your AWS credential export commands:
                    </label>
                    <textarea
                      id="credentialBlob"
                      value={credentialBlob}
                      onChange={(e) => setCredentialBlob(e.target.value)}
                      placeholder={`export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...`}
                      rows={5}
                      style={{
                        width: '100%',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #444',
                        backgroundColor: '#1a1a2e',
                        color: '#e0e0e0',
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleParseCredentials}
                        disabled={!credentialBlob.trim()}
                        style={{ flex: 1 }}
                      >
                        ✓ Apply Credentials
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setCredentialBlob('')
                          setShowCredentialPaste(false)
                        }}
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </button>
                    </div>
                    <small className="form-hint" style={{ marginTop: '8px', display: 'block' }}>
                      Paste the output from <code>aws configure export-credentials --format env</code>
                    </small>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="awsAccessKeyId">AWS Access Key ID</label>
                <input
                  type="text"
                  id="awsAccessKeyId"
                  value={formData.awsAccessKeyId}
                  onChange={(e) => setFormData({ ...formData, awsAccessKeyId: e.target.value })}
                  placeholder="AKIA..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="awsSecretAccessKey">AWS Secret Access Key</label>
                <div className="input-with-toggle">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    id="awsSecretAccessKey"
                    value={formData.awsSecretAccessKey}
                    onChange={(e) => setFormData({ ...formData, awsSecretAccessKey: e.target.value })}
                    placeholder="Your secret access key"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowSecrets(!showSecrets)}
                  >
                    {showSecrets ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="awsSessionToken">AWS Session Token (optional)</label>
                <div className="input-with-toggle">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    id="awsSessionToken"
                    value={formData.awsSessionToken}
                    onChange={(e) => setFormData({ ...formData, awsSessionToken: e.target.value })}
                    placeholder="For temporary credentials (STS)"
                  />
                  <button
                    type="button"
                    className="toggle-visibility"
                    onClick={() => setShowSecrets(!showSecrets)}
                  >
                    {showSecrets ? '🙈' : '👁️'}
                  </button>
                </div>
                <small className="form-hint">
                  Only needed if using temporary credentials from AWS STS (e.g., assumed roles)
                </small>
              </div>

              {/* AWS Profile Helper */}
              <div className="profile-helper">
                <button
                  type="button"
                  className="btn btn-link"
                  onClick={() => setShowProfileHelper(!showProfileHelper)}
                >
                  📋 {showProfileHelper ? 'Hide' : 'Show'} AWS Profile Helper
                </button>
                
                {showProfileHelper && (
                  <div className="profile-helper-content">
                    <p><strong>Get credentials from AWS profile</strong></p>
                    <p>Run this command in your terminal to export credentials from a profile:</p>
                    
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label htmlFor="profileName" style={{ fontSize: '12px' }}>Profile name:</label>
                      <input
                        type="text"
                        id="profileName"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="default"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                      />
                    </div>

                    <div className="code-block">
                      <code>
{`# For long-term credentials (IAM user):
aws configure export-credentials --profile ${profileName} --format env

# For SSO/temporary credentials:
aws sso login --profile ${profileName}
aws configure export-credentials --profile ${profileName} --format env`}
                      </code>
                    </div>

                    <p style={{ fontSize: '12px', marginTop: '8px' }}>
                      Copy the output values:
                    </p>
                    <ul style={{ fontSize: '12px', margin: '4px 0', paddingLeft: '20px' }}>
                      <li><code>AWS_ACCESS_KEY_ID</code> → Access Key ID field</li>
                      <li><code>AWS_SECRET_ACCESS_KEY</code> → Secret Access Key field</li>
                      <li><code>AWS_SESSION_TOKEN</code> → Session Token field (if present)</li>
                    </ul>

                    <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                      ⚠️ Chrome extensions cannot directly access ~/.aws/credentials due to browser sandboxing.
                      Temporary credentials from SSO will expire and need to be refreshed.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="model">Model ID</label>
            <input
              type="text"
              id="model"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder={isBedrock ? "anthropic.claude-3-sonnet-20240229-v1:0" : "gpt-4, claude-3-sonnet, llama2"}
              required
            />
            {isBedrock && (
              <small className="form-hint">
                Common models: anthropic.claude-3-sonnet-20240229-v1:0, anthropic.claude-3-haiku-20240307-v1:0, amazon.titan-text-express-v1
              </small>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="maxTokens">Max Tokens</label>
              <input
                type="number"
                id="maxTokens"
                value={formData.maxTokens}
                onChange={(e) =>
                  setFormData({ ...formData, maxTokens: parseInt(e.target.value) })
                }
                min="1"
                max="100000"
              />
            </div>

            <div className="form-group">
              <label htmlFor="temperature">Temperature</label>
              <input
                type="number"
                id="temperature"
                value={formData.temperature}
                onChange={(e) =>
                  setFormData({ ...formData, temperature: parseFloat(e.target.value) })
                }
                min="0"
                max="2"
                step="0.1"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {isNew ? 'Add Model' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
