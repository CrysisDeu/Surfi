import { useState } from 'react'
import { AWS_REGIONS } from '../constants'
import { type ModelFormData, parseAWSCredentialsBlob } from '../utils'

interface ModelEditorProps {
  formData: ModelFormData
  onSave: (formData: ModelFormData) => void
  onCancel: () => void
  isNew: boolean
}

export function ModelEditor({ formData: initialFormData, onSave, onCancel, isNew }: ModelEditorProps) {
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
                  {AWS_REGIONS.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
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
                    <label
                      htmlFor="credentialBlob"
                      style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}
                    >
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
                    <p>
                      <strong>Get credentials from AWS profile</strong>
                    </p>
                    <p>Run this command in your terminal to export credentials from a profile:</p>

                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label htmlFor="profileName" style={{ fontSize: '12px' }}>
                        Profile name:
                      </label>
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

                    <p style={{ fontSize: '12px', marginTop: '8px' }}>Copy the output values:</p>
                    <ul style={{ fontSize: '12px', margin: '4px 0', paddingLeft: '20px' }}>
                      <li>
                        <code>AWS_ACCESS_KEY_ID</code> → Access Key ID field
                      </li>
                      <li>
                        <code>AWS_SECRET_ACCESS_KEY</code> → Secret Access Key field
                      </li>
                      <li>
                        <code>AWS_SESSION_TOKEN</code> → Session Token field (if present)
                      </li>
                    </ul>

                    <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                      ⚠️ Chrome extensions cannot directly access ~/.aws/credentials due to browser
                      sandboxing. Temporary credentials from SSO will expire and need to be refreshed.
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
              placeholder={
                isBedrock
                  ? 'anthropic.claude-3-sonnet-20240229-v1:0'
                  : 'gpt-4, claude-3-sonnet, llama2'
              }
              required
            />
            {isBedrock && (
              <small className="form-hint">
                Common models: anthropic.claude-3-sonnet-20240229-v1:0,
                anthropic.claude-3-haiku-20240307-v1:0, amazon.titan-text-express-v1
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
                onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) })}
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
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
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
