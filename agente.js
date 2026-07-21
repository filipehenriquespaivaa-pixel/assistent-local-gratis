// ============================================================
// agente.js — núcleo do agente (usado só pelo index.js agora que
// a interface web foi removida).
// ============================================================
import path from 'path';
import { tools, executeTool, resumoMemoria } from './tools.js';
import { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders } from './config.js';

export { LM_STUDIO_URL, LM_STUDIO_BASE, MODEL, WORKSPACE, getHeaders };

// ============ SYSTEM PROMPT ============
// A memória é injetada automaticamente aqui, a cada chamada, em vez de
// depender do modelo lembrar de chamar consultar_memoria por conta própria
// (um modelo pequeno raramente faz isso sem ser instruído a cada turno).
export function buildSystemPrompt() {
   const memoria = resumoMemoria();
   const blocoMemoria = memoria
      ? `\n\nMEMÓRIA (o que você já sabe sobre o usuário e projetos anteriores — use isso, não pergunte de novo o que já está aqui):\n${memoria}`
      : '';

   return `Você é um agente de IA local chamado "Agente IA". Você tem ferramentas para ajudar o usuário.

Ferramentas:
- criar_arquivo(caminho, conteudo) - Cria arquivo ou reescreve ele inteiro
- editar_arquivo(caminho, busca, substituicao) - Substitui um trecho exato de um arquivo existente, sem reescrever tudo
- ler_arquivo(caminho) - Lê arquivo
- apagar_arquivo(caminho) - Apaga um arquivo
- mover_arquivo(origem, destino) - Move/renomeia arquivo ou pasta
- listar_diretorio(caminho) - Lista pasta
- criar_pasta(caminho) - Cria pasta
- buscar_na_internet(query) - Busca web
- acessar_url(url) - Lê site
- executar_comando(comando) - Executa PowerShell (o usuário precisa confirmar antes do comando rodar de verdade — não assuma aprovação)
- abrir_programa(programa) - Abre programa
- criar_projeto(nome, tipo) - Cria projeto (node/python/web)
- salvar_memoria(categoria, chave, valor) - Salva na memória
- consultar_memoria() - Lê memória

Regras de CRIAÇÃO DE CONTEÚDO:
- Se o usuário pedir uma história, poesia, artigo, texto narrativo: SEMPRE escreva COMPLETO com MÍNIMO 10-15 linhas, com começo/meio/fim
- Se o usuário pedir código funcional: escreva código que funciona de verdade, com comentários quando necessário
- NUNCA crie arquivos apenas com placeholders como "arquivo criado", "conteúdo aqui" — isso é inaceitável
- Arquivos simples (config, .gitignore, etc) podem ser curtos se forem completos e úteis
- Leia o pedido CUIDADOSAMENTE e crie conteúdo REAL e SIGNIFICATIVO

Regras gerais:
- Fale português brasileiro
- Use ferramentas quando necessário
- Workspace: ${WORKSPACE}
- PowerShell: use ; não &&
- IMPORTANTE: se o usuário pedir algo funcional (um jogo, uma calculadora, um site específico, um script que faz algo), você MESMO escreve o código completo (HTML/CSS/JS/Python/etc) e salva com criar_arquivo
- Prefira editar_arquivo a criar_arquivo quando for uma mudança pontual (uma função, uma linha, um trecho) em um arquivo que já existe e é grande — reescrever o arquivo inteiro pra uma mudança pequena é ineficiente
- Se editar_arquivo falhar dizendo que o trecho de busca não foi encontrado ou aparece mais de uma vez, use ler_arquivo pra conferir o conteúdo real antes de tentar de novo — não adivinhe
- Se você fez um plano com uma lista de arquivos, crie/edite TODOS os arquivos listados antes de considerar a tarefa concluída
- Depois de terminar um projeto/arquivo importante, salve um resumo curto em salvar_memoria (categoria "projetos") com o que foi feito — isso vira contexto automático nas próximas conversas${blocoMemoria}`;
}

// ============ CHAMADA AO LLM ============
export async function chamarLLM(messages, opcoes = {}) {
   const toolChoice = opcoes.toolChoice || 'auto';
   let response;
   try {
      response = await fetch(LM_STUDIO_URL, {
         method: 'POST',
         headers: getHeaders(),
         body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: toolChoice, temperature: 0.7, max_tokens: -1 })
      });
   } catch (e) {
      throw new Error(`Não foi possível conectar ao LM Studio em ${LM_STUDIO_BASE}. Ele está aberto e com o servidor local ligado? (${e.message})`);
   }
   if (!response.ok) {
      let corpo = '';
      try { corpo = await response.text(); } catch { /* ignore */ }
      throw new Error(`LM Studio respondeu com erro ${response.status}. ${corpo.substring(0, 300)}`);
   }
   const data = await response.json();
   if (!data.choices || !data.choices[0]) {
      throw new Error('Resposta do LM Studio veio sem "choices" — verifique se o modelo carregado suporta tool calling.');
   }
   return data;
}

// ============ FALLBACK: tool calls escritas como JSON no texto ============
// Modelos locais pequenos às vezes "esquecem" o formato oficial de tool_calls
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

// ============ VALIDAÇÃO DE CONTEÚDO (INTELIGENTE) ============
// Detecta se um conteúdo é apenas placeholder/vazio
// Mínimos variam por tipo de arquivo
function ehConteudoValido(caminho, conteudo) {
   if (!conteudo) return false;
   
   const textoLimpo = conteudo.trim();
   
   // Detecta placeholders óbvios
   const placeholders = [
      /^conteúdo$/i,
      /^história criada/i,
      /^arquivo criado/i,
      /^texto aqui$/i,
      /^escreva aqui$/i,
      /^seu conteúdo$/i,
      /^apenas placeholder/i,
      /^\[\s*conteúdo\s*\]$/i,
      /^\[\s*história\s*\]$/i,
      /^\[\s*código\s*\]$/i,
   ];
   
   if (placeholders.some(p => p.test(textoLimpo))) return false;
   if (textoLimpo.length < 1) return false;
   
   // Define mínimos por tipo de arquivo
   const ext = caminho.toLowerCase().split('.').pop();
   const linhas = textoLimpo.split('\n').filter(l => l.trim()).length;
   
   const minimos = {
      // Conteúdo narrativo: precisa ser completo
      txt: 5,
      md: 5,
      story: 10,
      poesia: 5,
      // Código: precisa ser funcional
      js: 2,
      py: 2,
      html: 3,
      css: 2,
      // Config/simples: pode ser curto
      json: 1,
      gitignore: 1,
      env: 1,
      yml: 1,
      yaml: 1,
      // Default: aceita se tem conteúdo
      default: 1
   };
   
   const minimoEsperado = minimos[ext] || minimos.default;
   return linhas >= minimoEsperado;
}

// ============ FASE DE PLANEJAMENTO ============
// Modelos pequenos tendem a partir direto pra ferramenta mais "óbvia" sem
// pensar na estrutura do que vão construir, e frequentemente esquecem de
// terminar tudo o que prometeram no plano. As melhorias aqui:
//
//  1. Detecção também cobre pedidos de EDIÇÃO/correção de algo que já existe
//     (antes só detectava "criar algo novo").
//  2. Se o usuário menciona um arquivo que já existe no workspace, o
//     conteúdo atual dele é lido e incluído ANTES do plano ser escrito —
//     assim o plano é baseado no código real, não em suposição.
//  3. O plano agora segue um formato fixo (lista de ARQUIVOS + LÓGICA), o
//     que permite extrair automaticamente quais arquivos foram prometidos.
//  4. Depois que o modelo termina de usar as ferramentas, comparamos os
//     arquivos prometidos no plano com os que de fato foram criados/editados
//     nesta conversa. Se faltar algum, o agente é cutucado pra terminar
//     antes de responder — em vez de simplesmente esquecer.

const VERBOS_CONSTRUCAO = /\b(crie|criar|cria|construa|construir|desenvolva|desenvolver|fa[çc]a|fazer|monte|montar|programe|programar|quero|preciso|gostaria|implemente|implementar|escreva|escrever|redija|redigir|conte|contar|narre|narrar|descreva|descrever)\b/i;
const VERBOS_EDICAO = /\b(adicione|adicionar|mude|mudar|altere|alterar|corrija|corrigir|conserte|consertar|arrume|arrumar|melhore|melhorar|ajuste|ajustar|remova|remover|atualize|atualizar|refatore|refatorar)\b/i;

// Lista ampliada — a versão anterior cobria só os "clássicos" (jogo, app, site);
// faltavam pedidos comuns como landing page, dashboard, planilha, automação, etc.
const SUBSTANTIVOS_CONSTRUCAO = /\b(jogo|game|app|aplicativo|site|p[aá]gina|landing\s?page|sistema|script|programa|calculadora|to-?do|lista de tarefas|api|bot|chatbot|automa[çc][ãa]o|ferramenta|história|poesia|artigo|texto|conto|romance|redação|resumo|documento|relatório|apresentação|palestra|aula|tutorial|guia|manual|receita|roteiro|projeto)\b/i;

// Extensões de arquivo comuns que o usuário pode citar pelo nome (ex: "conserte o jogo.html")
const REGEX_ARQUIVO_MENCIONADO = /\b[\w\-]+\.(html|htm|css|js|jsx|ts|tsx|json|py|txt|md|bat|ps1|sh|sql)\b/gi;

// Nova: evita disparar plano quando o usuário está NEGANDO a ação
// ("não crie", "não quero mais", "sem precisar programar")
const NEGACAO_PROXIMA_AO_VERBO = /\bn[ãa]o\s+(?:\w+\s+){0,2}(quero|precise|precisa|crie|criar|construa|fa[çc]a|desenvolva|monte|programe|implemente)\b/i;

// Nova: confirmações curtas ("sim", "pode", "ok", "manda ver") não devem
// re-disparar um plano do zero — normalmente é continuação do que já foi
// planejado na mensagem anterior.
const CONFIRMACAO_CURTA = /^\s*(sim|ok(?:ay)?|pode|pode ir|continue|continua|vai|manda|manda ver|show|isso a[íi]|perfeito|beleza|blz)[\s!.,]*$/i;

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

// Lê o conteúdo atual de arquivos que o usuário citou pelo nome, se existirem,
// pra o plano ser baseado no estado real e não em suposição.
async function lerArquivosMencionados(nomes) {
   const blocos = [];
   for (const nome of nomes.slice(0, 5)) { // limite de segurança
      const caminho = path.isAbsolute(nome) ? nome : path.join(WORKSPACE, nome);
      let conteudo;
      try {
         conteudo = await executeTool('ler_arquivo', { caminho });
      } catch {
         continue;
      }
      if (!conteudo || conteudo.startsWith('Arquivo não encontrado') || conteudo.startsWith('Erro')) continue;
      blocos.push(`--- ${nome} (conteúdo atual, ${caminho}) ---\n${conteudo}`);
   }
   return blocos.join('\n\n');
}

async function planejar(conversationHistory, systemPrompt, mensagemUsuario, arquivosMencionados) {
   const contextoArquivos = await lerArquivosMencionados(arquivosMencionados);

   const instrucaoPlano = {
      role: 'system',
      content:
         (contextoArquivos
            ? `Conteúdo atual dos arquivos mencionados pelo usuário (use isso como base real do que já existe — não invente o que já está aqui, e não recrie do zero o que já funciona):\n\n${contextoArquivos}\n\n`
            : '') +
         'Antes de usar qualquer ferramenta, escreva um plano curto seguindo EXATAMENTE este formato:\n' +
         'ARQUIVOS:\n' +
         '- caminho/do/arquivo.ext: breve descrição do que esse arquivo faz\n' +
         '(uma linha por arquivo que será criado ou modificado)\n' +
         'LÓGICA/CONTEÚDO:\n' +
         '- descreva em poucas linhas a lógica, estrutura ou o que será escrito\n\n' +
         'NÃO chame nenhuma ferramenta nesta resposta — só escreva o plano em texto, seguindo esse formato.'
   };
   const msgs = [{ role: 'system', content: systemPrompt }, ...conversationHistory, instrucaoPlano];
   const resposta = await chamarLLM(msgs, { toolChoice: 'none' });
   return resposta.choices[0].message.content || '';
}

// Extrai os caminhos de arquivo prometidos na seção "ARQUIVOS:" do plano.
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
const MAX_ITERACOES = 15; // era 10 — as tentativas extras de correção do plano usam esse mesmo teto

/**
 * Executa uma lista de tool_calls, atualizando o histórico e o set de
 * arquivos criados/editados nesta rodada. Compartilhado entre o loop
 * principal, o fallback de JSON solto, e a verificação pós-plano.
 */
async function executarToolCalls(toolCalls, conversationHistory, onToolCall, arquivosCriados) {
   for (const toolCall of toolCalls) {
      const funcName = toolCall.function.name;
      let funcArgs;
      try {
         funcArgs = JSON.parse(toolCall.function.arguments);
      } catch {
         funcArgs = {};
      }

      // VALIDAÇÃO: se é criar_arquivo, verifica se o conteúdo é válido
      if (funcName === 'criar_arquivo' && !ehConteudoValido(funcArgs.caminho, funcArgs.conteudo)) {
         if (onToolCall) onToolCall(funcName, funcArgs, 'running');
         const aviso = `⚠️ Conteúdo do arquivo "${funcArgs.caminho}" é vazio ou muito genérico. Reenviando...`;
         if (onToolCall) onToolCall(funcName, funcArgs, 'done', aviso);
         
         conversationHistory.push({
            role: 'system',
            content: `AVISO: tentou criar "${funcArgs.caminho}" com conteúdo muito curto/vazio: "${funcArgs.conteudo.substring(0, 50)}...". Refaça com conteúdo REAL e COMPLETO.`
         });
         continue; // Não executa, deixa o modelo tentar de novo
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

/**
 * Roda uma rodada completa do agente: manda a mensagem, executa as tools
 * que o modelo pedir, e repete até ele responder com texto final.
 *
 * @param {string} mensagemUsuario
 * @param {Array} conversationHistory - histórico mutável (array), é alterado in-place
 * @param {(name: string, args: object, status: 'running'|'done', result?: string) => void} onToolCall - callback opcional pra UI
 * @param {(fase: string) => void} onPensando - callback opcional pra avisar "pensando..."
 */
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

         // Salva um resumo do plano na memória — vira contexto automático nas próximas conversas
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

   // Fallback: o modelo pode ter escrito a tool call como JSON solto no texto
   // em vez de usar o campo tool_calls oficial. Só entra aqui se ainda não
   // tiver estourado o limite de iterações no loop oficial acima.
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

   // ============ VERIFICAÇÃO DO PLANO ============
   // Compara o que foi prometido em "ARQUIVOS:" com o que de fato foi criado
   // nesta rodada. Se faltar algo, dá mais chances ao modelo de terminar em
   // vez de deixá-lo simplesmente esquecer parte do plano.
   const MAX_TENTATIVAS_CORRECAO = 3;

   if (arquivosPlanejados.length > 0 && iteracoes < MAX_ITERACOES) {
      let tentativa = 0;
      let faltando = arquivosPlanejados.filter(a => !arquivosCriados.has(nomeBase(a)));

      while (faltando.length > 0 && tentativa < MAX_TENTATIVAS_CORRECAO && iteracoes < MAX_ITERACOES) {
         tentativa++;
         conversationHistory.push({
            role: 'system',
            content:
               `Verificação do plano (tentativa ${tentativa}/${MAX_TENTATIVAS_CORRECAO}): você prometeu criar/editar: ${faltando.join(', ')}. ` +
               'Se ainda são necessários, crie-os agora com criar_arquivo. Se não forem mais necessários, explique por que.'
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
         content: '(parei depois de 15 chamadas de ferramentas seguidas pra evitar um loop infinito — me avise se precisar continuar)'
      });
      return conversationHistory[conversationHistory.length - 1].content;
   }

   const respostaFinal = message.content || '(sem resposta)';
   conversationHistory.push({ role: 'assistant', content: respostaFinal });
   return respostaFinal;
}
