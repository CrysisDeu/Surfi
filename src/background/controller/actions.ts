// Action Execution Controller (Browser-Use Style)
// Executes browser actions via Chrome APIs and content scripts

import { switchAgentFocus, closeTab, setAgentFocusTabId } from '../tab-manager'

// Browser-use style action types
export interface ActionParams {
  type:
    | 'search'
    | 'navigate'
    | 'go_back'
    | 'wait'
    | 'click'
    | 'input_text'
    | 'scroll'
    | 'send_keys'
    | 'get_dropdown_options'
    | 'select_dropdown_option'
    | 'extract_content'
    | 'find_text'
    | 'switch_tab'
    | 'close_tab'
    | 'done'
  index?: number // browser-use style: element [id]
  text?: string
  clear?: boolean
  keys?: string
  url?: string
  new_tab?: boolean
  query?: string // for search and extract_content
  engine?: string // for search (google, duckduckgo, bing)
  down?: boolean // for scroll (default: true)
  pages?: number // for scroll (default: 1.0)
  seconds?: number // for wait
  success?: boolean // for done
  tab_id?: number // for switch_tab and close_tab
}

export interface ActionResult {
  success: boolean
  error?: string
  content?: string
  newTabId?: number
}

// Check if content script is ready with retries
export async function waitForContentScript(tabId: number, maxRetries: number = 5): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' })
      if (response?.alive) return true
    } catch {
      // Content script not ready, wait and retry
      console.log(`[Surfi] Content script not ready, retry ${i + 1}/${maxRetries}`)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

// Execute a browser action
export async function executeAction(
  tabId: number,
  action: ActionParams
): Promise<ActionResult> {
  // Handle tab management actions
  if (action.type === 'switch_tab') {
    if (!action.tab_id) {
      return { success: false, error: 'No tab_id provided for switch_tab' }
    }
    return await switchAgentFocus(action.tab_id)
  }
  
  if (action.type === 'close_tab') {
    if (!action.tab_id) {
      return { success: false, error: 'No tab_id provided for close_tab' }
    }
    return await closeTab(action.tab_id)
  }
  
  // Handle navigation actions directly in service worker (don't need content script)
  if (action.type === 'navigate' && action.url) {
    try {
      if (action.new_tab) {
        const newTab = await chrome.tabs.create({ url: action.url })
        // Auto-switch agent focus to the new tab
        if (newTab.id) {
          setAgentFocusTabId(newTab.id)
          console.log(`[Surfi] Auto-switched agent focus to new tab: ${newTab.id}`)
          return { success: true, newTabId: newTab.id }
        }
      } else {
        await chrome.tabs.update(tabId, { url: action.url })
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Navigation failed' }
    }
  }
  
  if (action.type === 'search' && action.query) {
    const engine = action.engine || 'google'
    const searchUrls: Record<string, string> = {
      google: `https://www.google.com/search?q=${encodeURIComponent(action.query)}`,
      duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(action.query)}`,
      bing: `https://www.bing.com/search?q=${encodeURIComponent(action.query)}`,
    }
    try {
      await chrome.tabs.update(tabId, { url: searchUrls[engine] || searchUrls.google })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' }
    }
  }
  
  if (action.type === 'go_back') {
    try {
      await chrome.tabs.goBack(tabId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Go back failed' }
    }
  }
  
  if (action.type === 'wait') {
    const ms = (action.seconds || 3) * 1000
    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 30000)))
    return { success: true, content: `Waited ${action.seconds || 3} seconds` }
  }

  // For content script actions, try with retries if disconnected
  const maxRetries = 3
  let lastError = ''
  
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // Add timeout to prevent hanging
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Action timed out after 10s')), 10000)
        )
      ])
      return response as ActionResult
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Failed to execute action'
      
      // Handle specific Chrome messaging errors - retry after waiting
      if (lastError.includes('message channel closed') || 
          lastError.includes('back/forward cache') ||
          lastError.includes('Receiving end does not exist') ||
          lastError.includes('Could not establish connection')) {
        console.log(`[Surfi] Content script disconnected, waiting for reconnect... (retry ${retry + 1}/${maxRetries})`)
        // Wait for content script to reload
        const ready = await waitForContentScript(tabId, 3)
        if (ready) continue // Retry the action
      }
      
      // Non-recoverable error
      break
    }
  }
  
  return { success: false, error: lastError || 'Content script unavailable' }
}

// Convert tool call inputs to ActionParams
export function toolInputToAction(toolName: string, toolInput: Record<string, unknown>): ActionParams {
  return {
    type: toolName as ActionParams['type'],
    index: toolInput.index as number | undefined,
    text: toolInput.text as string | undefined,
    clear: toolInput.clear as boolean | undefined,
    keys: toolInput.keys as string | undefined,
    url: toolInput.url as string | undefined,
    new_tab: toolInput.new_tab as boolean | undefined,
    query: toolInput.query as string | undefined,
    engine: toolInput.engine as string | undefined,
    down: toolInput.down as boolean | undefined,
    pages: toolInput.pages as number | undefined,
    seconds: toolInput.seconds as number | undefined,
    success: toolInput.success as boolean | undefined,
    tab_id: toolInput.tab_id as number | undefined,
  }
}
