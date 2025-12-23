import type { Settings, Message } from '../types'

const STORAGE_KEYS = {
  SETTINGS: 'settings',
  CHAT_HISTORY: 'chatHistory',
} as const

// Default settings
export const DEFAULT_SETTINGS: Settings = {
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

// Get settings from Chrome storage
export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEYS.SETTINGS, (result) => {
      resolve(result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS)
    })
  })
}

// Save settings to Chrome storage
export async function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings }, resolve)
  })
}

// Get chat history from Chrome storage
export async function getChatHistory(): Promise<Message[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CHAT_HISTORY, (result) => {
      resolve(result[STORAGE_KEYS.CHAT_HISTORY] || [])
    })
  })
}

// Save chat history to Chrome storage
export async function saveChatHistory(messages: Message[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.CHAT_HISTORY]: messages }, resolve)
  })
}

// Clear chat history
export async function clearChatHistory(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEYS.CHAT_HISTORY, resolve)
  })
}

// Listen for settings changes
export function onSettingsChange(callback: (settings: Settings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[STORAGE_KEYS.SETTINGS]) {
      callback(changes[STORAGE_KEYS.SETTINGS].newValue)
    }
  }

  chrome.storage.onChanged.addListener(listener)

  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}
