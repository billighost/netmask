import './bridge'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MiniApp } from './MiniApp'
import './styles/base.css'
import './styles/icons.css'

const mini = new URLSearchParams(window.location.search).get('view') === 'mini'
if (mini) document.documentElement.setAttribute('data-mini', '')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mini ? <MiniApp /> : <App />}
  </React.StrictMode>
)
