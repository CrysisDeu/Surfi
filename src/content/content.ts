// Content script - runs in the context of web pages
import { extractDOM, getElementByNodeId, getSelectorMap } from './dom-service'

// Browser-use style action types
interface ActionRequest {
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
  // Element interaction
  index?: number // browser-use style: element [id] number
  text?: string // for input_text, select_dropdown_option, find_text
  clear?: boolean // for input_text (default: true)
  // Navigation
  url?: string // for navigate
  new_tab?: boolean // for navigate
  query?: string // for search, extract_content
  engine?: string // for search (google, duckduckgo, bing)
  // Scroll
  down?: boolean // for scroll (default: true)
  pages?: number // for scroll (default: 1.0)
  // Keyboard
  keys?: string // for send_keys
  // Wait
  seconds?: number // for wait
  // Legacy support
  selector?: string
  nodeId?: number
  value?: string
  direction?: 'up' | 'down' // legacy scroll direction
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Ping to check if content script is alive
  if (request.type === 'PING') {
    sendResponse({ alive: true })
    return true
  }

  if (request.type === 'GET_CONTEXT') {
    const context = getPageContext()
    sendResponse(context)
    return true
  }

  if (request.type === 'GET_DOM_TREE') {
    // New: Returns the serialized DOM tree for LLM consumption
    const dom = extractDOM()
    sendResponse({
      tree: dom.tree,
      interactiveCount: dom.interactiveCount,
      url: dom.url,
      title: dom.title,
      selectorMap: getSelectorMap(), // Simplified map for action execution
    })
    return true
  }

  if (request.type === 'EXECUTE_ACTION') {
    executeAction(request.action)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true
  }
})

// Get page context for AI (legacy format + new tree)
function getPageContext() {
  const selectedText = window.getSelection()?.toString() || ''
  const dom = extractDOM()

  return {
    url: window.location.href,
    title: document.title,
    selectedText,
    // New: Structured DOM tree for LLM
    domTree: dom.tree,
    interactiveCount: dom.interactiveCount,
    // Legacy: Simple content for basic use cases
    content: extractVisibleText(document.body),
    // Legacy: Old format for backwards compatibility
    interactiveElements: getInteractiveElements(),
  }
}

// Extract visible text from an element (simplified version for legacy support)
function extractVisibleText(element: Element): string {
  const excludedTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG']

  if (excludedTags.includes(element.tagName)) {
    return ''
  }

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return ''
  }

  let text = ''

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent?.trim() + ' '
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      text += extractVisibleText(child as Element)
    }
  }

  return text.substring(0, 10000) // Limit content length
}

// Get interactive elements (legacy format)
function getInteractiveElements(): Array<{
  tag: string
  text: string
  selector: string
  type?: string
}> {
  const elements: Array<{
    tag: string
    text: string
    selector: string
    type?: string
  }> = []

  // Buttons
  document.querySelectorAll('button').forEach((el, index) => {
    elements.push({
      tag: 'button',
      text: el.textContent?.trim().substring(0, 50) || '',
      selector: generateSelector(el) || `button:nth-of-type(${index + 1})`,
    })
  })

  // Links
  document.querySelectorAll('a[href]').forEach((el, index) => {
    elements.push({
      tag: 'a',
      text: el.textContent?.trim().substring(0, 50) || '',
      selector: generateSelector(el) || `a:nth-of-type(${index + 1})`,
    })
  })

  // Input fields
  document.querySelectorAll('input, textarea, select').forEach((el, index) => {
    const inputEl = el as HTMLInputElement
    elements.push({
      tag: el.tagName.toLowerCase(),
      text: inputEl.placeholder || inputEl.name || inputEl.id || '',
      selector: generateSelector(el) || `input:nth-of-type(${index + 1})`,
      type: inputEl.type,
    })
  })

  return elements.slice(0, 50) // Limit number of elements
}

// Generate a unique CSS selector for an element
function generateSelector(element: Element): string | null {
  if (element.id) {
    return `#${element.id}`
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className
      .trim()
      .split(/\s+/)
      .filter((c) => c && !c.includes(':'))
    if (classes.length > 0) {
      const selector = `${element.tagName.toLowerCase()}.${classes.join('.')}`
      if (document.querySelectorAll(selector).length === 1) {
        return selector
      }
    }
  }

  // Try data attributes
  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    return `[data-testid="${dataTestId}"]`
  }

  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel) {
    return `[aria-label="${ariaLabel}"]`
  }

  return null
}

// Execute an action on the page (browser-use style)
async function executeAction(action: ActionRequest): Promise<{ success: boolean; error?: string; content?: string }> {
  try {
    // Resolve element index (browser-use style uses "index", legacy uses "nodeId")
    const elementIndex = action.index ?? action.nodeId

    switch (action.type) {
      // Element interaction
      case 'click':
        return await clickElement(action.selector, elementIndex)

      case 'input_text': {
        const text = action.text ?? action.value ?? ''
        const clear = action.clear !== false // Clear by default (browser-use style)
        return await typeInElement(action.selector, elementIndex, text, clear)
      }

      case 'scroll': {
        // Browser-use style: down (bool), pages (number)
        const direction = action.down === false ? 'up' : 'down'
        return scrollPage(direction, action.pages || 1, elementIndex)
      }

      case 'send_keys':
        return await sendKeys(action.keys || '')

      // Navigation
      case 'search': {
        const engine = action.engine || 'google'
        const searchUrls: Record<string, string> = {
          google: `https://www.google.com/search?q=${encodeURIComponent(action.query || '')}`,
          duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(action.query || '')}`,
          bing: `https://www.bing.com/search?q=${encodeURIComponent(action.query || '')}`,
        }
        return navigateTo(searchUrls[engine] || searchUrls.google, false)
      }

      case 'navigate':
        return navigateTo(action.url!, action.new_tab)

      case 'go_back':
        window.history.back()
        return { success: true }

      case 'wait': {
        const ms = (action.seconds || 3) * 1000
        await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30000)))
        return { success: true, content: `Waited ${action.seconds || 3} seconds` }
      }

      // Dropdown actions
      case 'get_dropdown_options':
        return getDropdownOptions(elementIndex)

      case 'select_dropdown_option':
        return await selectDropdownOption(elementIndex, action.text || '')

      // Content extraction
      case 'extract_content':
        return extractContent(action.query)

      case 'find_text':
        return findAndScrollToText(action.text || '')

      default:
        return { success: false, error: `Unknown action type: ${action.type}` }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Action failed',
    }
  }
}

// Resolve element from selector or nodeId
function resolveElement(selector?: string, nodeId?: number): Element | null {
  // Prefer nodeId if provided (browser-use style)
  if (nodeId !== undefined) {
    const el = getElementByNodeId(nodeId)
    
    // DON'T re-extract here - IDs from model are based on the DOM tree the model saw
    // Re-extracting would create NEW IDs that don't match what model expects
    // Let it fail and service worker will refresh context for next iteration
    
    if (el) return el
    console.warn(`[Surfi] Element with nodeId ${nodeId} not found in selectorMap`)
  }

  // Fall back to selector
  if (selector) {
    return document.querySelector(selector)
  }

  return null
}

// Get debug info about available elements
function getAvailableElementsDebug(): string {
  // Show current map WITHOUT re-extracting
  // If empty, explain why - the model needs to request fresh DOM
  const currentMap = getSelectorMap()
  
  if (currentMap.length === 0) {
    return `Available elements (0 interactive):\nSelectorMap is empty - DOM needs to be re-extracted via GET_DOM_TREE`
  }
  
  const lines = currentMap.slice(0, 30).map(item => 
    `[${item.id}] <${item.tag}> ${item.text ? `"${item.text}"` : ''} → ${item.selector}`
  )
  return `Available elements (${currentMap.length} interactive):\n${lines.join('\n')}${currentMap.length > 30 ? '\n... (truncated)' : ''}`
}

// Click on an element
async function clickElement(selector?: string, nodeId?: number): Promise<{ success: boolean; error?: string; content?: string }> {
  const element = resolveElement(selector, nodeId)
  if (!element) {
    const debug = getAvailableElementsDebug()
    return { 
      success: false, 
      error: `Element [${nodeId ?? selector}] not found`,
      content: debug
    }
  }

  // Highlight the element
  highlightElement(element)

  // Scroll element into view
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Wait for scroll
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Click the element
  if (element instanceof HTMLElement) {
    element.click()
    console.log(`[Surfi] Clicked element: ${nodeId ?? selector}`)

    // Wait for page to react to click (important for SPA navigation/data loading)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return { success: true }
  }

  return { success: false, error: 'Element is not clickable' }
}

// Type text into an input element - multiple methods for maximum compatibility
async function typeInElement(
  selector?: string,
  nodeId?: number,
  value?: string,
  clear: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!value) {
    return { success: false, error: 'No value provided' }
  }

  const element = resolveElement(selector, nodeId)
  if (!element) {
    return { success: false, error: `Element not found: ${nodeId ?? selector}` }
  }

  // Highlight the element so user can see what's being interacted with
  highlightElement(element)

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Focus the element first
    element.focus()
    
    // Clear existing text if requested
    if (clear) {
      element.select() // Select all existing text
    }

    // Method 1: Try execCommand (works on some browsers)
    const execSuccess = document.execCommand('insertText', false, value)

    if (!execSuccess) {
      // Method 2: Use native setter + dispatch events (for React)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        element instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype,
        'value'
      )?.set

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value)
      } else {
        element.value = value
      }

      // Dispatch React-compatible events
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))

      // Also try keyboard events for apps that listen to those
      for (const char of value) {
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: char,
            bubbles: true,
            cancelable: true,
          })
        )
        element.dispatchEvent(
          new KeyboardEvent('keypress', {
            key: char,
            bubbles: true,
            cancelable: true,
          })
        )
        element.dispatchEvent(
          new KeyboardEvent('keyup', {
            key: char,
            bubbles: true,
            cancelable: true,
          })
        )
      }
    }

    // Also dispatch blur to trigger validation
    await new Promise((resolve) => setTimeout(resolve, 100))
    element.dispatchEvent(new Event('blur', { bubbles: true }))

    console.log(`[Surfi] Typed "${value}" into ${nodeId ?? selector}, current value: "${element.value}"`)

    return { success: true }
  }

  // Try contenteditable elements
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus()

    // Select all and replace
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)

    document.execCommand('insertText', false, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))

    return { success: true }
  }

  return { success: false, error: 'Element is not an input field' }
}

// Scroll the page or element (browser-use style with pages)
function scrollPage(direction: 'up' | 'down', pages: number = 1, elementIndex?: number): { success: boolean } {
  const scrollAmount = window.innerHeight * pages * 0.8

  if (elementIndex !== undefined && elementIndex !== 0) {
    // Scroll within a specific element
    const element = getElementByNodeId(elementIndex)
    if (element instanceof HTMLElement) {
      element.scrollBy({
        top: direction === 'down' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      })
      return { success: true }
    }
  }

  // Scroll the page
  window.scrollBy({
    top: direction === 'down' ? scrollAmount : -scrollAmount,
    behavior: 'smooth',
  })
  return { success: true }
}

// Send keyboard keys
async function sendKeys(keys: string): Promise<{ success: boolean; error?: string }> {
  const activeElement = document.activeElement as HTMLElement

  // Parse key combinations like "Control+a"
  const keyParts = keys.split('+')
  const modifiers = {
    ctrlKey: keyParts.includes('Control') || keyParts.includes('Ctrl'),
    shiftKey: keyParts.includes('Shift'),
    altKey: keyParts.includes('Alt'),
    metaKey: keyParts.includes('Meta') || keyParts.includes('Command'),
  }
  const key = keyParts[keyParts.length - 1]

  // Dispatch keyboard events
  activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true })
  )
  activeElement?.dispatchEvent(
    new KeyboardEvent('keypress', { key, ...modifiers, bubbles: true, cancelable: true })
  )
  activeElement?.dispatchEvent(
    new KeyboardEvent('keyup', { key, ...modifiers, bubbles: true, cancelable: true })
  )

  // Handle special keys
  if (key === 'Enter' && activeElement?.closest('form')) {
    const form = activeElement.closest('form')
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  return { success: true }
}

// Navigate to a URL
function navigateTo(url: string, newTab?: boolean): { success: boolean } {
  if (newTab) {
    window.open(url, '_blank')
  } else {
    window.location.href = url
  }
  return { success: true }
}

// Get dropdown options (browser-use style)
function getDropdownOptions(elementIndex?: number): { success: boolean; error?: string; content?: string } {
  if (elementIndex === undefined) {
    return { success: false, error: 'No element index provided' }
  }

  const element = getElementByNodeId(elementIndex)
  if (!element) {
    return { success: false, error: `Element not found: ${elementIndex}` }
  }

  if (element instanceof HTMLSelectElement) {
    const options = Array.from(element.options).map((opt, i) => `${i}: ${opt.text}`).join('\n')
    return { success: true, content: `Dropdown options:\n${options}` }
  }

  // For custom dropdowns, look for listbox items
  const listItems = element.querySelectorAll('[role="option"], li, [role="menuitem"]')
  if (listItems.length > 0) {
    const options = Array.from(listItems).map((el, i) => `${i}: ${el.textContent?.trim()}`).join('\n')
    return { success: true, content: `Dropdown options:\n${options}` }
  }

  return { success: false, error: 'Element is not a dropdown' }
}

// Select dropdown option (browser-use style)
async function selectDropdownOption(
  elementIndex: number | undefined,
  optionText: string
): Promise<{ success: boolean; error?: string; content?: string }> {
  if (elementIndex === undefined) {
    return { success: false, error: 'No element index provided' }
  }

  const element = getElementByNodeId(elementIndex)
  if (!element) {
    return { success: false, error: `Element not found: ${elementIndex}` }
  }

  if (element instanceof HTMLSelectElement) {
    const options = Array.from(element.options)
    const option = options.find((opt) => opt.text.toLowerCase().includes(optionText.toLowerCase()))

    if (option) {
      element.value = option.value
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true, content: `Selected: ${option.text}` }
    }
    return { success: false, error: `Option "${optionText}" not found` }
  }

  // For custom dropdowns, try clicking the option
  const optionElement = Array.from(element.querySelectorAll('*')).find((el) =>
    el.textContent?.toLowerCase().includes(optionText.toLowerCase())
  )

  if (optionElement instanceof HTMLElement) {
    optionElement.click()
    return { success: true, content: `Selected: ${optionText}` }
  }

  return { success: false, error: 'Element is not a select/dropdown' }
}

// Find text and scroll to it (browser-use style)
function findAndScrollToText(text: string): { success: boolean; error?: string; content?: string } {
  if (!text) {
    return { success: false, error: 'No text provided' }
  }

  // Search through text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.textContent?.toLowerCase().includes(text.toLowerCase())) {
      const element = node.parentElement
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightElement(element)
        return { success: true, content: `Found and scrolled to: "${text}"` }
      }
    }
  }

  return { success: false, error: `Text "${text}" not found on page` }
}

// Extract content based on a query
function extractContent(query?: string): { success: boolean; content?: string } {
  // Get all visible text
  const pageText = extractVisibleText(document.body)

  if (query) {
    // Simple extraction - return page content with the query for LLM processing
    return {
      success: true,
      content: `Query: ${query}\n\nPage Content:\n${pageText}`,
    }
  }

  return { success: true, content: pageText }
}

// Currently highlighted element
let currentHighlight: { element: HTMLElement; originalOutline: string; originalOutlineOffset: string } | null = null

// Clear the current highlight
function clearHighlight(): void {
  if (currentHighlight) {
    currentHighlight.element.style.outline = currentHighlight.originalOutline
    currentHighlight.element.style.outlineOffset = currentHighlight.originalOutlineOffset
    currentHighlight = null
  }
}

// Highlight an element (for visual feedback)
export function highlightElement(element: Element | string, duration = 5000): void {
  // Clear any existing highlight
  clearHighlight()

  const el = typeof element === 'string' ? document.querySelector(element) : element
  if (el instanceof HTMLElement) {
    const originalOutline = el.style.outline
    const originalOutlineOffset = el.style.outlineOffset

    el.style.outline = '3px solid #e94560'
    el.style.outlineOffset = '2px'

    // Store for later clearing
    currentHighlight = { element: el, originalOutline, originalOutlineOffset }

    // Auto-clear after duration
    setTimeout(() => {
      if (currentHighlight?.element === el) {
        clearHighlight()
      }
    }, duration)
  }
}

// Clear highlight when user clicks elsewhere on the page
document.addEventListener('click', (e) => {
  if (currentHighlight && !currentHighlight.element.contains(e.target as Node)) {
    clearHighlight()
  }
}, true)

// Initialize content script
console.log('Surfi content script loaded (enhanced DOM extraction)')
