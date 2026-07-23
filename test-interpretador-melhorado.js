// ============================================================
// test-interpretador-melhorado.js — Teste do Interpretador
// ============================================================

import { interpretarPedido, formatarPlanejamentoTexto } from './interpretador.js';

console.log('\n' + '='.repeat(80));
console.log('TESTE DO INTERPRETADOR DE PEDIDOS');
console.log('='.repeat(80) + '\n');

const testes = [
  // Teste 1: História simples em local específico (Windows)
  {
    descricao: 'Teste 1: Criar história simples em D:\\ia local\\historias',
    pedido: 'Criar uma historia simples em D:\\ia local\\historias'
  },
  
  // Teste 2: Jogo HTML em local X
  {
    descricao: 'Teste 2: Criar código HTML de jogo em local x',
    pedido: 'Criar um codigo html de um jogo em local x'
  },
  
  // Teste 3: História com idioma português
  {
    descricao: 'Teste 3: Criar história infantil em português',
    pedido: 'Criar uma história infantil simples em português no formato html'
  },
  
  // Teste 4: Jogo Python em pasta específica
  {
    descricao: 'Teste 4: Jogo da cobrinha em Python na pasta jogos',
    pedido: 'Criar um jogo da cobrinha em python simples na pasta jogos'
  },
  
  // Teste 5: Pedido com caminho Windows completo
  {
    descricao: 'Teste 5: Criar script em C:\\projetos\\meu_jogo',
    pedido: 'Criar um script python simples em C:\\projetos\\meu_jogo'
  },
  
  // Teste 6: Múltiplas preferências
  {
    descricao: 'Teste 6: História longa em inglês em pasta específica',
    pedido: 'Criar uma história longa e detalhada em inglês na pasta stories'
  }
];

testes.forEach((teste, index) => {
  console.log(`\n${'-'.repeat(80)}`);
  console.log(`${teste.descricao}`);
  console.log(`${'-'.repeat(80)}`);
  console.log(`PEDIDO: "${teste.pedido}"\n`);
  
  const planejamento = interpretarPedido(teste.pedido);
  
  console.log('INTERPRETAÇÃO:');
  console.log(`  Tipo Identificado: ${planejamento.interpretacao.tipo_identificado}`);
  console.log(`  Destino Identificado: ${planejamento.interpretacao.destino_identificado || '(nenhum destino específico)'}`);
  console.log(`  Preferências Detectadas: ${planejamento.interpretacao.preferencias_detectadas.join(', ') || '(nenhuma)'}`);
  console.log(`  Resumo: ${planejamento.interpretacao.resumo}`);
  
  console.log('\nDIVISÃO EM ETAPAS:');
  planejamento.divisao_etapas.etapas.forEach(etapa => {
    console.log(`  ${etapa.id}. [${etapa.tipo.toUpperCase()}] ${etapa.descricao}`);
    console.log(`     → Ação: ${etapa.acao_especifica}`);
  });
  
  console.log('\nARQUIVOS PREVISTOS:');
  planejamento.arquivos_previstos.forEach(arquivo => {
    console.log(`  - ${arquivo.caminho_sugerido}`);
  });
  
  console.log(`\nCOMPLEXIDADE: ${planejamento.estimativa_complexidade}`);
});

console.log('\n' + '='.repeat(80));
console.log('TESTES CONCLUÍDOS!');
console.log('='.repeat(80) + '\n');
