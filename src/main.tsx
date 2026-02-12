import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'

// Временная глобальная функция для выхода из SX.ORG (для записи видео)
(window as any).sxorgLogout = () => {
  localStorage.removeItem('sxorg_api_key');
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)