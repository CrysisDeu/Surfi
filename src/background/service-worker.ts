// Surfi Service Worker
// Thin orchestrator that delegates to specialized modules

import type { ChatRequest } from '../types'
import { handleAgentLoop, handleChatMessage } from './agent'
import { initializeTabTracking, setupTabListeners } from './tab-manager'
import { getPageContext } from './browser'
import { executeAction } from './controller'

// ============================================================================
// Chrome Extension Event Listeners
// ============================================================================

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})


// Track the active sidepanel port
let activeSidePanelPort: chrome.runtime.Port | null = null

// Handle streaming connections (ReAct agent loop)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
    activeSidePanelPort = port

    port.onDisconnect.addListener(() => {
      if (activeSidePanelPort === port) {
        activeSidePanelPort = null
      }
    })

    port.onMessage.addListener(async (request) => {
      if (request.type === 'CHAT_MESSAGE_STREAM') {
        // Create a port delegate that always uses the latest active port
        const portDelegate = {
          name: port.name,
          disconnect: () => activeSidePanelPort?.disconnect(),
          onMessage: port.onMessage,
          onDisconnect: port.onDisconnect,
          postMessage: (message: any) => {
            try {
              activeSidePanelPort?.postMessage(message)
            } catch (e) {
              console.error('Failed to send message to sidepanel:', e)
            }
          }
        } as chrome.runtime.Port

        try {
          // Pass the delegate so the agent always talks to the live panel
          await handleAgentLoop(request as ChatRequest, portDelegate)
        } catch (error) {
          activeSidePanelPort?.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    })
  }
})

// Handle messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'CHAT_MESSAGE') {
    handleChatMessage(request as ChatRequest)
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ error: error.message }))
    return true
  }

  if (request.type === 'GET_PAGE_CONTEXT') {
    getPageContext(request.tabId)
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ error: error.message }))
    return true
  }

  if (request.type === 'EXECUTE_ACTION') {
    executeAction(request.tabId, request.action)
      .then(sendResponse)
      .catch((error: Error) => sendResponse({ error: error.message }))
    return true
  }
})

// ============================================================================
// Extension Initialization
// ============================================================================

// Default settings
const DEFAULT_SETTINGS = {
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

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Surfi extension installed')

  chrome.storage.sync.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    }
  })

  // Initialize tab tracking
  initializeTabTracking()
})

// Initialize on service worker startup
setupTabListeners()
initializeTabTracking()

console.log('[Surfi] Service worker initialized')
