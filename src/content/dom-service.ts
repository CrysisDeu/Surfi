/**
 * DOM Service - Extracts and serializes page content for AI consumption
 * Inspired by browser-use's approach: https://github.com/browser-use/browser-use
 */

// Elements to skip entirely
const DISABLED_ELEMENTS = new Set(['style', 'script', 'head', 'meta', 'link', 'title', 'noscript'])

// SVG internal elements (decorative, no interaction value)
const SVG_ELEMENTS = new Set([
  'path', 'rect', 'g', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'use', 'defs', 'clipPath', 'mask', 'pattern', 'image',
  'text', 'tspan', 'textPath', 'symbol', 'linearGradient', 'radialGradient'
])

// Attributes to include in serialization
const INCLUDE_ATTRIBUTES = [
  // Identification
  'id', 'name', 'class', 'type', 'role',
  // State
  'value', 'placeholder', 'checked', 'selected', 'disabled', 'readonly',
  // Accessibility
  'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded',
  'aria-selected', 'aria-checked', 'aria-disabled', 'aria-hidden',
  'aria-haspopup', 'aria-controls', 'title', 'alt',
  // Links
  'href', 'src',
  // Form
  'required', 'pattern', 'min', 'max', 'step', 'maxlength',
  // Data
  'data-testid', 'data-id', 'data-action'
]

// Elements that are inherently interactive
const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
  'audio', 'video', 'embed', 'object', 'iframe'
])

// Roles that indicate interactivity
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option',
  'switch', 'textbox', 'combobox', 'listbox', 'slider', 'spinbutton',
  'searchbox', 'menu', 'menubar', 'tablist', 'tree', 'grid'
])

export interface DOMNode {
  id: number // backend_node_id equivalent (we'll use a counter)
  tag: string
  attributes: Record<string, string>
  text: string
  isInteractive: boolean
  isVisible: boolean
  isScrollable: boolean
  bounds?: { x: number; y: number; width: number; height: number }
  children: DOMNode[]
}

export interface SerializedDOM {
  tree: string
  selectorMap: Map<number, Element>
  interactiveCount: number
  url: string
  title: string
}

let nodeIdCounter = 1
let selectorMap = new Map<number, Element>()

/**
 * Check if an element is visible in the viewport
 */
function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const style = window.getComputedStyle(el)

  // CSS visibility checks
  if (style.display === 'none') return false
  if (style.visibility === 'hidden') return false
  if (parseFloat(style.opacity) <= 0) return false

  // Size check (allow small elements like checkboxes)
  if (rect.width === 0 && rect.height === 0) return false

  // Special case: file inputs often have opacity:0 but are functional
  if (el.tagName.toLowerCase() === 'input' && (el as HTMLInputElement).type === 'file') {
    return rect.width > 0 || rect.height > 0
  }

  // Viewport intersection (with generous margin for scrollable content)
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const margin = 500 // Allow elements slightly outside viewport

  const inViewport =
    rect.bottom > -margin &&
    rect.top < viewportHeight + margin &&
    rect.right > -margin &&
    rect.left < viewportWidth + margin

  return inViewport
}

/**
 * Check if an element is interactive (clickable/typeable)
 */
function isElementInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role')

  // Tag-based interactivity
  if (INTERACTIVE_TAGS.has(tag)) return true

  // Role-based interactivity
  if (role && INTERACTIVE_ROLES.has(role)) return true

  // Event handlers
  const hasClickHandler =
    el.hasAttribute('onclick') ||
    el.hasAttribute('ng-click') ||
    el.hasAttribute('@click') ||
    el.hasAttribute('v-on:click')

  if (hasClickHandler) return true

  // Cursor style check
  const style = window.getComputedStyle(el)
  if (style.cursor === 'pointer') return true

  // contenteditable
  if (el.getAttribute('contenteditable') === 'true') return true

  // tabindex (explicitly focusable)
  const tabindex = el.getAttribute('tabindex')
  if (tabindex !== null && tabindex !== '-1') return true

  return false
}

/**
 * Check if an element is scrollable
 */
function isElementScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el)
  const hasOverflow = style.overflow === 'auto' || style.overflow === 'scroll' ||
                      style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                      style.overflowX === 'auto' || style.overflowX === 'scroll'

  if (!hasOverflow) return false

  return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

/**
 * Get text content from element (direct text only, not from children)
 */
function getDirectTextContent(el: Element): string {
  let text = ''
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      text += child.textContent.trim() + ' '
    }
  }
  return text.trim()
}

/**
 * Build attributes object for an element
 */
function buildAttributes(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {}

  for (const attrName of INCLUDE_ATTRIBUTES) {
    const value = el.getAttribute(attrName)
    if (value !== null && value.trim() !== '') {
      // Truncate long values
      attrs[attrName] = value.length > 100 ? value.slice(0, 97) + '...' : value
    }
  }

  // Add format hints for date/time inputs
  if (el.tagName.toLowerCase() === 'input') {
    const type = (el as HTMLInputElement).type
    const formatMap: Record<string, string> = {
      date: 'YYYY-MM-DD',
      time: 'HH:MM',
      'datetime-local': 'YYYY-MM-DDTHH:MM',
      month: 'YYYY-MM',
      week: 'YYYY-W##',
    }
    if (formatMap[type]) {
      attrs['format'] = formatMap[type]
    }

    // Include current value for form elements
    const input = el as HTMLInputElement
    if (input.value && !attrs['value']) {
      attrs['value'] = input.value.length > 100 ? input.value.slice(0, 97) + '...' : input.value
    }
  }

  // Include selected option text for select elements
  if (el.tagName.toLowerCase() === 'select') {
    const select = el as HTMLSelectElement
    if (select.selectedIndex >= 0) {
      const selectedOption = select.options[select.selectedIndex]
      if (selectedOption) {
        attrs['selected-text'] = selectedOption.text.slice(0, 50)
      }
    }
    // Include first few options as hint
    const optionTexts = Array.from(select.options)
      .slice(0, 4)
      .map(o => o.text.slice(0, 30))
    if (optionTexts.length > 0) {
      attrs['options'] = optionTexts.join(' | ')
      if (select.options.length > 4) {
        attrs['options'] += ` ... +${select.options.length - 4} more`
      }
    }
  }

  return attrs
}

/**
 * Generate a unique CSS selector for an element
 */
function generateSelector(el: Element): string {
  // Try ID first
  if (el.id) {
    return `#${CSS.escape(el.id)}`
  }

  // Try data-testid
  const testId = el.getAttribute('data-testid')
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`
  }

  // Try name attribute for form elements
  const name = el.getAttribute('name')
  if (name) {
    const tag = el.tagName.toLowerCase()
    return `${tag}[name="${CSS.escape(name)}"]`
  }

  // Build path-based selector
  const path: string[] = []
  let current: Element | null = el

  while (current && current !== document.body && path.length < 4) {
    let selector = current.tagName.toLowerCase()

    // Add distinguishing class if available
    const className = current.className
    if (typeof className === 'string' && className.trim()) {
      const firstClass = className.trim().split(/\s+/)[0]
      if (firstClass && !firstClass.includes(':') && !firstClass.startsWith('_')) {
        selector += '.' + CSS.escape(firstClass)
      }
    }

    // Add nth-child if needed
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        c => c.tagName === current!.tagName
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    path.unshift(selector)
    current = current.parentElement
  }

  return path.join(' > ')
}

/**
 * Build DOM tree recursively
 */
function buildDOMTree(el: Element, depth: number = 0): DOMNode | null {
  const tag = el.tagName.toLowerCase()

  // Skip disabled elements
  if (DISABLED_ELEMENTS.has(tag)) return null

  // Skip SVG internals (but keep the svg element itself)
  if (SVG_ELEMENTS.has(tag)) return null

  // Skip hidden elements (but check children for shadow DOM)
  const isVisible = isElementVisible(el)
  const isInteractive = isElementInteractive(el)
  const isScrollable = isElementScrollable(el)

  // Get bounds for visible elements
  let bounds: DOMNode['bounds'] | undefined
  if (isVisible) {
    const rect = el.getBoundingClientRect()
    bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  }

  // Build children first
  const children: DOMNode[] = []

  // Process shadow DOM
  if (el.shadowRoot) {
    for (const child of el.shadowRoot.children) {
      const childNode = buildDOMTree(child, depth + 1)
      if (childNode) children.push(childNode)
    }
  }

  // Process same-origin iframes (cross-origin blocked by browser security)
  if (tag === 'iframe') {
    try {
      const iframe = el as HTMLIFrameElement
      const iframeDoc = iframe.contentDocument
      if (iframeDoc && iframeDoc.body) {
        const iframeNode = buildDOMTree(iframeDoc.body, depth + 1)
        if (iframeNode) {
          // Mark iframe content with a wrapper
          children.push({
            id: 0,
            tag: '#iframe-content',
            attributes: { src: iframe.src || 'about:blank' },
            text: '',
            isInteractive: false,
            isVisible: true,
            isScrollable: false,
            children: iframeNode.children,
          })
        }
      }
    } catch {
      // Cross-origin iframe - cannot access content
      // This is expected for third-party iframes
    }
  }

  // Process regular children
  for (const child of el.children) {
    const childNode = buildDOMTree(child, depth + 1)
    if (childNode) children.push(childNode)
  }

  // Skip if not visible and no visible children
  if (!isVisible && !isInteractive && !isScrollable && children.length === 0) {
    return null
  }

  // Assign ID only to interactive/scrollable elements
  let nodeId = 0
  if ((isInteractive || isScrollable) && isVisible) {
    nodeId = nodeIdCounter++
    selectorMap.set(nodeId, el)
  }

  return {
    id: nodeId,
    tag,
    attributes: buildAttributes(el),
    text: getDirectTextContent(el),
    isInteractive,
    isVisible,
    isScrollable,
    bounds,
    children,
  }
}

/**
 * Serialize DOM tree to text format for LLM
 */
function serializeTree(node: DOMNode, depth: number = 0): string {
  const indent = '\t'.repeat(depth)
  const lines: string[] = []

  // Build element representation
  if (node.id > 0 || node.isScrollable || node.tag === 'svg') {
    let prefix = ''

    if (node.isScrollable && node.id === 0) {
      prefix = '|SCROLL|'
    } else if (node.id > 0) {
      prefix = node.isScrollable ? `|SCROLL[${node.id}]` : `[${node.id}]`
    }

    let line = `${indent}${prefix}<${node.tag}`

    // Add attributes
    const attrParts: string[] = []
    for (const [key, value] of Object.entries(node.attributes)) {
      attrParts.push(`${key}=${value}`)
    }
    if (attrParts.length > 0) {
      line += ' ' + attrParts.join(' ')
    }

    line += ' />'

    // Add text content if short
    if (node.text && node.text.length > 0 && node.text.length < 100) {
      line += ` "${node.text}"`
    }

    lines.push(line)
  }

  // Add text content for non-interactive elements
  if (node.id === 0 && !node.isScrollable && node.text && node.text.length > 0) {
    const truncatedText = node.text.length > 200 ? node.text.slice(0, 197) + '...' : node.text
    lines.push(`${indent}${truncatedText}`)
  }

  // Serialize children
  const childDepth = node.id > 0 || node.isScrollable ? depth + 1 : depth
  for (const child of node.children) {
    const childText = serializeTree(child, childDepth)
    if (childText) lines.push(childText)
  }

  return lines.join('\n')
}

/**
 * Main function to extract and serialize DOM
 */
export function extractDOM(): SerializedDOM {
  // Reset state
  nodeIdCounter = 1
  selectorMap = new Map()

  // Build tree from body
  const tree = buildDOMTree(document.body)
  const serialized = tree ? serializeTree(tree) : ''

  return {
    tree: serialized,
    selectorMap,
    interactiveCount: nodeIdCounter - 1,
    url: window.location.href,
    title: document.title,
  }
}

/**
 * Get element by node ID
 */
export function getElementByNodeId(nodeId: number): Element | undefined {
  return selectorMap.get(nodeId)
}

/**
 * Generate selector map export (for actions)
 */
export function getSelectorMap(): Array<{ id: number; selector: string; tag: string; text: string }> {
  const result: Array<{ id: number; selector: string; tag: string; text: string }> = []

  for (const [id, el] of selectorMap.entries()) {
    result.push({
      id,
      selector: generateSelector(el),
      tag: el.tagName.toLowerCase(),
      text: getDirectTextContent(el).slice(0, 50),
    })
  }

  return result
}
