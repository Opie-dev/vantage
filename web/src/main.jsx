import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'

import App from '@/App.jsx'
import { VantageProvider } from '@/lib/store'
import '@/index.css'

// storageKey must match the pre-paint script in index.html, or the theme flashes.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" storageKey="vantage.theme" enableSystem disableTransitionOnChange>
      <VantageProvider>
        <App />
      </VantageProvider>
    </ThemeProvider>
  </StrictMode>,
)
