# Módulo Interpretador de Pedidos

## Visão Geral

O `interpretador.js` é um módulo que analisa pedidos do usuário, identifica o tipo de tarefa, extrai preferências e destino, e divide o pedido em etapas executáveis. O planejamento é salvo em um arquivo JSON para auditoria.

## Funcionalidades

### 1. Interpretação do Pedido
- **Detecção de Tipo**: Identifica se o pedido é de escrita, programação, pesquisa ou organização
- **Extração de Destino**: Identifica onde o resultado deve ser salvo (pasta, local, diretório)
- **Extração de Preferências**: Detecta preferências como simplicidade, formato (HTML, Python, JS), tamanho e idioma

### 2. Divisão em Etapas
Cada pedido é dividido automaticamente em etapas lógicas:
1. **Análise**: Entender o pedido do usuário
2. **Criação**: Produzir o conteúdo (texto, código, etc.)
3. **Salvamento**: Salvar no destino especificado
4. **Validação**: Verificar se atende ao pedido original

### 3. Arquivo de Memória de Planejamento
O arquivo `planejamento.json` armazena:
- Histórico dos últimos 50 planejamentos
- Último planejamento realizado
- Detalhes completos de cada interpretação

## Como Usar

### Importando o Módulo

```javascript
import { 
  interpretarPedido, 
  salvarPlanejamento, 
  formatarPlanejamentoTexto,
  carregarPlanejamentos 
} from './interpretador.js';
```

### Exemplo de Uso

```javascript
// Interpretar um pedido
const pedido = 'Criar uma historia simples em local x';
const planejamento = interpretarPedido(pedido);

// Visualizar interpretação
console.log(formatarPlanejamentoTexto(planejamento));

// Salvar em arquivo
salvarPlanejamento(planejamento);
```

## Estrutura do Planejamento

```json
{
  "metadata": {
    "id": "planejamento_1234567890",
    "timestamp_criacao": "2026-07-23T20:52:11.395Z",
    "versao": "1.0"
  },
  "pedido_original": "Criar uma historia simples em local x",
  "interpretacao": {
    "tipo_identificado": "escrita",
    "destino_identificado": "local x",
    "preferencias_detectadas": ["simplicidade"],
    "resumo": "Pedido do tipo \"escrita\" com destino em \"local x\""
  },
  "divisao_etapas": {
    "total_etapas": 4,
    "etapas_obrigatorias": 4,
    "etapas": [
      {
        "id": 1,
        "tipo": "analise",
        "descricao": "Analisar e entender o pedido do usuário",
        "acao_especifica": "Interpretar requisitos e identificar elementos chave",
        "criterio_sucesso": "Compreensão clara do que deve ser produzido",
        "obrigatoria": true
      }
    ]
  },
  "arquivos_previstos": [
    {
      "caminho_sugerido": "local x.txt",
      "tipo": "escrita",
      "descricao": "Arquivo principal com o resultado"
    }
  ],
  "estimativa_complexidade": "media",
  "status": "planejado",
  "execucao": {
    "etapa_atual": 0,
    "concluido": false,
    "historico": []
  }
}
```

## Tipos de Pedidos Reconhecidos

| Tipo | Palavras-chave | Saída Padrão |
|------|---------------|--------------|
| escrita | história, conto, roteiro, texto | .txt, .md |
| programacao | código, programa, site, jogo, html | .html, .js, .py |
| pesquisa | pesquisar, buscar, investigar | .txt, .md |
| organizacao | organizar, estruturar, pasta | estrutura de diretórios |

## Preferências Detectadas

- **Simplicidade**: "simples", "básico", "fácil"
- **Formato**: "html", "python", "javascript"
- **Tamanho**: "curto", "pequeno", "longo", "completo"
- **Idioma**: "português", "inglês"

## Arquivo de Planejamento

O arquivo `planejamento.json` é criado automaticamente na raiz do projeto e contém:

```json
{
  "ultimo_planejamento": {...},
  "total_planejamentos": 4,
  "historico": [...]
}
```

Para visualizar o planejamento atual:

```bash
cat planejamento.json
```

Ou use a função `carregarPlanejamentos()` para ler programaticamente.

## Integração com Agente

O módulo já está integrado ao `agente.js`. Quando um novo pedido é recebido:

1. O interpretador analisa o pedido
2. Divide em etapas executáveis
3. Salva o planejamento em `planejamento.json`
4. Envia as etapas para execução

## Comandos Úteis

### Testar o Interpretador
```bash
node test-interpretador.js
```

### Ver Planejamentos Salvos
```bash
cat planejamento.json | jq .
```

### Ver Último Planejamento Formatado
```javascript
const { carregarPlanejamentos, formatarPlanejamentoTexto } = require('./interpretador.js');
const historico = carregarPlanejamentos();
console.log(formatarPlanejamentoTexto(historico.ultimo));
```

## Exemplos de Pedidos

### Exemplo 1: História Simples
```
Pedido: "Criar uma historia simples em local x"
Tipo: escrita
Destino: local x
Preferências: simplicidade
Etapas: 3 (análise, salvamento, validação)
```

### Exemplo 2: Jogo HTML
```
Pedido: "Criar um codigo html de um jogo em local x"
Tipo: programacao
Destino: local x
Preferências: formato_html
Etapas: 4 (análise, criação, salvamento, validação)
```

### Exemplo 3: Jogo Python
```
Pedido: "Criar um jogo da cobrinha em python simples na pasta jogos"
Tipo: programacao
Destino: jogos
Preferências: formato_python, simplicidade
Etapas: 4 (análise, criação, salvamento, validação)
```

## Vantagens

✅ **Transparência**: Você pode ver exatamente como o agente interpretou seu pedido
✅ **Auditoria**: Histórico completo de todos os planejamentos
✅ **Depuração**: Fácil identificar erros de interpretação
✅ **Flexibilidade**: O agente segue o plano passo a passo
✅ **Controle**: Você pode verificar antes de executar

## Próximos Passos

Para melhorar ainda mais o interpretador:

1. Adicionar mais padrões de reconhecimento
2. Implementar aprendizado com feedback do usuário
3. Adicionar suporte a múltiplos idiomas
4. Criar interface visual para visualizar planejamentos
