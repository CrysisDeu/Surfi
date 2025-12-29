// Browser Context Extraction (Browser-Use Style)
// Gets DOM tree and page state from content scripts

export interface PageContext {
  url: string
  title: string
  domTree: string
  interactiveCount: number
  selectedText?: string
  selectorMap: Record<number, string>
}

// Get page context from a tab
export async function getPageContext(tabId: number): Promise<PageContext> {
  try {
    // Use the GET_DOM_TREE message for browser-use style extraction
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_DOM_TREE' })
    return {
      url: response.url || '',
      title: response.title || '',
      domTree: response.tree || '',
      interactiveCount: response.interactiveCount || 0,
      selectorMap: response.selectorMap || {},
    }
  } catch {
    // Fallback: get basic tab info if content script unavailable
    const tab = await chrome.tabs.get(tabId)
    return {
      url: tab.url || '',
      title: tab.title || '',
      domTree: '',
      interactiveCount: 0,
      selectorMap: {},
    }
  }
}

// Get page context with retries (for after navigation)
export async function getPageContextWithRetry(
  tabId: number, 
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<PageContext> {
  let context = await getPageContext(tabId)
  
  // If DOM is empty, retry a few times (content script might be loading)
  let retries = 0
  while (!context.domTree && retries < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    context = await getPageContext(tabId)
    retries++
  }
  
  return context
}
