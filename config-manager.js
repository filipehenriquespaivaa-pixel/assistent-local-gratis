// ============================================================
// config-manager.js — gerencia múltiplos perfis de configuração
// ============================================================
import fs from 'fs';
import path from 'path';

const CONFIGS_DIR = path.join(process.cwd(), 'configs');
const DEFAULT_CONFIG_FILE = path.join(process.cwd(), 'config.json');

// Garante que diretório de configs existe
if (!fs.existsSync(CONFIGS_DIR)) {
  fs.mkdirSync(CONFIGS_DIR, { recursive: true });
}

// Valida estrutura básica de config
function validarConfig(config) {
  const errors = [];
  if (!config.lmStudioUrl) errors.push('lmStudioUrl é obrigatório');
  if (!config.model) errors.push('model é obrigatório');
  if (!config.workspace) errors.push('workspace é obrigatório');
  
  // Valida URL
  if (config.lmStudioUrl && !/^https?:\/\//.test(config.lmStudioUrl)) {
    errors.push('lmStudioUrl deve começar com http:// ou https://');
  }
  
  return errors;
}

// Carrega um perfil específico
export function loadProfile(profileName) {
  if (profileName === 'default' || profileName === null) {
    if (fs.existsSync(DEFAULT_CONFIG_FILE)) {
      try {
        const config = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8'));
        const errors = validarConfig(config);
        if (errors.length > 0) {
          throw new Error(`Configuração inválida: ${errors.join(', ')}`);
        }
        return { name: 'default', config };
      } catch (e) {
        throw new Error(`Erro ao carregar config padrão: ${e.message}`);
      }
    }
    return null;
  }
  
  const profilePath = path.join(CONFIGS_DIR, `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Perfil "${profileName}" não encontrado em ${profilePath}`);
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    const errors = validarConfig(config);
    if (errors.length > 0) {
      throw new Error(`Configuração inválida: ${errors.join(', ')}`);
    }
    return { name: profileName, config };
  } catch (e) {
    throw new Error(`Erro ao carregar perfil "${profileName}": ${e.message}`);
  }
}

// Salva um perfil
export function saveProfile(profileName, config) {
  const errors = validarConfig(config);
  if (errors.length > 0) {
    throw new Error(`Não foi possível salvar: ${errors.join(', ')}`);
  }
  
  if (profileName === 'default') {
    fs.writeFileSync(DEFAULT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  }
  
  const profilePath = path.join(CONFIGS_DIR, `${profileName}.json`);
  fs.writeFileSync(profilePath, JSON.stringify(config, null, 2), 'utf-8');
  return true;
}

// Lista todos os perfis disponíveis
export function listProfiles() {
  const profiles = ['default'];
  
  if (fs.existsSync(CONFIGS_DIR)) {
    const files = fs.readdirSync(CONFIGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    profiles.push(...files.filter(p => p !== 'default'));
  }
  
  return profiles;
}

// Deleta um perfil (exceto default)
export function deleteProfile(profileName) {
  if (profileName === 'default') {
    throw new Error('Não é possível deletar o perfil default');
  }
  
  const profilePath = path.join(CONFIGS_DIR, `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Perfil "${profileName}" não encontrado`);
  }
  
  fs.unlinkSync(profilePath);
  return true;
}

// Cria template de novo perfil
export function createProfileTemplate(profileName, baseProfile = 'default') {
  const base = loadProfile(baseProfile);
  if (!base) {
    throw new Error(`Perfil base "${baseProfile}" não encontrado`);
  }
  
  const template = {
    ...base.config,
    _comment: `Perfil: ${profileName} - editado em ${new Date().toISOString()}`,
  };
  
  saveProfile(profileName, template);
  return template;
}

// Exporta função auxiliar para uso direto
export function getConfig(profileName = null) {
  const profile = loadProfile(profileName);
  if (!profile) return null;
  return profile.config;
}

// Templates pré-definidos
export const TEMPLATES = {
  development: {
    lmStudioUrl: 'http://127.0.0.1:1234',
    model: 'local-model',
    workspace: './workspace-dev',
    maxTokens: 4096,
    temperature: 0.7,
  },
  production: {
    lmStudioUrl: 'http://production-server:1234',
    model: 'production-model',
    workspace: '/var/www/app',
    maxTokens: 2048,
    temperature: 0.3,
  },
  testing: {
    lmStudioUrl: 'http://localhost:1234',
    model: 'test-model',
    workspace: './workspace-test',
    maxTokens: 1024,
    temperature: 0.9,
  },
};

// Cria todos os templates
export function initializeTemplates() {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    if (!fs.existsSync(path.join(CONFIGS_DIR, `${name}.json`))) {
      saveProfile(name, template);
    }
  }
  return Object.keys(TEMPLATES);
}

export default {
  loadProfile,
  saveProfile,
  listProfiles,
  deleteProfile,
  createProfileTemplate,
  getConfig,
  initializeTemplates,
  TEMPLATES,
};
