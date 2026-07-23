// ============================================================
// test-interpretador.js — Teste do módulo interpretador
// Executa testes com exemplos de pedidos
// ============================================================

import { interpretarPedido, salvarPlanejamento, formatarPlanejamentoTexto, carregarPlanejamentos } from './interpretador.js';

console.log('\n' + '='.repeat(70));
console.log('TESTE DO INTERPRETADOR DE PEDIDOS');
console.log('='.repeat(70) + '\n');

// Exemplo 1: Criar história simples
const pedido1 = 'Criar uma historia simples em local x';
console.log(`\n📝 PEDIDO 1: ${pedido1}`);
console.log('-'.repeat(70));
const planejamento1 = interpretarPedido(pedido1);
console.log(formatarPlanejamentoTexto(planejamento1));

// Exemplo 2: Criar jogo HTML
const pedido2 = 'Criar um codigo html de um jogo em local x';
console.log(`\n📝 PEDIDO 2: ${pedido2}`);
console.log('-'.repeat(70));
const planejamento2 = interpretarPedido(pedido2);
console.log(formatarPlanejamentoTexto(planejamento2));

// Exemplo 3: Pedido com preferências
const pedido3 = 'Criar uma história infantil simples em português no formato html';
console.log(`\n📝 PEDIDO 3: ${pedido3}`);
console.log('-'.repeat(70));
const planejamento3 = interpretarPedido(pedido3);
console.log(formatarPlanejamentoTexto(planejamento3));

// Exemplo 4: Pedido complexo com destino
const pedido4 = 'Criar um jogo da cobrinha em python simples na pasta jogos';
console.log(`\n📝 PEDIDO 4: ${pedido4}`);
console.log('-'.repeat(70));
const planejamento4 = interpretarPedido(pedido4);
console.log(formatarPlanejamentoTexto(planejamento4));

// Salvar todos os planejamentos
console.log('\n' + '='.repeat(70));
console.log('SALVANDO PLANEJAMENTOS...');
console.log('='.repeat(70));

for (const p of [planejamento1, planejamento2, planejamento3, planejamento4]) {
  const resultado = salvarPlanejamento(p);
  console.log(`✓ ${resultado.mensagem}`);
}

// Carregar e mostrar histórico
console.log('\n' + '='.repeat(70));
console.log('CARREGANDO HISTÓRICO DE PLANEJAMENTOS...');
console.log('='.repeat(70));

const historico = carregarPlanejamentos();
console.log(`\n${historico.mensagem}`);

if (historico.historico && historico.historico.length > 0) {
  console.log(`\n📋 Último planejamento salvo:`);
  console.log(formatarPlanejamentoTexto(historico.ultimo));
}

console.log('\n' + '='.repeat(70));
console.log('TESTES CONCLUÍDOS COM SUCESSO!');
console.log('='.repeat(70) + '\n');
