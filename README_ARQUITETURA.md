# Arquitetura do Agente IA com Slots de Memória

## Visão Geral

Esta arquitetura implementa um agente de IA onde **o JavaScript é o cérebro** e o **modelo de IA é apenas o executor**. O agente controla o estado da tarefa e usa o modelo apenas para executar a etapa atual.

## Princípios Fundamentais

1. **O agente (JavaScript) decide** o que fazer a seguir
2. **O modelo (IA) apenas executa** a etapa atual
3. **Cada slot guarda apenas informações** relacionadas à sua responsabilidade
4. **O modelo nunca recebe o projeto inteiro**, apenas contexto mínimo da etapa atual

## Slots de Memória

### `slot_usuario`
- **Função**: Informações sobre o usuário (preferências, contexto)
- **Dados**: preferências, contexto, histórico_interações

### `slot_tarefa`
- **Função**: Tarefa atual sendo executada
- **Dados**: título, descrição, status, criado_em

### `slot_projeto`
- **Função**: Estado do projeto atual
- **Dados**: nome, tipo, status, criado_em

### `slot_plano`
- **Função**: Plano detalhado dividido em etapas
- **Dados**: etapas[], etapa_atual, total_etapas, criado_em

### `slot_progresso`
- **Função**: Progresso geral e status de execução
- **Dados**: projeto, etapa_atual, total_etapas, status, ultimo_update, percentual

### `slot_arquivos`
- **Função**: Arquivos envolvidos no projeto atual
- **Dados**: criados[], modificados[], pendentes[], caminho_base

### `slot_erros`
- **Função**: Erros encontrados e tentativas de correção
- **Dados**: erros[], tentativas_correcao, ultimo_erro

### `slot_decisoes`
- **Função**: Decisões tomadas durante a execução
- **Dados**: decisoes[], justificativas[]

## Fluxo de Execução

### 1. Usuário solicita um projeto
```
"Crie um jogo Snake."
```

### 2. Agente analisa e gera plano
- Analisa o pedido do usuário
- Gera plano resumido dividido em etapas
- Salva plano em `slot_plano`
- Cria `slot_projeto` com estado inicial

### 3. Exemplo de plano gerado
```
PROJETO: Snake Game
TIPO: web
ETAPAS:
1. Criar estrutura de pastas
2. Criar HTML base
3. Criar CSS com estilos
4. Criar engine.js com lógica do jogo
5. Criar interface de usuário
6. Testar funcionalidades
7. Finalizar e documentar

ARQUIVOS PREVISTOS:
- snake-game/index.html: Estrutura principal
- snake-game/style.css: Estilização
- snake-game/engine.js: Lógica do jogo
- snake-game/ui.js: Interface
```

### 4. Execução por etapas
O modelo recebe APENAS:
- Objetivo da etapa atual
- Arquivos envolvidos
- Contexto mínimo necessário

**Exemplo de prompt para etapa 4:**
```
=== CONTEXTO DA ETAPA ATUAL ===
Você está na etapa 4 de 7.
Tarefa: Criar engine.js com lógica do jogo
Arquivos envolvidos: snake-game/engine.js

IMPORTANTE: Execute APENAS esta etapa. Não pule para próximas etapas.
```

### 5. Controle pós-etapa
Após cada etapa o agente:
- Verifica se foi concluída
- Marca como concluída em `slot_arquivos`
- Avança automaticamente para próxima via `memoryManager.avancarEtapa()`

### 6. Tratamento de erros
Se houver erro:
- Registra em `slot_erros`
- Tenta corrigir automaticamente
- Somente depois continua

## Persistência e Continuidade

O estado é persistido em `estado_agente.json`. Se o programa for fechado:

```json
{
  "slot_progresso": {
    "projeto": "Snake",
    "etapa_atual": 5,
    "total_etapas": 8,
    "status": "em_andamento",
    "percentual": 62
  }
}
```

Ao reabrir, o agente consulta os slots e continua exatamente da etapa 5, sem precisar perguntar novamente.

## Vantagens desta Arquitetura

| Vantagem | Descrição |
|----------|-----------|
| **Menos contexto** | Muito menos tokens enviados ao modelo |
| **Modelos pequenos** | Funciona bem com modelos 1B-7B |
| **Sem esquecimento** | O agente lembra tudo via slots |
| **Sem repetição** | Evita refazer trabalho já feito |
| **Continuidade** | Permite continuar projetos interrompidos |
| **Controle total** | O agente controla o fluxo, não o modelo |

## Comparação: Arquitetura Tradicional vs Slots

### Tradicional (baseada apenas em prompt)
```
┌─────────────────────────────────────┐
│  Prompt gigante com TODO o contexto │
│  - Histórico completo               │
│  - Todas as decisões anteriores     │
│  - Todos os arquivos do projeto     │
│  - Instruções repetidas             │
└─────────────────────────────────────┘
           ↓
    Modelo sobrecarregado
    - Esquece detalhes
    - Confunde contexto
    - Alucina mais
```

### Com Slots (nova arquitetura)
```
┌──────────────────┐    ┌─────────────────┐
│  slot_plano      │    │ slot_progresso  │
│  - Etapas        │    │ - Etapa atual   │
│  - Etapa atual   │    │ - Status        │
└──────────────────┘    └─────────────────┘
           ↓                    ↓
┌─────────────────────────────────────┐
│  Contexto MÍNIMO para etapa atual   │
│  - Apenas etapa corrente            │
│  - Apenas arquivos relevantes       │
└─────────────────────────────────────┘
           ↓
    Modelo focado e preciso
```

## API do MemoryManager

### Métodos principais

```javascript
// Iniciar novo projeto
memoryManager.iniciarProjeto(nome, tipo, planoEtapas)

// Avançar para próxima etapa
memoryManager.avancarEtapa()

// Marcar arquivo como criado
memoryManager.marcarArquivoCriado(caminho)

// Registrar erro
memoryManager.registrarErro(erro, contexto)

// Obter resumo do estado atual
memoryManager.getResumoEstado()

// Verificar se há projeto em andamento
memoryManager.hasProjetoEmAndamento()

// Finalizar projeto
memoryManager.finalizarProjeto()
```

## Implementação

### Arquivos principais

- `memory-manager.js` - Gerenciador de slots de memória
- `agente.js` - Núcleo do agente com loop baseado em etapas
- `index.js` - Interface com usuário

### Como usar

1. Usuário faz pedido: "Crie um jogo da velha"
2. Agente gera plano e inicializa slots
3. Para cada etapa:
   - Agente monta contexto mínimo
   - Envia para modelo executar
   - Verifica resultado
   - Atualiza slots
   - Avança para próxima etapa
4. Ao finalizar todas as etapas, projeto é marcado como concluído

## Próximas Melhorias Sugeridas

1. **Busca semântica**: Implementar similaridade entre etapas
2. **Validação automática**: Testar código gerado antes de avançar
3. **Rollback**: Permitir voltar etapas em caso de erro crítico
4. **Paralelismo**: Executar etapas independentes simultaneamente
5. **Templates**: Planos pré-definidos para tipos comuns de projeto
