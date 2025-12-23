import type { Message, PageContext, ActionRequest } from '../types'

// Message types for communication between extension components
export type MessageType =
  | { type: 'CHAT_MESSAGE'; payload: { messages: Message[] } }
  | { type: 'GET_PAGE_CONTEXT'; tabId: number }
  | { type: 'EXECUTE_ACTION'; tabId: number; action: ActionRequest }
  | { type: 'GET_CONTEXT' }
  | { type: 'SETTINGS_UPDATED' }

// Send a message to the background service worker
export async function sendToBackground<T>(message: MessageType): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else if (response?.error) {
        reject(new Error(response.error))
      } else {
        resolve(response)
      }
    })
  })
}

// Send a message to a content script in a specific tab
export async function sendToContentScript<T>(
  tabId: number,
  message: MessageType
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else if (response?.error) {
        reject(new Error(response.error))
      } else {
        resolve(response)
      }
    })
  })
}

// Get the current active tab
export async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

// Get page context from the current tab
export async function getPageContext(): Promise<PageContext | null> {
  const tab = await getCurrentTab()
  if (!tab?.id) return null

  try {
    const response = await sendToContentScript<PageContext>(tab.id, {
      type: 'GET_CONTEXT',
    })
    return response
  } catch (error) {
    console.warn('Could not get page context:', error)
    return {
      url: tab.url || '',
      title: tab.title || '',
      content: '',
    }
  }
}

// Execute an action on the current page
export async function executePageAction(
  action: ActionRequest
): Promise<{ success: boolean; error?: string }> {
  const tab = await getCurrentTab()
  if (!tab?.id) {
    return { success: false, error: 'No active tab' }
  }

  try {
    return await sendToContentScript(tab.id, {
      type: 'EXECUTE_ACTION',
      tabId: tab.id,
      action,
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Action failed',
    }
  }
}

// Send a chat message and get response
export async function sendChatMessage(
  messages: Message[]
): Promise<{ content: string; error?: string }> {
  return sendToBackground({
    type: 'CHAT_MESSAGE',
    payload: { messages },
  })
}
