// ============================================================
// interpretador.js — Módulo de Interpretação de Pedidos
// Analisa pedidos complexos e divide em etapas executáveis
// Salva o planejamento em arquivo JSON para auditoria
// ============================================================

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const ARQUIVO_PLANEJAMENTO = path.join(process.cwd(), 'planejamento.json');

// Padrões de detecção de tipo de tarefa
const PADROES_TAREFA = {
  escrita: {
    palavras_chave: ['história', 'história', 'conto', 'roteiro', 'texto', 'narrativa', 'livro', 'capítulo'],
    acoes_tipicas: ['criar', 'escrever', 'desenvolver', 'elaborar', 'produzir'],
    saida_padrao: 'arquivo_texto',
    extensoes: ['.txt', '.md', '.doc']
  },
  programacao: {
    palavras_chave: ['código', 'programa', 'site', 'jogo', 'app', 'sistema', 'html', 'javascript', 'python'],
    acoes_tipicas: ['criar', 'desenvolver', 'implementar', 'codificar', 'programar'],
    saida_padrao: 'arquivo_codigo',
    extensoes: ['.html', '.js', '.py', '.css', '.json']
  },
  pesquisa: {
    palavras_chave: ['pesquisar', 'buscar', 'investigar', 'procurar', 'encontrar'],
    acoes_tipicas: ['buscar', 'pesquisar', 'coletar', 'analisar'],
    saida_padrao: 'relatorio',
    extensoes: ['.txt', '.md']
  },
  organizacao: {
    palavras_chave: ['organizar', 'estruturar', 'criar pasta', 'diretório', 'arquivos'],
    acoes_tipicas: ['criar', 'mover', 'organizar', 'estruturar'],
    saida_padrao: 'estrutura_pastas',
    extensoes: []
  }
};

// Detecta o tipo principal do pedido
function detectarTipoPedido(texto) {
  const textoLower = texto.toLowerCase();
  
  for (const [tipo, padrao] of Object.entries(PADROES_TAREFA)) {
    for (const palavra of padrao.palavras_chave) {
      if (textoLower.includes(palavra)) {
        return tipo;
      }
    }
  }
  
  return 'geral';
}

// Extrai informações sobre local/arquivo de destino
function extrairDestino(texto) {
  const textoLower = texto.toLowerCase();
  
  // Padrões específicos para caminhos do Windows (ex: D:\pasta, C:\users\...)
  const padraoWindows = /([a-zA-Z]:\\[a-zA-Z0-9_\-\\\s]+)/i;
  const matchWindows = texto.match(padraoWindows);
  if (matchWindows && matchWindows[1]) {
    return matchWindows[1].trim();
  }
  
  // Padrões para caminhos Unix/Linux (ex: /home/user/, ./pasta/)
  const padraoUnix = /(\/[a-zA-Z0-9_\-\/]+)/i;
  const matchUnix = texto.match(padraoUnix);
  if (matchUnix && matchUnix[1]) {
    return matchUnix[1].trim();
  }
  
  // Padrões genéricos para "na pasta X", "no local X", etc.
  const padroesDestino = [
    /na\s+pasta\s+([a-zA-Z0-9_\-\/]+)/i,
    /no\s+local\s+([a-zA-Z0-9_\-\/]+)/i,
    /no\s+diret[oó]rio\s+([a-zA-Z0-9_\-\/]+)/i,
    /salvar\s+em\s+([a-zA-Z0-9_\-\/]+)/i,
    /diret[oó]rio[:\s]+([a-zA-Z0-9_\-\/]+)/i,
    /pasta[:\s]+([a-zA-Z0-9_\-\/]+)/i,
    /em\s+([a-zA-Z0-9_\-\.\\/\s]+)/i  // Mais permissivo para capturar nomes de pastas
  ];
  
  for (const padrao of padroesDestino) {
    const match = texto.match(padrao);
    if (match && match[1]) {
      const destino = match[1].trim();
      // Evita capturar palavras que são idiomas ou formatos
      if (!['português', 'portugues', 'inglês', 'ingles', 'espanhol', 'html', 'python', 'javascript'].includes(destino.toLowerCase())) {
        return destino;
      }
    }
  }
  
  return null;
}

// Extrai preferências do pedido
function extrairPreferencias(texto) {
  const preferencias = [];
  const textoLower = texto.toLowerCase();
  
  // Detecta preferências de simplicidade
  if (/simples|básico|basico|facil|fácil/.test(textoLower)) {
    preferencias.push('simplicidade');
  }
  
  // Detecta preferências de formato
  if (/html|web|site/.test(textoLower)) {
    preferencias.push('formato_html');
  } else if (/python|script py/.test(textoLower)) {
    preferencias.push('formato_python');
  } else if (/javascript|js/.test(textoLower)) {
    preferencias.push('formato_javascript');
  }
  
  // Detecta preferências de tamanho
  if (/curto|pequeno|breve/.test(textoLower)) {
    preferencias.push('tamanho_curto');
  } else if (/longo|grande|detalhado|completo/.test(textoLower)) {
    preferencias.push('tamanho_longo');
  }
  
  // Detecta idioma - verifica se é mencionado como requisito, não como destino
  if (/\bportugu[êe]s\b|\bpt-br\b|\bbrasileiro\b/.test(textoLower)) {
    preferencias.push('idioma_portugues');
  } else if (/\bingl[eê]s\b|\benglish\b/.test(textoLower)) {
    preferencias.push('idioma_ingles');
  }
  
  return preferencias;
}

// Divide o pedido em etapas lógicas
function dividirEmEtapas(tipoPedido, texto, destino, preferencias) {
  const etapas = [];
  
  // Etapa 1: Sempre começa com análise/entendimento
  etapas.push({
    id: 1,
    tipo: 'analise',
    descricao: 'Analisar e entender o pedido do usuário',
    acao_especifica: 'Interpretar requisitos e identificar elementos chave',
    criterio_sucesso: 'Compreensão clara do que deve ser produzido',
    obrigatoria: true
  });
  
  // Etapa 2: Criação/Produção baseada no tipo
  let etapaCriacao = null;
  
  if (tipoPedido === 'escrita') {
    etapaCriacao = {
      id: 2,
      tipo: 'criacao',
      subtipo: 'texto',
      descricao: 'Criar o conteúdo textual solicitado',
      acao_especifica: 'Escrever história/texto conforme especificações',
      criterios_sucesso: [
        'Possuir início, meio e fim',
        'Apresentar personagens e contexto',
        'Seguir preferências de estilo'
      ],
      obrigatoria: true
    };
  } else if (tipoPedido === 'programacao') {
    etapaCriacao = {
      id: 2,
      tipo: 'criacao',
      subtipo: 'codigo',
      descricao: 'Desenvolver o código/programa solicitado',
      acao_especifica: 'Implementar funcionalidades requeridas',
      criterios_sucesso: [
        'Código funcional e executável',
        'Seguir boas práticas da linguagem',
        'Incluir comentários explicativos'
      ],
      obrigatoria: true
    };
  } else if (tipoPedido === 'pesquisa') {
    etapaCriacao = {
      id: 2,
      tipo: 'pesquisa',
      descricao: 'Realizar pesquisa e coletar informações',
      acao_especifica: 'Buscar fontes relevantes e compilar dados',
      criterios_sucesso: [
        'Fontes confiáveis',
        'Informações relevantes',
        'Dados organizados'
      ],
      obrigatoria: true
    };
  } else if (tipoPedido === 'organizacao') {
    etapaCriacao = {
      id: 2,
      tipo: 'organizacao',
      descricao: 'Criar estrutura de pastas/arquivos',
      acao_especifica: 'Organizar diretórios conforme necessário',
      criterios_sucesso: [
        'Estrutura lógica',
        'Nomes claros',
        'Hierarquia adequada'
      ],
      obrigatoria: true
    };
  }
  
  if (etapaCriacao) {
    etapas.push(etapaCriacao);
  }
  
  // Etapa 3: Salvamento (se houver destino especificado ou se for criação)
  if (destino || etapaCriacao) {
    etapas.push({
      id: etapas.length + 1,
      tipo: 'salvamento',
      descricao: destino 
        ? `Salvar resultado no destino: ${destino}`
        : 'Salvar resultado em arquivo apropriado',
      acao_especifica: destino
        ? `Criar/editar arquivo em ${destino}`
        : 'Determinar nome e local adequados para salvamento',
      destino_sugerido: destino,
      criterios_sucesso: [
        'Arquivo salvo corretamente',
        'Local acessível',
        'Nome descritivo'
      ],
      obrigatoria: Boolean(destino || etapaCriacao)
    });
  }
  
  // Etapa 4: Validação (sempre incluída)
  etapas.push({
    id: etapas.length + 1,
    tipo: 'validacao',
    descricao: 'Validar se o resultado atende ao pedido original',
    acao_especifica: 'Revisar produto final comparando com requisitos',
    criterios_sucesso: [
      'Todos os requisitos atendidos',
      'Qualidade adequada',
      'Sem erros óbvios'
    ],
    obrigatoria: true
  });
  
  return etapas;
}

// Identifica arquivos prováveis que serão criados
function preverArquivos(tipoPedido, destino, preferencias) {
  const arquivos = [];
  let extensaoSugerida = '.txt';
  
  if (tipoPedido === 'programacao') {
    if (preferencias.includes('formato_html')) extensaoSugerida = '.html';
    else if (preferencias.includes('formato_python')) extensaoSugerida = '.py';
    else if (preferencias.includes('formato_javascript')) extensaoSugerida = '.js';
    else extensaoSugerida = '.html';
  } else if (tipoPedido === 'escrita') {
    extensaoSugerida = preferencias.includes('formato_html') ? '.md' : '.txt';
  }
  
  const nomeBase = destino ? path.basename(destino) : 'resultado';
  const diretorio = destino && path.dirname(destino) !== '.' ? destino : null;
  
  arquivos.push({
    caminho_sugerido: diretorio 
      ? path.join(diretorio, `${nomeBase}${extensaoSugerida}`)
      : `${nomeBase}${extensaoSugerida}`,
    tipo: tipoPedido,
    descricao: 'Arquivo principal com o resultado'
  });
  
  return arquivos;
}

// Gera o planejamento completo
export function interpretarPedido(pedido) {
  const timestamp = new Date().toISOString();
  
  // Análise inicial
  const tipoPedido = detectarTipoPedido(pedido);
  const destino = extrairDestino(pedido);
  const preferencias = extrairPreferencias(pedido);
  
  // Divisão em etapas
  const etapas = dividirEmEtapas(tipoPedido, pedido, destino, preferencias);
  
  // Previsão de arquivos
  const arquivosPrevistos = preverArquivos(tipoPedido, destino, preferencias);
  
  // Estrutura completa do planejamento
  const planejamento = {
    metadata: {
      id: `planejamento_${Date.now()}`,
      timestamp_criacao: timestamp,
      versao: '1.0'
    },
    pedido_original: pedido,
    interpretacao: {
      tipo_identificado: tipoPedido,
      destino_identificado: destino,
      preferencias_detectadas: preferencias,
      resumo: `Pedido do tipo "${tipoPedido}"${destino ? ` com destino em "${destino}"` : ''}`
    },
    divisao_etapas: {
      total_etapas: etapas.length,
      etapas_obrigatorias: etapas.filter(e => e.obrigatoria).length,
      etapas: etapas
    },
    arquivos_previstos: arquivosPrevistos,
    estimativa_complexidade: calcularComplexidade(etapas, tipoPedido),
    status: 'planejado',
    execucao: {
      etapa_atual: 0,
      concluido: false,
      historico: []
    }
  };
  
  return planejamento;
}

// Calcula estimativa de complexidade
function calcularComplexidade(etapas, tipoPedido) {
  let pontuacao = 0;
  
  // Base por tipo
  if (tipoPedido === 'programacao') pontuacao += 3;
  else if (tipoPedido === 'escrita') pontuacao += 2;
  else pontuacao += 1;
  
  // Adiciona por número de etapas
  pontuacao += etapas.length;
  
  // Classifica
  if (pontuacao <= 4) return 'baixa';
  if (pontuacao <= 7) return 'media';
  return 'alta';
}

// Salva planejamento em arquivo
export function salvarPlanejamento(planejamento, caminhoArquivo = null) {
  const caminhoFinal = caminhoArquivo || ARQUIVO_PLANEJAMENTO;
  
  try {
    // Se já existe, carrega e adiciona este como histórico
    let historico = [];
    if (fs.existsSync(caminhoFinal)) {
      try {
        const existente = JSON.parse(fs.readFileSync(caminhoFinal, 'utf-8'));
        if (existente.historico && Array.isArray(existente.historico)) {
          historico = existente.historico;
        }
      } catch {
        // Arquivo corrompido, começa do zero
        historico = [];
      }
    }
    
    // Adiciona novo planejamento ao histórico
    historico.unshift(planejamento);
    
    // Mantém apenas os últimos 50 planejamentos
    if (historico.length > 50) {
      historico = historico.slice(0, 50);
    }
    
    const dadosParaSalvar = {
      ultimo_planejamento: planejamento,
      total_planejamentos: historico.length,
      historico: historico
    };
    
    fs.writeFileSync(caminhoFinal, JSON.stringify(dadosParaSalvar, null, 2), 'utf-8');
    logger.info('Planejamento salvo com sucesso', { caminho: caminhoFinal });
    
    return {
      sucesso: true,
      caminho: caminhoFinal,
      mensagem: `Planejamento salvo em ${caminhoFinal}`
    };
  } catch (error) {
    logger.error('Erro ao salvar planejamento', { error: error.message });
    return {
      sucesso: false,
      erro: error.message,
      mensagem: 'Falha ao salvar planejamento'
    };
  }
}

// Carrega planejamentos anteriores
export function carregarPlanejamentos(caminhoArquivo = null) {
  const caminho = caminhoArquivo || ARQUIVO_PLANEJAMENTO;
  
  try {
    if (!fs.existsSync(caminho)) {
      return {
        sucesso: true,
        mensagem: 'Nenhum planejamento encontrado',
        historico: [],
        ultimo: null
      };
    }
    
    const dados = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
    return {
      sucesso: true,
      mensagem: `${dados.historico?.length || 0} planejamento(s) encontrado(s)`,
      historico: dados.historico || [],
      ultimo: dados.ultimo_planejamento || null
    };
  } catch (error) {
    logger.error('Erro ao carregar planejamentos', { error: error.message });
    return {
      sucesso: false,
      erro: error.message,
      historico: [],
      ultimo: null
    };
  }
}

// Atualiza status de execução de um planejamento
export function atualizarExecucao(idPlanejamento, dadosExecucao) {
  const carregados = carregarPlanejamentos();
  
  if (!carregados.sucesso || !carregados.historico) {
    return { sucesso: false, mensagem: 'Planejamento não encontrado' };
  }
  
  const index = carregados.historico.findIndex(p => p.metadata.id === idPlanejamento);
  
  if (index === -1) {
    return { sucesso: false, mensagem: 'Planejamento não encontrado' };
  }
  
  // Atualiza execução
  carregados.historico[index].execucao = {
    ...carregados.historico[index].execucao,
    ...dadosExecucao,
    ultima_atualizacao: new Date().toISOString()
  };
  
  // Atualiza último também
  if (index === 0) {
    carregados.ultimo_planejamento = carregados.historico[0];
  }
  
  // Salva
  fs.writeFileSync(ARQUIVO_PLANEJAMENTO, JSON.stringify(carregados, null, 2), 'utf-8');
  
  return {
    sucesso: true,
    mensagem: 'Execução atualizada com sucesso'
  };
}

// Formata planejamento para exibição humana
export function formatarPlanejamentoTexto(planejamento) {
  let texto = `\n${'='.repeat(60)}\n`;
  texto += `PLANEJAMENTO: ${planejamento.metadata.id}\n`;
  texto += `${'='.repeat(60)}\n\n`;
  
  texto += `PEDIDO ORIGINAL:\n  ${planejamento.pedido_original}\n\n`;
  
  texto += `INTERPRETAÇÃO:\n`;
  texto += `  Tipo: ${planejamento.interpretacao.tipo_identificado}\n`;
  texto += `  Resumo: ${planejamento.interpretacao.resumo}\n`;
  if (planejamento.interpretacao.destino_identificado) {
    texto += `  Destino: ${planejamento.interpretacao.destino_identificado}\n`;
  }
  if (planejamento.interpretacao.preferencias_detectadas.length > 0) {
    texto += `  Preferências: ${planejamento.interpretacao.preferencias_detectadas.join(', ')}\n`;
  }
  texto += '\n';
  
  texto += `DIVISÃO EM ETAPAS (${planejamento.divisao_etapas.total_etapas} etapas):\n`;
  for (const etapa of planejamento.divisao_etapas.etapas) {
    texto += `  ${etapa.id}. [${etapa.tipo}] ${etapa.descricao}\n`;
    texto += `     → ${etapa.acao_especifica}\n`;
    if (etapa.criterios_sucesso) {
      texto += `     → Critérios: ${etapa.criterios_sucesso.join('; ')}\n`;
    }
  }
  texto += '\n';
  
  if (planejamento.arquivos_previstos.length > 0) {
    texto += `ARQUIVOS PREVISTOS:\n`;
    for (const arquivo of planejamento.arquivos_previstos) {
      texto += `  - ${arquivo.caminho_sugerido} (${arquivo.descricao})\n`;
    }
    texto += '\n';
  }
  
  texto += `COMPLEXIDADE ESTIMADA: ${planejamento.estimativa_complexidade}\n`;
  texto += `STATUS: ${planejamento.status}\n`;
  texto += `${'='.repeat(60)}\n`;
  
  return texto;
}
