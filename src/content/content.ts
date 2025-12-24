// Content script - runs in the context of web pages

interface ActionRequest {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'extract'
  selector?: string
  value?: string
  url?: string
  direction?: 'up' | 'down'
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'GET_CONTEXT') {
    const context = getPageContext()
    sendResponse(context)
    return true
  }

  if (request.type === 'EXECUTE_ACTION') {
    executeAction(request.action)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true
  }
})

// Get page context for AI
function getPageContext() {
  const selectedText = window.getSelection()?.toString() || ''
  
  // Extract main content, excluding scripts, styles, and hidden elements
  const bodyText = extractVisibleText(document.body)
  
  // Get important elements for interaction
  const interactiveElements = getInteractiveElements()

  return {
    url: window.location.href,
    title: document.title,
    content: bodyText,
    selectedText,
    interactiveElements,
  }
}

// Extract visible text from an element
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

// Get interactive elements on the page
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
    const classes = element.className.trim().split(/\s+/).filter(c => c && !c.includes(':'))
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

// Execute an action on the page
async function executeAction(action: ActionRequest): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.type) {
      case 'click':
        return await clickElement(action.selector!)
      case 'type':
        return await typeInElement(action.selector!, action.value!)
      case 'scroll':
        return scrollPage(action.direction || 'down')
      case 'navigate':
        return navigateTo(action.url!)
      case 'extract':
        return extractContent(action.selector)
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

// Click on an element
async function clickElement(selector: string): Promise<{ success: boolean; error?: string }> {
  const element = document.querySelector(selector)
  if (!element) {
    return { success: false, error: `Element not found: ${selector}` }
  }

  // Highlight the element
  highlightElement(selector)

  // Scroll element into view
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  
  // Wait for scroll
  await new Promise((resolve) => setTimeout(resolve, 300))

  // Click the element
  if (element instanceof HTMLElement) {
    element.click()
    console.log(`[Browser AI] Clicked element: ${selector}`)
    
    // Wait for page to react to click (important for SPA navigation/data loading)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    
    return { success: true }
  }

  return { success: false, error: 'Element is not clickable' }
}

// Type text into an input element - multiple methods for maximum compatibility
async function typeInElement(
  selector: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  const element = document.querySelector(selector)
  if (!element) {
    return { success: false, error: `Element not found: ${selector}` }
  }

  // Highlight the element so user can see what's being interacted with
  highlightElement(selector)

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Focus the element first
    element.focus()
    element.select() // Select all existing text
    
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
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: char,
          bubbles: true,
          cancelable: true
        }))
        element.dispatchEvent(new KeyboardEvent('keypress', {
          key: char,
          bubbles: true,
          cancelable: true
        }))
        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: char,
          bubbles: true,
          cancelable: true
        }))
      }
    }
    
    // Also dispatch blur to trigger validation
    await new Promise(resolve => setTimeout(resolve, 100))
    element.dispatchEvent(new Event('blur', { bubbles: true }))
    
    console.log(`[Browser AI] Typed "${value}" into ${selector}, current value: "${element.value}"`)
    
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

// Scroll the page
function scrollPage(direction: 'up' | 'down'): { success: boolean } {
  const scrollAmount = window.innerHeight * 0.8
  window.scrollBy({
    top: direction === 'down' ? scrollAmount : -scrollAmount,
    behavior: 'smooth',
  })
  return { success: true }
}

// Navigate to a URL
function navigateTo(url: string): { success: boolean } {
  window.location.href = url
  return { success: true }
}

// Extract content from an element
function extractContent(selector?: string): { success: boolean; content?: string } {
  if (selector) {
    const element = document.querySelector(selector)
    if (element) {
      return { success: true, content: element.textContent || '' }
    }
    return { success: false }
  }
  
  return { success: true, content: extractVisibleText(document.body) }
}

// Highlight an element (for visual feedback)
export function highlightElement(selector: string, duration = 2000): void {
  const element = document.querySelector(selector)
  if (element instanceof HTMLElement) {
    const originalOutline = element.style.outline
    const originalOutlineOffset = element.style.outlineOffset
    
    element.style.outline = '3px solid #e94560'
    element.style.outlineOffset = '2px'
    
    setTimeout(() => {
      element.style.outline = originalOutline
      element.style.outlineOffset = originalOutlineOffset
    }, duration)
  }
}

// Initialize content script
console.log('Browser AI content script loaded')
