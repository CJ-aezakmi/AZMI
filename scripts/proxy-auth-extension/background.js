// Credentials будут переданы через process.env
const PROXY_USERNAME = process.env.PROXY_USERNAME || '';
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || '';

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    console.log('[PROXY-AUTH] Запрос авторизации от:', details.challenger.host);
    
    if (PROXY_USERNAME && PROXY_PASSWORD) {
      callback({
        authCredentials: {
          username: PROXY_USERNAME,
          password: PROXY_PASSWORD
        }
      });
    } else {
      callback({});
    }
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

console.log('[PROXY-AUTH] Расширение загружено');
