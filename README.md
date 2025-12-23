# Browser AI 🤖

A Chrome extension AI Agent that helps you interact with web pages using custom AI models.

## Features

- **Chat Sidebar**: Conversational AI interface in Chrome's side panel
- **Page Context**: AI can read and understand the current page content
- **Page Actions**: AI can execute actions like clicking, typing, scrolling
- **Custom Models**: Support for OpenAI, Anthropic, Ollama, and any OpenAI-compatible API
- **Multiple Configurations**: Save and switch between different AI model configurations

## Project Structure

```
browserAI/
├── manifest.json           # Chrome extension manifest (V3)
├── vite.config.ts          # Vite + CRXJS configuration
├── package.json
├── tsconfig.json
│
├── src/
│   ├── sidepanel/          # Chat sidebar UI (React)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── components/
│   │       ├── ChatMessage.tsx
│   │       ├── ChatInput.tsx
│   │       └── Header.tsx
│   │
│   ├── background/         # Service worker
│   │   └── service-worker.ts
│   │
│   ├── content/            # Content script
│   │   └── content.ts
│   │
│   ├── options/            # Settings page (React)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   │
│   ├── lib/                # Shared utilities
│   │   ├── storage.ts
│   │   └── messaging.ts
│   │
│   └── types/              # TypeScript types
│       └── index.ts
│
└── public/
    └── icons/              # Extension icons
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Chrome browser

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Load the extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

4. **Configure your AI model:**
   - Click the extension icon in Chrome
   - Click the settings (gear) icon
   - Add your API key and configure your preferred model

### Development

The extension uses Vite with the CRXJS plugin for **automatic hot module replacement (HMR)**. 

#### How Hot Reload Works

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Load extension ONCE:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select the `dist` folder

3. **That's it!** Now when you edit code:
   - **Side panel & Options page**: Changes appear instantly (true HMR)
   - **Content scripts**: Page auto-refreshes
   - **Background worker**: Extension auto-reloads
   - **manifest.json changes**: Extension auto-reloads

#### No Manual Reload Needed!

Unlike traditional extension development, you **don't need to**:
- Click "Reload" in `chrome://extensions/`
- Manually refresh pages
- Restart the browser

The CRXJS Vite plugin handles all of this automatically.

#### Development Tips

```bash
# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Type check only
npx tsc --noEmit
```

#### Debugging

- **Side panel console**: Right-click side panel → "Inspect"
- **Background worker**: Click "Service Worker" link in `chrome://extensions/`
- **Content script**: Regular browser DevTools (F12) → Console

#### If HMR Stops Working

Sometimes the WebSocket connection drops. Quick fixes:
1. Refresh the page you're testing on
2. Close and reopen the side panel
3. If still broken: Reload extension in `chrome://extensions/`

## Configuration

### Supported Providers

1. **OpenAI**
   - Endpoint: `https://api.openai.com/v1/chat/completions`
   - Models: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`

2. **Anthropic**
   - Endpoint: `https://api.anthropic.com/v1/messages`
   - Models: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`

3. **Ollama (Local)**
   - Endpoint: `http://localhost:11434/v1/chat/completions`
   - Models: `llama2`, `mistral`, `codellama`, etc.

4. **Custom (OpenAI-compatible)**
   - Any API that follows the OpenAI chat completions format

### Adding a Custom Model

1. Go to extension settings
2. Click "Add Model" or use a preset
3. Configure:
   - **Name**: Display name for the model
   - **Provider**: Select provider type
   - **API Endpoint**: Full URL to the chat completions endpoint
   - **API Key**: Your API key (stored securely in Chrome storage)
   - **Model ID**: The model identifier (e.g., `gpt-4`)
   - **Max Tokens**: Maximum response length
   - **Temperature**: Creativity level (0-2)

## Usage

1. **Open the sidebar**: Click the Browser AI icon in your toolbar
2. **Start chatting**: Ask questions about the current page
3. **Execute actions**: Ask the AI to click, type, or navigate

### Example Prompts

- "Summarize this page"
- "Find the contact information on this page"
- "Click the login button"
- "Fill in the search box with 'AI tools'"
- "What products are listed on this page?"

## Security Notes

- API keys are stored in Chrome's sync storage (encrypted)
- Content scripts only run on pages you visit
- All API calls are made from the background service worker
- No data is sent to third parties except your configured AI provider

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Extension not loading
- Make sure you've run `npm run dev` or `npm run build`
- Check that you're loading the `dist` folder
- Look for errors in `chrome://extensions/`

### API errors
- Verify your API key is correct
- Check the API endpoint URL
- Ensure you have credits/quota with your provider

### Side panel not opening
- Make sure the extension has the `sidePanel` permission
- Try reloading the extension
- Check Chrome version (requires Chrome 114+)
