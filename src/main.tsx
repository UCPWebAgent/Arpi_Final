import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.f7'
import 'framework7/css/bundle'
import 'framework7-icons'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
