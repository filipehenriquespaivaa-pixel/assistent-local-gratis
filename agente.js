// ============================================================
// agente.js — nucleo do agente com arquitetura baseada em slots
// O JavaScript é o "cérebro" que controla estado e fluxo.
// O modelo de IA é apenas o executor da etapa atual.
// ============================================================
import path from 'path';
import { tools, executeTool, resumoMemoria } from './tools.js';
import { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders } from './config.js';
import { logger } from './logger.js';
import { memoryManager } from './memory-manager.js';

export { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders };

// ============ CONFIGURACAO DE RETRY E TIMEOUT ============
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000;

// ============ SYSTEM PROMPT OTIMIZADO ============
// O modelo recebe apenas contexto mínimo necessário para a etapa atual
export function buildSystemPrompt() {
   const memoria = resumoMemoria();
   const estadoAtual = memoryManager.getResumoEstado();
   
   const blocoMemoria = memoria
      ? `\n\nMEMORIA (o que voce ja sabe):\n${memoria}`
      : '';
   
   const blocoEstado = memoryManager.hasProjetoEmAndamento()
      ? `\n\nESTADO ATUAL DO PROJETO (use isso para saber onde estamos):\n${estadoAtual}`
      : '';

   return `Voce eh um agente de IA local chamado "Agente IA". Voce tem ferramentas para ajudar o usuario.

Ferramentas disponiveis:
- criar_arquivo(caminho, conteudo) - Cria arquivo ou reescreve ele inteiro
- editar_arquivo(caminho, busca, substituicao) - Substitui trecho exato
- ler_arquivo(caminho) - Le arquivo
- apagar_arquivo(caminho) - Apaga arquivo
- mover_arquivo(origem, destino) - Move/renomeia arquivo ou pasta
- listar_diretorio(caminho) - Lista pasta
- criar_pasta(caminho) - Cria pasta
- buscar_na_internet(query) - Busca web
- acessar_url(url) - Le site
- executar_comando(comando) - Executa PowerShell (usuario confirma antes)
- abrir_programa(programa) - Abre programa
- criar_projeto(nome, tipo) - Cria estrutura de projeto
- salvar_memoria(categoria, chave, valor) - Salva na memoria
- consultar_memoria() - Le memoria
- buscar_arquivos(padrao, diretorio, recursivo) - Busca arquivos por padrao
- monitorar_diretorio(diretorio, duracao) - Monitora mudancas em diretorio

Regras IMPORTANTISSIMAS:
1. Se houver um projeto em andamento (veja ESTADO ATUAL), foque APENAS na etapa indicada
2. Nao tente fazer todo o projeto de uma vez - execute UMA etapa por vez
3. Use editar_arquivo em vez de criar_arquivo para mudancas pontuais
4. Sempre verifique se arquivos existem antes de editar
5. Workspace padrao: ${WORKSPACE}
6. PowerShell: use ; nao &&
7. Apos criar/editar cada arquivo, confirme antes de prosseguir
8. Se houver erro, registre e tente corrigir antes de continuar${blocoMemoria}${blocoEstado}`;
}

// ============ CHAMADA AO LLM COM RETRY ============
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function chamarLLM(messages, opcoes = {}) {
   const toolChoice = opcoes.toolChoice || 'auto';
   let lastError;
   
   for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
     try {
       logger.debug(`Tentativa ${tentativa}/${MAX_RETRIES} de chamada LLM`);
       
       const controller = new AbortController();
       const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
       
       const response = await fetch(LM_STUDIO_URL, {
         method: 'POST',
         headers: getHeaders(),
         body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: toolChoice, temperature: 0.7, max_tokens: -1 }),
         signal: controller.signal
       });
       
       clearTimeout(timeoutId);
       
       if (!response.ok) {
         let corpo = '';
         try { corpo = await response.text(); } catch { /* ignore */ }
         
         if (response.status >= 500 && tentativa < MAX_RETRIES) {
           logger.warn(`Servidor retornou ${response.status}, tentando novamente em ${RETRY_DELAY_MS}ms`);
           await sleep(RETRY_DELAY_MS * tentativa);
           continue;
         }
         
         throw new Error(`LM Studio respondeu com erro ${response.status}. ${corpo.substring(0, 300)}`);
       }
       
       const data = await response.json();
       if (!data.choices || !data.choices[0]) {
         throw new Error('Resposta do LM Studio veio sem "choices" — verifique se o modelo carregado suporta tool calling.');
       }
       
       logger.llmCall(MODEL, data.usage?.total_tokens || 0, 0);
       return data;
       
     } catch (e) {
       lastError = e;
       logger.networkError(LM_STUDIO_URL, e);
       
       if (tentativa < MAX_RETRIES) {
         logger.info(`Erro na tentativa ${tentativa}, retry em ${RETRY_DELAY_MS}ms: ${e.message}`);
         await sleep(RETRY_DELAY_MS * tentativa);
       }
     }
   }
   
   throw new Error(`Falha apos ${MAX_RETRIES} tentativas: ${lastError?.message || 'erro desconhecido'}`);
}

// ============ FALLBACK: tool calls escritas como JSON no texto ============
function detectarToolCallsNoTexto(texto) {
   const results = [];
   const jsonPattern = /\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})[\s\S]*?\}/g;
   let match;
   while ((match = jsonPattern.exec(texto)) !== null) {
      try {
         const name = match[1];
         const args = JSON.parse(match[2]);
         if (tools.some(t => t.function.name === name)) results.push({ name, arguments: args });
      } catch { /* JSON malformado, ignora esse trecho */ }
   }
   return results;
}

// ============ NOVO: Gerador de Plano baseado em Slots ============
async function gerarPlano(mensagemUsuario, conversationHistory) {
   const systemPrompt = buildSystemPrompt();
   
   const instrucaoPlano = {
      role: 'system',
      content: `${systemPrompt}\n\n=== INSTRUCAO DE PLANEJAMENTO ===
Sua tarefa AGORA é apenas criar um plano detalhado em etapas.
NÃO execute nenhuma ferramenta ainda. Apenas retorne o plano neste formato EXATO:

PROJETO: [nome do projeto]
TIPO: [web/node/python/outro]
ETAPAS:
1. [descrição clara da etapa 1]
2. [descrição clara da etapa 2]
3. [descrição clara da etapa 3]
...

ARQUIVOS PREVISTOS:
- caminho/do/arquivo1.ext: breve descrição
- caminho/do/arquivo2.ext: breve descrição

Seja específico e prático. Cada etapa deve ser executável independentemente.`
   };
   
   const msgs = [instrucaoPlano, ...conversationHistory.slice(-10)];
   const resposta = await chamarLLM(msgs, { toolChoice: 'none' });
   return resposta.choices[0].message.content || '';
}

// ============ Parser do Plano ============
function parsePlano(textoPlano) {
   const linhas = textoPlano.split('\n').map(l => l.trim()).filter(l => l);
   
   let projeto = '';
   let tipo = 'outro';
   const etapas = [];
   const arquivos = [];
   
   let secaoAtual = '';
   
   for (const linha of linhas) {
      if (linha.startsWith('PROJETO:')) {
         projeto = linha.replace('PROJETO:', '').trim();
      } else if (linha.startsWith('TIPO:')) {
         tipo = linha.replace('TIPO:', '').trim().toLowerCase();
      } else if (linha.startsWith('ETAPAS:')) {
         secaoAtual = 'etapas';
      } else if (linha.startsWith('ARQUIVOS PREVISTOS:')) {
         secaoAtual = 'arquivos';
      } else if (/^\d+\./.test(linha) && secaoAtual === 'etapas') {
         etapas.push(linha.replace(/^\d+\.\s*/, '').trim());
      } else if (linha.startsWith('-') && secaoAtual === 'arquivos') {
         const match = linha.match(/^-\s*([^:]+):\s*(.*)$/);
         if (match) {
            arquivos.push({ caminho: match[1].trim(), descricao: match[2].trim() });
         }
      }
   }
   
   return { projeto, tipo, etapas, arquivos };
}

// ============ Executor de Etapa Única ============
async function executarEtapa(etapaIndex, totalEtapas, descricaoEtapa, arquivosEnvolvidos, onToolCall, onPensando) {
   const systemPrompt = buildSystemPrompt();
   
   // Contexto mínimo: apenas esta etapa
   const contextoEtapa = `
=== CONTEXTO DA ETAPA ATUAL ===
Você está na etapa ${etapaIndex + 1} de ${totalEtapas}.
Tarefa: ${descricaoEtapa}
Arquivos envolvidos: ${arquivosEnvolvidos.length > 0 ? arquivosEnvolvidos.map(a => a.caminho).join(', ') : 'Nenhum específico'}

IMPORTANTE: Execute APENAS esta etapa. Não pule para próximas etapas.
Após concluir, pare e aguarde confirmação.
`;

   const msgs = [
      { role: 'system', content: systemPrompt + contextoEtapa },
      { role: 'user', content: `Execute a etapa ${etapaIndex + 1}: ${descricaoEtapa}` }
   ];
   
   if (onPensando) onPensando('pensando');
   let resposta = await chamarLLM(msgs);
   let message = resposta.choices[0].message;
   
   const arquivosCriados = new Set();
   let iteracoes = 0;
   const MAX_ITERACOES = 10;
   
   // Loop de execução de tools para ESTA etapa
   while (message.tool_calls && message.tool_calls.length > 0 && iteracoes < MAX_ITERACOES) {
      iteracoes++;
      
      for (const toolCall of message.tool_calls) {
         const funcName = toolCall.function.name;
         let funcArgs;
         try {
            funcArgs = JSON.parse(toolCall.function.arguments);
         } catch {
            funcArgs = {};
         }

         if (onToolCall) onToolCall(funcName, funcArgs, 'running');
         const resultado = await executeTool(funcName, funcArgs);
         if (onToolCall) onToolCall(funcName, funcArgs, 'done', resultado);

         // Rastreia arquivos criados
         if (funcName === 'criar_arquivo' && /criado com sucesso/i.test(resultado) && funcArgs.caminho) {
            arquivosCriados.add(funcArgs.caminho);
            memoryManager.marcarArquivoCriado(funcArgs.caminho);
         }
      }
      
      if (onPensando) onPensando('processando');
      resposta = await chamarLLM([...msgs, message]);
      message = resposta.choices[0].message;
   }
   
   return { sucesso: true, arquivosCriados: Array.from(arquivosCriados), iteracoes };
}

// ============ LOOP PRINCIPAL DO AGENTE COM SLOTS ============
const MAX_HISTORY = 30;

export async function agenteLoop(mensagemUsuario, conversationHistory, onToolCall, onPensando) {
   // Verifica se há projeto em andamento
   const temProjetoEmAndamento = memoryManager.hasProjetoEmAndamento();
   
   if (!temProjetoEmAndamento) {
      // Novo pedido - gera plano e inicializa slots
      conversationHistory.push({ role: 'user', content: mensagemUsuario });
      if (conversationHistory.length > MAX_HISTORY) {
         conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
      }
      
      if (onPensando) onPensando('planejando');
      const planoTexto = await gerarPlano(mensagemUsuario, conversationHistory);
      const planoParseado = parsePlano(planoTexto);
      
      if (planoParseado.etapas.length > 0) {
         // Inicializa slots com o plano
         memoryManager.iniciarProjeto(
            planoParseado.projeto || 'Projeto Sem Nome',
            planoParseado.tipo,
            planoParseado.etapas
         );
         
         // Define arquivos pendentes
         memoryManager.definirArquivosPendentes(planoParseado.arquivos.map(a => a.caminho));
         
         // Salva plano na memória
         await executeTool('salvar_memoria', {
            categoria: 'projetos',
            chave: planoParseado.projeto.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30),
            valor: planoTexto.slice(0, 500)
         });
         
         console.log(`\n  Projeto iniciado: ${planoParseado.projeto}`);
         console.log(`  Total de etapas: ${planoParseado.etapas.length}`);
      }
   } else {
      // Projeto em andamento - continua da etapa atual
      const progresso = memoryManager.getSlot('slot_progresso');
      const plano = memoryManager.getSlot('slot_plano');
      
      console.log(`\n  Continuando projeto: ${progresso.projeto}`);
      console.log(`  Etapa atual: ${progresso.etapa_atual + 1}/${progresso.total_etapas}`);
      
      conversationHistory.push({ role: 'user', content: mensagemUsuario });
   }
   
   // Executa etapa atual
   const planoAtual = memoryManager.getSlot('slot_plano');
   const etapaIndex = planoAtual.etapa_atual;
   
   if (etapaIndex < planoAtual.total_etapas) {
      const descricaoEtapa = planoAtual.etapas[etapaIndex];
      const arquivosSlot = memoryManager.getSlot('slot_arquivos');
      
      if (onPensando) onPensando('executando');
      const resultado = await executarEtapa(
         etapaIndex,
         planoAtual.total_etapas,
         descricaoEtapa,
         arquivosSlot.pendentes,
         onToolCall,
         onPensando
      );
      
      // Avança para próxima etapa
      memoryManager.avancarEtapa();
      
      // Verifica se concluiu todas as etapas
      const novoProgresso = memoryManager.getSlot('slot_progresso');
      if (novoProgresso.status === 'concluido') {
         memoryManager.finalizarProjeto();
         console.log('\n  Projeto concluído com sucesso!');
      }
      
      return `Etapa ${etapaIndex + 1} concluída. ${resultado.arquivosCriados.length} arquivo(s) criado(s).`;
   }
   
   return 'Nenhuma etapa pendente.';
}
