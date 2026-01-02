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
            // Add the new tab to the agent's tab group
            if (agentTabGroupId !== null) {
              chrome.tabs.group({ tabIds: [tab.id], groupId: agentTabGroupId }).catch(err => {
                console.warn(`[Surfi] Could not add tab to group:`, err)
              })
            }
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
export async function switchAgentFocus(tabId: number): Promise<{ success: boolean; error?: string; content?: string }> {
  if (!managedTabs.has(tabId)) {
    return { success: false, error: `Tab ${tabId} not found` }
  }

  const tab = managedTabs.get(tabId)
  agentFocusTabId = tabId

  // Also activate the tab in Chrome so user can see it
  try {
    await chrome.tabs.update(tabId, { active: true })
  } catch (error) {
    console.warn(`[Surfi] Could not activate tab ${tabId}:`, error)
  }

  console.log(`[Surfi] Agent focus switched to tab ${tabId}`)
  return { success: true, content: `Switched to tab ${tabId}: ${tab?.title || tab?.url || 'unknown'}` }
}

// Close a tab
export async function closeTab(tabId: number): Promise<{ success: boolean; error?: string; content?: string }> {
  if (!managedTabs.has(tabId)) {
    return { success: false, error: `Tab ${tabId} not found` }
  }

  const tab = managedTabs.get(tabId)
  try {
    await chrome.tabs.remove(tabId)
    // onRemoved listener will handle state update
    return { success: true, content: `Closed tab ${tabId}: ${tab?.title || tab?.url || 'unknown'}` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to close tab' }
  }
}

// ============================================================================
// Tab Group Management (Chrome Tab Groups API)
// ============================================================================

// Track the agent's tab group
let agentTabGroupId: number | null = null

/**
 * Check if Chrome tab groups are supported
 * Tab groups are available in Chrome 88+ but not in Firefox
 */
export function hasTabGroupSupport(): boolean {
  return typeof chrome.tabs.group === 'function' && typeof chrome.tabGroups !== 'undefined'
}

/**
 * Create a tab group for the agent's tabs
 * This groups the initial tab and any new tabs the agent opens
 */
export async function createAgentTabGroup(tabId: number): Promise<{ groupId: number } | null> {
  if (!hasTabGroupSupport()) {
    console.log('[Surfi] Tab groups not supported in this browser')
    return null
  }

  try {
    // Create a new tab group with the given tab
    const groupId = await chrome.tabs.group({ tabIds: [tabId] })

    // Customize the group appearance
    await chrome.tabGroups.update(groupId, {
      title: 'Surfi Agent',
      color: 'blue',
      collapsed: false
    })

    agentTabGroupId = groupId
    console.log(`[Surfi] Created tab group ${groupId} with tab ${tabId}`)

    return { groupId }
  } catch (error) {
    console.error('[Surfi] Failed to create tab group:', error)
    return null
  }
}

/**
 * Add a tab to the agent's existing group
 */
export async function addTabToAgentGroup(tabId: number): Promise<boolean> {
  if (!hasTabGroupSupport() || agentTabGroupId === null) {
    return false
  }

  try {
    await chrome.tabs.group({ tabIds: [tabId], groupId: agentTabGroupId })
    console.log(`[Surfi] Added tab ${tabId} to agent group ${agentTabGroupId}`)
    return true
  } catch (error) {
    console.warn(`[Surfi] Could not add tab ${tabId} to group:`, error)
    return false
  }
}

/**
 * Cleanup the agent's tab group
 * @param action - 'ungroup' to just ungroup tabs, 'close' to close all tabs in group
 */
export async function cleanupAgentTabGroup(action: 'ungroup' | 'close' = 'ungroup'): Promise<void> {
  if (!hasTabGroupSupport() || agentTabGroupId === null) {
    return
  }

  try {
    // Get all tabs in the agent's group
    const tabs = await chrome.tabs.query({ groupId: agentTabGroupId })
    const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined)

    if (action === 'close') {
      // Close all tabs in the group
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds)
      }
    } else {
      // Just ungroup the tabs
      if (tabIds.length > 0) {
        await chrome.tabs.ungroup(tabIds)
      }
    }

    console.log(`[Surfi] Cleaned up tab group ${agentTabGroupId} (${action})`)
    agentTabGroupId = null
  } catch (error) {
    console.error('[Surfi] Failed to cleanup tab group:', error)
    agentTabGroupId = null
  }
}

/**
 * Get the current agent tab group ID
 */
export function getAgentTabGroupId(): number | null {
  return agentTabGroupId
}
