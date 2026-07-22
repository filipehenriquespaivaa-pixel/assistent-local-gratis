// ============================================================
// logger.js — sistema de logs para debug e auditoria
// ============================================================
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOGS = 10;

// Garante que diretório de logs existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Níveis de log
const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const CURRENT_LEVEL = LEVELS.DEBUG;

// Cores para console
const colors = {
  ERROR: '\x1b[31m',
  WARN: '\x1b[33m',
  INFO: '\x1b[36m',
  DEBUG: '\x1b[90m',
  RESET: '\x1b[0m',
};

function getTimestamp() {
  return new Date().toISOString();
}

function rotateLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({ name: f, time: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > MAX_LOGS) {
      for (let i = MAX_LOGS; i < files.length; i++) {
        fs.unlinkSync(path.join(LOG_DIR, files[i].name));
      }
    }
  } catch (e) {
    console.error(`${colors.ERROR}[LOGGER] Erro ao rotacionar logs:${colors.RESET}`, e.message);
  }
}

function formatMessage(level, message, context = {}) {
  const timestamp = getTimestamp();
  const contextStr = Object.keys(context).length ? ` | ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level}]${contextStr} ${message}`;
}

function log(level, message, context = {}) {
  if (LEVELS[level] > CURRENT_LEVEL) return;

  const formattedMsg = formatMessage(level, message, context);
  const color = colors[level] || colors.RESET;

  // Console
  console.log(`${color}${formattedMsg}${colors.RESET}`);

  // Arquivo
  try {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(LOG_DIR, `agente-${date}.log`);

    // Rotacionar se necessário
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      if (stat.size > MAX_LOG_SIZE) {
        const backupName = `agente-${date}-${Date.now()}.log`;
        fs.renameSync(logFile, path.join(LOG_DIR, backupName));
        rotateLogs();
      }
    }

    fs.appendFileSync(logFile, formattedMsg + '\n', 'utf-8');
  } catch (e) {
    console.error(`${colors.ERROR}[LOGGER] Erro ao escrever log:${colors.RESET}`, e.message);
  }
}

export const logger = {
  error: (msg, ctx) => log('ERROR', msg, ctx),
  warn: (msg, ctx) => log('WARN', msg, ctx),
  info: (msg, ctx) => log('INFO', msg, ctx),
  debug: (msg, ctx) => log('DEBUG', msg, ctx),
  
  // Log de tool calls para auditoria
  toolCall: (toolName, args, result, duration) => {
    log('INFO', `Tool: ${toolName}`, { 
      tool: toolName, 
      args: JSON.stringify(args).substring(0, 200),
      result: typeof result === 'string' ? result.substring(0, 200) : result,
      duration_ms: duration 
    });
  },
  
  // Log de interações com LLM
  llmCall: (model, tokens, duration) => {
    log('DEBUG', `LLM: ${model}`, { model, tokens, duration_ms: duration });
  },
  
  // Log de erros de rede
  networkError: (url, error) => {
    log('ERROR', `Network error: ${url}`, { url, error: error.message });
  },
  
  // Log de sessão
  sessionStart: () => {
    log('INFO', '=== Nova sessão iniciada ===', { pid: process.pid });
  },
  
  sessionEnd: () => {
    log('INFO', '=== Sessão encerrada ===');
  },
};

export default logger;
