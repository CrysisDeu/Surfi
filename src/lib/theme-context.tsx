import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'surfi-theme'

// Get initial theme synchronously from localStorage to prevent flash
function getInitialTheme(): Theme {
  // Try localStorage first (synchronous)
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'light'  // Default to light theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  // Sync from chrome.storage on mount and listen for changes
  useEffect(() => {
    // Load from chrome.storage
    chrome.storage.sync.get(THEME_STORAGE_KEY, (result) => {
      const savedTheme = result[THEME_STORAGE_KEY] as Theme | undefined
      if (savedTheme && savedTheme !== theme) {
        setThemeState(savedTheme)
        localStorage.setItem(THEME_STORAGE_KEY, savedTheme)
        document.documentElement.setAttribute('data-theme', savedTheme)
      }
    })

    // Listen for changes from other tabs/windows (e.g., options page)
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'sync' && changes[THEME_STORAGE_KEY]) {
        const newTheme = changes[THEME_STORAGE_KEY].newValue as Theme
        if (newTheme && newTheme !== theme) {
          setThemeState(newTheme)
          localStorage.setItem(THEME_STORAGE_KEY, newTheme)
          document.documentElement.setAttribute('data-theme', newTheme)
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Apply theme to document when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    // Save to both localStorage (sync) and chrome.storage (persistent)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    chrome.storage.sync.set({ [THEME_STORAGE_KEY]: newTheme })
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
