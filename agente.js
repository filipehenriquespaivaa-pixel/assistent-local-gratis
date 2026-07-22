// ============================================================
// agente.js — nucleo do agente (usado so pelo index.js agora que
// a interface web foi removida).
// ============================================================
import path from 'path';
import { tools, executeTool, resumoMemoria } from './tools.js';
import { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders } from './config.js';
import { logger } from './logger.js';

export { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders };

// ============ CONFIGURACAO DE RETRY E TIMEOUT ============
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000;

// ============ SYSTEM PROMPT ============
// A memoria eh injetada automaticamente aqui, a cada chamada, em vez de
// depender do modelo lembrar de chamar consultar_memoria por conta propria
// (um modelo pequeno raramente faz isso sem ser instruido a cada turno).
export function buildSystemPrompt() {
   const memoria = resumoMemoria();
   const blocoMemoria = memoria
      ? `\n\nMEMORIA (o que voce ja sabe sobre o usuario e projetos anteriores — use isso, nao pergunte de novo o que ja esta aqui):\n${memoria}`
      : '';

   return `Voce eh um agente de IA local chamado "Agente IA". Voce tem ferramentas para ajudar o usuario.

Ferramentas:
- criar_arquivo(caminho, conteudo) - Cria arquivo ou reescreve ele inteiro
- editar_arquivo(caminho, busca, substituicao) - Substitui um trecho exato de um arquivo existente, sem reescrever tudo
- ler_arquivo(caminho) - Le arquivo
- apagar_arquivo(caminho) - Apaga um arquivo
- mover_arquivo(origem, destino) - Move/renomeia arquivo ou pasta
- listar_diretorio(caminho) - Lista pasta
- criar_pasta(caminho) - Cria pasta
- buscar_na_internet(query) - Busca web
- acessar_url(url) - Le site
- executar_comando(comando) - Executa PowerShell (o usuario precisa confirmar antes do comando rodar de verdade — nao assuma aprovacao)
- abrir_programa(programa) - Abre programa
- criar_projeto(nome, tipo) - Cria projeto (node/python/web)
- salvar_memoria(categoria, chave, valor) - Salva na memoria
- consultar_memoria() - Le memoria
- buscar_arquivos(padrao, diretorio, recursivo) - Busca arquivos por nome/padrao
- monitorar_diretorio(diretorio, duracao) - Monitora mudancas em diretorio

IMPORTANTE: Use buscar_arquivos quando precisar encontrar arquivos especificos.
Use monitorar_diretorio para observar criacao/modificacao de arquivos em tempo real.

Regras gerais:
- Fale portugues brasileiro
- Use ferramentas quando necessario
- Workspace: ${WORKSPACE}
- PowerShell: use ; nao &&
- IMPORTANTE: se o usuario pedir algo funcional (um jogo, uma calculadora, um site especifico, um script que faz algo), voce MESMO escreve o codigo completo (HTML/CSS/JS/Python/etc) e salva com criar_arquivo
- Prefira editar_arquivo a criar_arquivo quando for uma mudanca pontual (uma funcao, uma linha, um trecho) em um arquivo que ja existe e eh grande
- Se voce fez um plano com uma lista de arquivos, crie/edite TODOS os arquivos listados antes de considerar a tarefa concluida
- Depois de terminar um projeto/arquivo importante, salve um resumo curto em salvar_memoria (categoria "projetos") com o que foi feito${blocoMemoria}`;
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
// Modelos locais pequenos as vezes "esquecem" o formato oficial de tool_calls
// e escrevem um JSON solto no meio da resposta. Isso detecta e recupera esses casos.
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

// ============ FASE DE PLANEJAMENTO ============
const VERBOS_CONSTRUCAO = /\b(crie|criar|cria|construa|construir|desenvolva|desenvolver|faca|fazer|monte|montar|programe|programar|quero|preciso|gostaria|implemente|implementar|escreva|escrever|redija|redigir|conte|contar|narre|narrar|descreva|descrever)\b/i;
const VERBOS_EDICAO = /\b(adicione|adicionar|mude|mudar|altere|alterar|corrija|corrigir|conserte|consertar|arrume|arrumar|melhore|melhorar|ajuste|ajustar|remova|remover|atualize|atualizar|refatore|refatorar)\b/i;

const SUBSTANTIVOS_CONSTRUCAO = /\b(jogo|game|app|aplicativo|site|pagina|landing\s?page|sistema|script|programa|calculadora|to-?do|lista de tarefas|api|bot|chatbot|automacao|ferramenta|historia|poesia|artigo|texto|conto|romance|redacao|resumo|documento|relatorio|apresentacao|palestra|aula|tutorial|guia|manual|receita|roteiro|projeto)\b/i;

const REGEX_ARQUIVO_MENCIONADO = /\b[\w\-]+\.(html|htm|css|js|jsx|ts|tsx|json|py|txt|md|bat|ps1|sh|sql)\b/gi;

const NEGACAO_PROXIMA_AO_VERBO = /\bnao\s+(?:\w+\s+){0,2}(quero|precise|precisa|crie|criar|construa|faca|desenvolva|monte|programe|implemente)\b/i;

const CONFIRMACAO_CURTA = /^\s*(sim|ok(?:ay)?|pode|pode ir|continue|continua|vai|manda|manda ver|show|isso ai|perfeito|beleza|blz)[\s!.,]*$/i;

function extrairArquivosMencionados(msg) {
   const matches = msg.match(REGEX_ARQUIVO_MENCIONADO) || [];
   return [...new Set(matches.map(m => m.trim()))];
}

function isPedidoDeConstrucao(msg, arquivosMencionados) {
   if (CONFIRMACAO_CURTA.test(msg)) return false;
   if (NEGACAO_PROXIMA_AO_VERBO.test(msg)) return false;

   const temVerbo = VERBOS_CONSTRUCAO.test(msg) || VERBOS_EDICAO.test(msg);
   if (!temVerbo) return false;
   return SUBSTANTIVOS_CONSTRUCAO.test(msg) || arquivosMencionados.length > 0;
}

async function lerArquivosMencionados(nomes) {
   const blocos = [];
   for (const nome of nomes.slice(0, 5)) {
      const caminho = path.isAbsolute(nome) ? nome : path.join(WORKSPACE, nome);
      let conteudo;
      try {
         conteudo = await executeTool('ler_arquivo', { caminho });
      } catch {
         continue;
      }
      if (!conteudo || conteudo.startsWith('Arquivo nao encontrado') || conteudo.startsWith('Erro')) continue;
      blocos.push(`--- ${nome} (conteudo atual, ${caminho}) ---\n${conteudo}`);
   }
   return blocos.join('\n\n');
}

async function planejar(conversationHistory, systemPrompt, mensagemUsuario, arquivosMencionados) {
   const contextoArquivos = await lerArquivosMencionados(arquivosMencionados);

   const instrucaoPlano = {
      role: 'system',
      content:
         (contextoArquivos
            ? `Conteudo atual dos arquivos mencionados pelo usuario:\n\n${contextoArquivos}\n\n`
            : '') +
         'Antes de usar qualquer ferramenta, escreva um plano curto seguindo EXATAMENTE este formato:\n' +
         'ARQUIVOS:\n' +
         '- caminho/do/arquivo.ext: breve descricao\n' +
         'LOGICA/CONTEUDO:\n' +
         '- descreva o que sera escrito\n\n' +
         'NAO chame nenhuma ferramenta nesta resposta — so escreva o plano.'
   };
   const msgs = [{ role: 'system', content: systemPrompt }, ...conversationHistory, instrucaoPlano];
   const resposta = await chamarLLM(msgs, { toolChoice: 'none' });
   return resposta.choices[0].message.content || '';
}

function extrairArquivosDoPlano(plano) {
   const arquivos = [];
   const regexLinha = /^\s*-\s*([^\s:][^:]*\.\w+)\s*:/gm;
   let match;
   while ((match = regexLinha.exec(plano)) !== null) {
      arquivos.push(match[1].trim());
   }
   return [...new Set(arquivos)];
}

function nomeBase(caminho) {
   return caminho.replace(/\\/g, '/').split('/').pop().toLowerCase();
}

// ============ LOOP DO AGENTE ============
const MAX_HISTORY = 30;
const MAX_ITERACOES = 15;

async function executarToolCalls(toolCalls, conversationHistory, onToolCall, arquivosCriados) {
   for (const toolCall of toolCalls) {
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

      if (funcName === 'criar_arquivo' && /criado com sucesso/i.test(resultado) && funcArgs.caminho) {
         arquivosCriados.add(nomeBase(funcArgs.caminho));
      }

      conversationHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: resultado });
   }
}

export async function agenteLoop(mensagemUsuario, conversationHistory, onToolCall, onPensando) {
   conversationHistory.push({ role: 'user', content: mensagemUsuario });
   if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
   }

   const systemPrompt = buildSystemPrompt();
   const montarMensagens = () => [{ role: 'system', content: systemPrompt }, ...conversationHistory];
   const arquivosCriados = new Set();
   let arquivosPlanejados = [];

   const arquivosMencionados = extrairArquivosMencionados(mensagemUsuario);
   if (isPedidoDeConstrucao(mensagemUsuario, arquivosMencionados)) {
      if (onPensando) onPensando('planejando');
      const plano = await planejar(conversationHistory, systemPrompt, mensagemUsuario, arquivosMencionados);
      if (plano.trim()) {
         conversationHistory.push({ role: 'assistant', content: `[Plano antes de executar]\n${plano.trim()}` });
         if (onToolCall) onToolCall('planejamento', {}, 'done', plano.trim());
         arquivosPlanejados = extrairArquivosDoPlano(plano);

         const chave = mensagemUsuario.trim().slice(0, 50).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
         await executeTool('salvar_memoria', { categoria: 'projetos', chave, valor: plano.trim().slice(0, 300) });
      }
   }

   if (onPensando) onPensando('pensando');
   let resposta = await chamarLLM(montarMensagens());
   let message = resposta.choices[0].message;

   let iteracoes = 0;
   while (message.tool_calls && message.tool_calls.length > 0 && iteracoes < MAX_ITERACOES) {
      iteracoes++;
      conversationHistory.push(message);
      await executarToolCalls(message.tool_calls, conversationHistory, onToolCall, arquivosCriados);

      if (onPensando) onPensando('processando');
      resposta = await chamarLLM(montarMensagens());
      message = resposta.choices[0].message;
   }

   while (!message.tool_calls?.length && message.content && iteracoes < MAX_ITERACOES) {
      const detectadas = detectarToolCallsNoTexto(message.content);
      if (detectadas.length === 0) break;

      iteracoes++;
      conversationHistory.push({ role: 'assistant', content: message.content });

      const toolCallsFicticios = detectadas.map(tc => ({
         id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
         function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
      }));
      await executarToolCalls(toolCallsFicticios, conversationHistory, onToolCall, arquivosCriados);

      if (onPensando) onPensando('processando');
      resposta = await chamarLLM(montarMensagens());
      message = resposta.choices[0].message;
   }

   // ============ VERIFICACAO DO PLANO ============
   const MAX_TENTATIVAS_CORRECAO = 3;

   if (arquivosPlanejados.length > 0 && iteracoes < MAX_ITERACOES) {
      let tentativa = 0;
      let faltando = arquivosPlanejados.filter(a => !arquivosCriados.has(nomeBase(a)));

      while (faltando.length > 0 && tentativa < MAX_TENTATIVAS_CORRECAO && iteracoes < MAX_ITERACOES) {
         tentativa++;
         conversationHistory.push({
            role: 'system',
            content:
               `⚠️ IMPORTANTE: Voce prometeu criar estes arquivos e eles NAO foram criados ainda: ${faltando.join(', ')}. ` +
               'Crie-os AGORA com criar_arquivo(). Escreva conteudo COMPLETO e REAL, nao placeholders!'
         });

         if (onPensando) onPensando('processando');
         resposta = await chamarLLM(montarMensagens());
         message = resposta.choices[0].message;
         iteracoes++;

         while (message.tool_calls && message.tool_calls.length > 0 && iteracoes < MAX_ITERACOES) {
            iteracoes++;
            conversationHistory.push(message);
            await executarToolCalls(message.tool_calls, conversationHistory, onToolCall, arquivosCriados);

            if (onPensando) onPensando('processando');
            resposta = await chamarLLM(montarMensagens());
            message = resposta.choices[0].message;
         }

         faltando = arquivosPlanejados.filter(a => !arquivosCriados.has(nomeBase(a)));
      }
   }

   if (iteracoes >= MAX_ITERACOES) {
      conversationHistory.push({
         role: 'assistant',
         content: '(parei depois de 15 chamadas pra evitar loop infinito — me avise se precisar continuar)'
      });
      return conversationHistory[conversationHistory.length - 1].content;
   }

   const respostaFinal = message.content || '(sem resposta)';
   conversationHistory.push({ role: 'assistant', content: respostaFinal });
   return respostaFinal;
}
