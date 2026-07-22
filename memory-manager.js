// ============================================================
// memory-manager.js — Gerenciador de Slots de Memória
// Implementa a arquitetura de slots especializados para controle
// de estado independente do modelo de IA
// ============================================================

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const MEMORY_FILE = path.join(process.cwd(), 'estado_agente.json');

// Definição dos slots e suas estruturas padrão
const SLOT_DEFINITIONS = {
  slot_usuario: {
    description: 'Informações sobre o usuário (preferências, contexto)',
    default: { preferencias: [], contexto: '', historico_interacoes: [] }
  },
  slot_tarefa: {
    description: 'Tarefa atual sendo executada',
    default: { titulo: '', descricao: '', status: 'inativa', criado_em: null }
  },
  slot_projeto: {
    description: 'Estado do projeto atual',
    default: { nome: '', tipo: '', status: 'nao_iniciado', criado_em: null }
  },
  slot_plano: {
    description: 'Plano detalhado dividido em etapas',
    default: { etapas: [], etapa_atual: 0, total_etapas: 0, criado_em: null }
  },
  slot_progresso: {
    description: 'Progresso geral e status de execução',
    default: { 
      projeto: '', 
      etapa_atual: 0, 
      total_etapas: 0, 
      status: 'parado', // parado, em_andamento, concluido, erro
      ultimo_update: null,
      percentual: 0
    }
  },
  slot_arquivos: {
    description: 'Arquivos envolvidos no projeto atual',
    default: { criados: [], modificados: [], pendentes: [], caminho_base: '' }
  },
  slot_erros: {
    description: 'Erros encontrados e tentativas de correção',
    default: { erros: [], tentativas_correcao: 0, ultimo_erro: null }
  },
  slot_decisoes: {
    description: 'Decisões tomadas durante a execução',
    default: { decisoes: [], justificativas: [] }
  }
};

class MemoryManager {
  constructor() {
    this.slots = {};
    this.load();
  }

  // Carrega estado da persistência ou inicializa
  load() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        this.slots = { ...this.getDefaultSlots(), ...data };
        logger.info('Estado do agente carregado com sucesso');
      } else {
        this.slots = this.getDefaultSlots();
        this.save();
        logger.info('Novo estado do agente inicializado');
      }
    } catch (error) {
      logger.error('Erro ao carregar estado do agente', { error: error.message });
      // Backup do arquivo corrompido
      if (fs.existsSync(MEMORY_FILE)) {
        try {
          fs.copyFileSync(MEMORY_FILE, `${MEMORY_FILE}.corrompido.${Date.now()}`);
        } catch {}
      }
      this.slots = this.getDefaultSlots();
      this.save();
    }
  }

  // Salva estado na persistência
  save() {
    try {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.slots, null, 2), 'utf-8');
      return true;
    } catch (error) {
      logger.error('Erro ao salvar estado do agente', { error: error.message });
      return false;
    }
  }

  // Retorna estrutura padrão de todos os slots
  getDefaultSlots() {
    const defaults = {};
    for (const [slotName, definition] of Object.entries(SLOT_DEFINITIONS)) {
      defaults[slotName] = JSON.parse(JSON.stringify(definition.default));
    }
    return defaults;
  }

  // Reseta todos os slots para o padrão
  reset() {
    this.slots = this.getDefaultSlots();
    this.save();
    logger.info('Todos os slots foram resetados');
  }

  // Lê um slot específico
  getSlot(slotName) {
    if (!SLOT_DEFINITIONS[slotName]) {
      logger.warn(`Tentativa de acessar slot inexistente: ${slotName}`);
      return null;
    }
    return this.slots[slotName];
  }

  // Atualiza um slot específico (merge parcial)
  updateSlot(slotName, data) {
    if (!SLOT_DEFINITIONS[slotName]) {
      logger.warn(`Tentativa de atualizar slot inexistente: ${slotName}`);
      return false;
    }
    
    this.slots[slotName] = { ...this.slots[slotName], ...data };
    
    // Atualiza timestamp se aplicável
    if (slotName === 'slot_progresso') {
      this.slots[slotName].ultimo_update = new Date().toISOString();
    }
    
    this.save();
    logger.debug(`Slot ${slotName} atualizado`, { data });
    return true;
  }

  // Substitui completamente um slot
  setSlot(slotName, data) {
    if (!SLOT_DEFINITIONS[slotName]) {
      logger.warn(`Tentativa de definir slot inexistente: ${slotName}`);
      return false;
    }
    
    this.slots[slotName] = data;
    this.save();
    logger.debug(`Slot ${slotName} definido completamente`);
    return true;
  }

  // Adiciona item a uma lista dentro de um slot
  addToSlotList(slotName, listKey, item) {
    const slot = this.getSlot(slotName);
    if (!slot || !Array.isArray(slot[listKey])) {
      logger.warn(`Lista ${listKey} não existe em ${slotName}`);
      return false;
    }
    
    slot[listKey].push(item);
    this.updateSlot(slotName, { [listKey]: slot[listKey] });
    return true;
  }

  // Avança para próxima etapa do plano
  avancarEtapa() {
    const plano = this.getSlot('slot_plano');
    const progresso = this.getSlot('slot_progresso');
    
    if (!plano || plano.etapas.length === 0) {
      return false;
    }
    
    const proximaEtapa = plano.etapa_atual + 1;
    
    if (proximaEtapa >= plano.total_etapas) {
      // Projeto concluído
      this.updateSlot('slot_progresso', {
        status: 'concluido',
        etapa_atual: plano.total_etapas,
        percentual: 100
      });
      return false; // Não há mais etapas
    }
    
    this.updateSlot('slot_plano', { etapa_atual: proximaEtapa });
    this.updateSlot('slot_progresso', {
      etapa_atual: proximaEtapa,
      status: 'em_andamento',
      percentual: Math.round((proximaEtapa / plano.total_etapas) * 100)
    });
    
    return true;
  }

  // Registra erro
  registrarErro(erro, contexto = '') {
    const erroData = {
      mensagem: erro.message || erro.toString(),
      contexto,
      timestamp: new Date().toISOString()
    };
    
    this.addToSlotList('slot_erros', 'erros', erroData);
    this.updateSlot('slot_erros', { 
      ultimo_erro: erroData,
      tentativas_correcao: this.getSlot('slot_erros').tentativas_correcao + 1
    });
    
    this.updateSlot('slot_progresso', { status: 'erro' });
    
    return true;
  }

  // Registra decisão
  registrarDecisao(decisao, justificativa = '') {
    this.addToSlotList('slot_decisoes', 'decisoes', {
      decisao,
      timestamp: new Date().toISOString()
    });
    
    if (justificativa) {
      this.addToSlotList('slot_decisoes', 'justificativas', {
        justificativa,
        timestamp: new Date().toISOString()
      });
    }
    
    return true;
  }

  // Marca arquivo como criado
  marcarArquivoCriado(caminho) {
    const arquivos = this.getSlot('slot_arquivos');
    if (!arquivos.criados.includes(caminho)) {
      arquivos.criados.push(caminho);
      this.updateSlot('slot_arquivos', { criados: arquivos.criados });
      
      // Remove de pendentes se existir
      const index = arquivos.pendentes.indexOf(caminho);
      if (index > -1) {
        arquivos.pendentes.splice(index, 1);
        this.updateSlot('slot_arquivos', { pendentes: arquivos.pendentes });
      }
    }
    return true;
  }

  // Define lista de arquivos pendentes
  definirArquivosPendentes(lista) {
    this.updateSlot('slot_arquivos', { pendentes: [...lista] });
    return true;
  }

  // Obtém resumo compacto do estado atual para o modelo
  getResumoEstado() {
    const progresso = this.getSlot('slot_progresso');
    const plano = this.getSlot('slot_plano');
    const projeto = this.getSlot('slot_projeto');
    const erros = this.getSlot('slot_erros');
    
    let resumo = `PROJETO: ${projeto.nome || 'Nenhum'}\n`;
    resumo += `STATUS: ${progresso.status}\n`;
    resumo += `ETAPA: ${progresso.etapa_atual}/${progresso.total_etapas} (${progresso.percentual}%)\n`;
    
    if (plano.etapas.length > 0 && plano.etapa_atual < plano.total_etapas) {
      resumo += `PRÓXIMA TAREFA: ${plano.etapas[plano.etapa_atual]}\n`;
    }
    
    if (erros.erros.length > 0) {
      resumo += `ERROS PENDENTES: ${erros.erros.slice(-2).map(e => e.mensagem).join('; ')}\n`;
    }
    
    return resumo;
  }

  // Verifica se há um projeto em andamento
  hasProjetoEmAndamento() {
    const progresso = this.getSlot('slot_progresso');
    return progresso.status === 'em_andamento' || progresso.status === 'erro';
  }

  // Restaura estado de um projeto interrompido
  restaurarProjetoInterrompido() {
    const progresso = this.getSlot('slot_progresso');
    const plano = this.getSlot('slot_plano');
    
    if (progresso.status === 'erro' || progresso.status === 'em_andamento') {
      // Recupera etapa atual
      if (plano.etapa_atual < plano.total_etapas) {
        this.updateSlot('slot_progresso', { 
          status: 'em_andamento',
          ultimo_update: new Date().toISOString()
        });
        return true;
      }
    }
    return false;
  }

  // Inicia novo projeto
  iniciarProjeto(nome, tipo, planoEtapas) {
    const agora = new Date().toISOString();
    
    this.setSlot('slot_projeto', {
      nome,
      tipo,
      status: 'em_andamento',
      criado_em: agora
    });
    
    this.setSlot('slot_plano', {
      etapas: [...planoEtapas],
      etapa_atual: 0,
      total_etapas: planoEtapas.length,
      criado_em: agora
    });
    
    this.setSlot('slot_progresso', {
      projeto: nome,
      etapa_atual: 0,
      total_etapas: planoEtapas.length,
      status: 'em_andamento',
      ultimo_update: agora,
      percentual: 0
    });
    
    this.setSlot('slot_arquivos', {
      criados: [],
      modificados: [],
      pendentes: [],
      caminho_base: ''
    });
    
    this.setSlot('slot_erros', {
      erros: [],
      tentativas_correcao: 0,
      ultimo_erro: null
    });
    
    this.setSlot('slot_decisoes', {
      decisoes: [],
      justificativas: []
    });
    
    this.save();
    logger.info(`Novo projeto iniciado: ${nome}`, { etapas: planoEtapas.length });
    return true;
  }

  // Finaliza projeto
  finalizarProjeto() {
    const projeto = this.getSlot('slot_projeto');
    this.updateSlot('slot_projeto', { status: 'concluido' });
    this.updateSlot('slot_progresso', { 
      status: 'concluido', 
      percentual: 100,
      ultimo_update: new Date().toISOString()
    });
    this.save();
    logger.info(`Projeto finalizado: ${projeto.nome}`);
    return true;
  }

  // Exporta estado para backup
  exportarEstado() {
    return JSON.stringify(this.slots, null, 2);
  }

  // Importa estado de backup
  importarEstado(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.slots = data;
      this.save();
      logger.info('Estado importado com sucesso');
      return true;
    } catch (error) {
      logger.error('Erro ao importar estado', { error: error.message });
      return false;
    }
  }
}

// Singleton
export const memoryManager = new MemoryManager();
