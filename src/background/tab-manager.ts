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

// Track recent agent actions to detect new tabs opened by agent
let recentAgentAction: { type: string; timestamp: number } | null = null
// When clicking a link that opens in a new tab, the tab is created almost immediately (within ~100-500ms)
// We use a short window to avoid catching user-opened tabs while still catching agent-opened ones
const AGENT_ACTION_WINDOW_MS = 500 // 500ms window - tab creation from click is nearly instant

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
  
  console.log(`[Surfi] Tab tracking initialized: ${managedTabs.size} tabs, agent focus: ${agentFocusTabId}`)
}

// Track agent action for new tab detection
export function trackAgentAction(actionType: string): void {
  recentAgentAction = {
    type: actionType,
    timestamp: Date.now(),
  }
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
      console.log(`[Surfi] Tab created: ${tab.id} - ${tab.url}`)
      
      // Auto-switch agent focus if tab was created shortly after an agent action
      // (e.g., clicking a link that opens in new tab)
      if (recentAgentAction) {
        const timeSinceAction = Date.now() - recentAgentAction.timestamp
        if (timeSinceAction < AGENT_ACTION_WINDOW_MS) {
          // Only auto-switch for click actions (links that open in new tabs)
          if (recentAgentAction.type === 'click') {
            agentFocusTabId = tab.id
            console.log(`[Surfi] Auto-switched agent focus to new tab created by click: ${tab.id}`)
            // Also activate the tab so user can see it
            chrome.tabs.update(tab.id, { active: true }).catch(err => {
              console.warn(`[Surfi] Could not activate tab ${tab.id}:`, err)
            })
          }
        }
      }
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    managedTabs.delete(tabId)
    console.log(`[Surfi] Tab removed: ${tabId}`)
    
    // If agent was focused on this tab, switch focus to another tab
    if (agentFocusTabId === tabId) {
      const remainingTabs = Array.from(managedTabs.values())
      if (remainingTabs.length > 0) {
        // Prefer the active tab, otherwise first available
        const activeTab = remainingTabs.find(t => t.isActive)
        agentFocusTabId = activeTab?.id || remainingTabs[0].id
        console.log(`[Surfi] Agent focus switched to: ${agentFocusTabId}`)
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
    console.warn(`[Surfi] Could not activate tab ${tabId}:`, error)
  }
  
  console.log(`[Surfi] Agent focus switched to tab ${tabId}`)
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
