import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import 'flag-icons/css/flag-icons.min.css'

// Временная глобальная функция для отключения аккаунта Proxys.io (для записи видео)
(window as any).proxysLogout = () => {
  localStorage.removeItem('proxys_api_key');
  localStorage.removeItem('proxys_order_meta');
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)