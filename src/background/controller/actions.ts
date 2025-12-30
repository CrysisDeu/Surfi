// Action Execution Controller (Browser-Use Style)
// Executes browser actions via Chrome APIs and content scripts

import { switchAgentFocus, closeTab, setAgentFocusTabId, trackAgentAction } from '../tab-manager'
import { callModelAPI, hasValidCredentials } from '../providers'
import { getActiveModel } from '../agent/loop'

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

  // Handle extract_content in background script with LLM (browser-use style)
  if (action.type === 'extract_content' && action.query) {
    try {
      // Get page markdown from content script
      const pageData = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_MARKDOWN' })
      if (!pageData || !pageData.markdown) {
        return { success: false, error: 'Failed to get page content' }
      }

      const pageMarkdown = pageData.markdown
      const pageUrl = pageData.url || ''
      const query = action.query

      // Truncate page content if too long (browser-use uses 30k, we'll use 20k)
      const MAX_CONTENT_LENGTH = 20000
      let content = pageMarkdown
      let truncated = false
      if (content.length > MAX_CONTENT_LENGTH) {
        // Try to truncate at paragraph break
        const truncateAt = content.lastIndexOf('\n\n', MAX_CONTENT_LENGTH - 500)
        if (truncateAt > 0) {
          content = content.substring(0, truncateAt)
        } else {
          content = content.substring(0, MAX_CONTENT_LENGTH)
        }
        truncated = true
      }

      // Get model for extraction (use same model as agent)
      const model = await getActiveModel()
      if (!model) {
        return { success: false, error: 'No model configured for extraction' }
      }

      // Check credentials
      if (!hasValidCredentials(model)) {
        return { success: false, error: 'Model credentials not configured' }
      }

      // Browser-use style extraction prompt
      const systemPrompt = `You are an expert at extracting data from the markdown of a webpage.

<input>
You will be given a query and the markdown of a webpage that has been filtered to remove noise and advertising content.
</input>

<instructions>
- You are tasked to extract information from the webpage that is relevant to the query.
- You should ONLY use the information available in the webpage to answer the query. Do not make up information or provide guess from your own knowledge.
- If the information relevant to the query is not available in the page, your response should mention that.
- If the query asks for all items, products, etc., make sure to directly list all of them.
- If the content was truncated, note that more content may be available.
</instructions>

<output>
- Your output should present ALL the information relevant to the query in a concise way.
- Do not answer in conversational format - directly output the relevant information or that the information is unavailable.
</output>`

      const userPrompt = `<query>
${query}
</query>

${truncated ? '<note>Content was truncated. More content may be available.</note>\n\n' : ''}<webpage_content>
${content}
</webpage_content>`

      // Call LLM to extract
      const extractedResult = await callModelAPI(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])

      // Format result like browser-use
      const extractedContent = `<url>
${pageUrl}
</url>
<query>
${query}
</query>
<result>
${extractedResult}
</result>`

      return {
        success: true,
        content: extractedContent
      }
    } catch (error) {
      console.error('[Surfi] Extraction failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Extraction failed'
      }
    }
  }

  // Track agent action for new tab detection (before executing)
  trackAgentAction(action.type)
  
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
