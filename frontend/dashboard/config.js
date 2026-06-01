window.COSMOBRASIL_API_BASE_URL = window.COSMOBRASIL_API_BASE_URL || (
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:3001'
    : 'https://backend-production-5b5cc.up.railway.app'
);
