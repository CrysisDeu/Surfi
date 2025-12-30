// Browser-use style browser tools
// Based on https://github.com/browser-use/browser-use

export interface BrowserTool {
  name: string
  description: string
  inputSchema: {
    type: string
    properties: Record<string, unknown>
    required: string[]
  }
}

// Tab Management Tools
export const tabTools: BrowserTool[] = [
  {
    name: 'switch_tab',
    description: 'Switch agent focus to a different browser tab. Use when you need to work with a tab shown in <open_tabs>.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: {
          type: 'integer',
          description: 'The tab ID shown in Tab[id] format in <open_tabs>',
        },
      },
      required: ['tab_id'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a browser tab. Use to close tabs you no longer need.',
    inputSchema: {
      type: 'object',
      properties: {
        tab_id: {
          type: 'integer',
          description: 'The tab ID shown in Tab[id] format in <open_tabs>',
        },
      },
      required: ['tab_id'],
    },
  },
]

// Basic Navigation Tools
export const navigationTools: BrowserTool[] = [
  {
    name: 'search',
    description: 'Search the web using a search engine. Use when you need to find information online.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        engine: {
          type: 'string',
          enum: ['google', 'duckduckgo', 'bing'],
          description: 'Search engine to use (default: google)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL. Use when you need to go to a specific webpage.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        new_tab: {
          type: 'boolean',
          description: 'Whether to open in a new tab (default: false)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'go_back',
    description: 'Go back to the previous page in browser history.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'wait',
    description: 'Wait for a specified number of seconds (max 30). Use when page needs time to load.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: {
          type: 'integer',
          description: 'Number of seconds to wait (default: 3, max: 30)',
        },
      },
      required: [],
    },
  },
]

// Element Interaction Tools
export const interactionTools: BrowserTool[] = [
  {
    name: 'click',
    description: 'Click on an element by its index number [id] shown in the DOM.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'The index number [id] of the element to click',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'input_text',
    description: 'Type text into an input element. By default clears existing text first.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'The index number [id] of the input element',
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
        clear: {
          type: 'boolean',
          description: 'Whether to clear existing text first (default: true)',
        },
      },
      required: ['index', 'text'],
    },
  },
  {
    name: 'scroll',
    description:
      'Scroll the page or a specific element. Use down=true to scroll down, down=false to scroll up. Use pages to control scroll amount (default: 1.0).',
    inputSchema: {
      type: 'object',
      properties: {
        down: {
          type: 'boolean',
          description: 'True to scroll down, false to scroll up (default: true)',
        },
        pages: {
          type: 'number',
          description: 'Number of pages to scroll (0.5-10.0, default: 1.0)',
        },
        index: {
          type: 'integer',
          description: 'Optional: index of scrollable element. If not provided, scrolls the page.',
        },
      },
      required: [],
    },
  },
  {
    name: 'send_keys',
    description:
      'Send keyboard keys. Use for shortcuts like "Enter", "Tab", "Escape", or combinations like "Control+a", "Control+c".',
    inputSchema: {
      type: 'object',
      properties: {
        keys: {
          type: 'string',
          description: 'Keys to send (e.g., "Enter", "Tab", "Control+a", "Shift+Tab")',
        },
      },
      required: ['keys'],
    },
  },
]

// Dropdown Tools
export const dropdownTools: BrowserTool[] = [
  {
    name: 'get_dropdown_options',
    description: 'Get all options from a dropdown/select element. Use before selecting an option.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'The index number [id] of the dropdown element',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'select_dropdown_option',
    description: 'Select an option from a dropdown by the option text.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'The index number [id] of the dropdown element',
        },
        text: {
          type: 'string',
          description: 'The text of the option to select',
        },
      },
      required: ['index', 'text'],
    },
  },
]

// Content Extraction Tools
export const extractionTools: BrowserTool[] = [
  {
    name: 'extract_content',
    description:
      'LLM extracts structured data from the current page markdown. Use when: (1) you are on the right page, (2) you know what to extract, (3) you haven\'t called this before on the same page+query, (4) the information is not visible in browser_state, or (5) you need structured extraction from the entire page including parts not currently visible. The extracted content is automatically saved and will appear in <extracted_data> section in all future prompts. IMPORTANT: Only call if the information is not already visible in browser_state - otherwise just read from browser_state directly. This tool is expensive - do not query the same page with the same query multiple times.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What structured information to extract from the page (e.g., "all product prices", "contact email", "list of articles with titles")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_text',
    description: 'Scroll to a specific text on the page. Use when you need to find and navigate to text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to find and scroll to',
        },
      },
      required: ['text'],
    },
  },
]

// Task Completion Tools
export const completionTools: BrowserTool[] = [
  {
    name: 'done',
    description:
      'Signal that the task is complete. Use when you have finished the requested task or cannot proceed further.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Summary of what was accomplished or why task cannot be completed',
        },
        success: {
          type: 'boolean',
          description: 'Whether the task was completed successfully (default: true)',
        },
      },
      required: ['text'],
    },
  },
]

// All browser tools combined
export const allBrowserTools: BrowserTool[] = [
  ...tabTools,
  ...navigationTools,
  ...interactionTools,
  ...dropdownTools,
  ...extractionTools,
  ...completionTools,
]
