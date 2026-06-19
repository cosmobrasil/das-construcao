// Logger estruturado com categorias e níveis
// Uso: log('API', 'INFO', 'Mensagem', { dado: 123 });

const CATEGORIES = {
  DB:     { prefix: '🗄️  [DB]',     color: '\x1b[36m' },
  CNPJ:   { prefix: '🔍 [CNPJ]',    color: '\x1b[33m' },
  AUTH:   { prefix: '🔐 [AUTH]',    color: '\x1b[35m' },
  API:    { prefix: '🌐 [API]',     color: '\x1b[32m' },
  SCHEMA: { prefix: '🧭 [SCHEMA]',  color: '\x1b[37m' },
  INIT:   { prefix: '🚀 [INIT]',    color: '\x1b[32m' },
  CORS:   { prefix: '🔒 [CORS]',    color: '\x1b[31m' },
  DASH:   { prefix: '📊 [DASH]',    color: '\x1b[34m' },
};

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const PAD = 5;

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(category, level, message, data) {
  const cat = CATEGORIES[category] || { prefix: `[${category}]`, color: '\x1b[0m' };
  const levelPadded = level.padEnd(PAD);
  const reset = '\x1b[0m';
  const ts = timestamp();

  if (data !== undefined) {
    console.log(`${ts} ${cat.color}${cat.prefix}${reset} ${levelPadded} ${message} ${JSON.stringify(data)}`);
  } else {
    console.log(`${ts} ${cat.color}${cat.prefix}${reset} ${levelPadded} ${message}`);
  }
}

module.exports = { log };
