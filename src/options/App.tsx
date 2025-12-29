import { useState, useEffect } from 'react'
import type { Settings, ModelConfig } from '../types'
import { DEFAULT_SETTINGS } from './constants'
import {
  type ModelFormData,
  createEmptyFormData,
  formDataToModelConfig,
  modelConfigToFormData,
} from './utils'
import { useTheme } from '../lib/theme-context'
import { ModelCard } from './components/ModelCard'
import { ModelEditor } from './components/ModelEditor'
import { PresetButtons } from './components/PresetButtons'

function App() {
  const { theme, toggleTheme } = useTheme()
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
    setEditingModel(createEmptyFormData())
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

  const handleSelectPreset = (formData: ModelFormData) => {
    setEditingModel(formData)
    setIsAddingModel(true)
  }

  return (
    <div className="options-container">
      <header className="options-header">
        <h1>🏄 Surfi Settings</h1>
        <p>Configure your AI models and preferences</p>
        <button 
          className="btn btn-secondary theme-toggle" 
          onClick={toggleTheme}
          style={{ marginTop: '12px' }}
        >
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </header>

      <main className="options-main">
        {/* AI Models Section */}
        <section className="section">
          <div className="section-header">
            <h2>AI Models</h2>
            <button className="btn btn-primary" onClick={handleAddModel}>
              + Add Model
            </button>
          </div>

          <div className="models-list">
            {settings.models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isActive={settings.activeModelId === model.id}
                onSetActive={() => handleSetActiveModel(model.id)}
                onEdit={() => handleEditModel(model)}
                onDelete={() => handleDeleteModel(model.id)}
              />
            ))}
          </div>
        </section>

        {/* Agent Settings Section */}
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
                Maximum number of tool use iterations per message (1-50). Higher values allow more
                complex tasks but may cost more tokens.
              </small>
            </div>
          </div>
        </section>

        {/* Quick Add Presets Section */}
        <section className="section">
          <h2>Quick Add Presets</h2>
          <PresetButtons onSelectPreset={handleSelectPreset} />
        </section>

        {/* Save Status */}
        {saveStatus !== 'idle' && (
          <div className={`save-status ${saveStatus}`}>
            {saveStatus === 'saving' ? 'Saving...' : 'Settings saved!'}
          </div>
        )}
      </main>

      {/* Model Editor Modal */}
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

export default App
