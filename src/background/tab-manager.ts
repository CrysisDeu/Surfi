// Tab State Management (Browser-Use Style)
// Tracks all open tabs and manages agent focus

export interface TabState {
  id: number           // Chrome tab ID
  url: string
  title: string
  windowId: number
  isActive: boolean    // Currently active tab in its window
}

// Global tab state
export let managedTabs: Map<number, TabState> = new Map()
export let agentFocusTabId: number | null = null

// Setter for agentFocusTabId (needed for external modules)
export function setAgentFocusTabId(tabId: number | null): void {
  agentFocusTabId = tabId
}

// Initialize tab tracking
export async function initializeTabTracking(): Promise<void> {
  // Get all existing tabs
  const tabs = await chrome.tabs.query({})
  managedTabs.clear()
  
  for (const tab of tabs) {
    if (tab.id) {
      managedTabs.set(tab.id, {
        id: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
        isActive: tab.active || false,
      })
    }
  }
  
  // Set initial agent focus to the active tab in the current window
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (activeTab?.id) {
    agentFocusTabId = activeTab.id
  }
  
  console.log(`[Browser AI] Tab tracking initialized: ${managedTabs.size} tabs, agent focus: ${agentFocusTabId}`)
}

// Set up tab event listeners
export function setupTabListeners(): void {
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id) {
      managedTabs.set(tab.id, {
        id: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
        isActive: tab.active || false,
      })
      console.log(`[Browser AI] Tab created: ${tab.id} - ${tab.url}`)
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    managedTabs.delete(tabId)
    console.log(`[Browser AI] Tab removed: ${tabId}`)
    
    // If agent was focused on this tab, switch focus to another tab
    if (agentFocusTabId === tabId) {
      const remainingTabs = Array.from(managedTabs.values())
      if (remainingTabs.length > 0) {
        // Prefer the active tab, otherwise first available
        const activeTab = remainingTabs.find(t => t.isActive)
        agentFocusTabId = activeTab?.id || remainingTabs[0].id
        console.log(`[Browser AI] Agent focus switched to: ${agentFocusTabId}`)
      } else {
        agentFocusTabId = null
      }
    }
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const existing = managedTabs.get(tabId)
    if (existing) {
      if (changeInfo.url) existing.url = changeInfo.url
      if (changeInfo.title) existing.title = changeInfo.title
      if (tab.active !== undefined) existing.isActive = tab.active
    } else if (tab.id) {
      // Tab wasn't tracked yet, add it
      managedTabs.set(tab.id, {
        id: tab.id,
        url: tab.url || '',
        title: tab.title || '',
        windowId: tab.windowId,
        isActive: tab.active || false,
      })
    }
  })

  chrome.tabs.onActivated.addListener((activeInfo) => {
    // Update isActive for all tabs in this window
    for (const [tabId, tab] of managedTabs) {
      if (tab.windowId === activeInfo.windowId) {
        tab.isActive = tabId === activeInfo.tabId
      }
    }
  })
}

// Get formatted tab list for system prompt
export function getTabsInfo(): string {
  const tabs = Array.from(managedTabs.values())
  if (tabs.length === 0) return 'No tabs open'
  
  return tabs.map(t => {
    const focusMarker = t.id === agentFocusTabId ? '→ ' : '  '
    const activeMarker = t.isActive ? ' [active]' : ''
    const truncatedTitle = t.title.length > 50 ? t.title.slice(0, 47) + '...' : t.title
    const truncatedUrl = t.url.length > 60 ? t.url.slice(0, 57) + '...' : t.url
    return `${focusMarker}Tab[${t.id}]${activeMarker}: ${truncatedTitle}\n     ${truncatedUrl}`
  }).join('\n')
}

// Switch agent focus to a specific tab
export async function switchAgentFocus(tabId: number): Promise<{ success: boolean; error?: string }> {
  if (!managedTabs.has(tabId)) {
    return { success: false, error: `Tab ${tabId} not found` }
  }
  
  agentFocusTabId = tabId
  
  // Also activate the tab in Chrome so user can see it
  try {
    await chrome.tabs.update(tabId, { active: true })
  } catch (error) {
    console.warn(`[Browser AI] Could not activate tab ${tabId}:`, error)
  }
  
  console.log(`[Browser AI] Agent focus switched to tab ${tabId}`)
  return { success: true }
}

// Close a tab
export async function closeTab(tabId: number): Promise<{ success: boolean; error?: string }> {
  if (!managedTabs.has(tabId)) {
    return { success: false, error: `Tab ${tabId} not found` }
  }
  
  try {
    await chrome.tabs.remove(tabId)
    // onRemoved listener will handle state update
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close tab' }
  }
}
