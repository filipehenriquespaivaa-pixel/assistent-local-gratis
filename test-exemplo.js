import { interpretarPedido, salvarPlanejamento, formatarPlanejamentoTexto } from './interpretador.js';

// Teste 1: Caminho Windows completo
const pedido1 = "Criar uma história simples em D:\\ia local\\historias";
console.log("\n=== TESTE 1 ===");
console.log("Pedido:", pedido1);
const planejamento1 = interpretarPedido(pedido1);
salvarPlanejamento(planejamento1);
console.log(formatarPlanejamentoTexto(planejamento1));

// Teste 2: Outro caminho Windows
const pedido2 = "Criar um jogo da cobrinha em python simples na pasta C:\\meus_jogos";
console.log("\n=== TESTE 2 ===");
console.log("Pedido:", pedido2);
const planejamento2 = interpretarPedido(pedido2);
salvarPlanejamento(planejamento2);
console.log(formatarPlanejamentoTexto(planejamento2));

// Teste 3: Caminho com espaços
const pedido3 = "Escrever um conto de terror em D:\\documentos\\stories\\terror";
console.log("\n=== TESTE 3 ===");
console.log("Pedido:", pedido3);
const planejamento3 = interpretarPedido(pedido3);
salvarPlanejamento(planejamento3);
console.log(formatarPlanejamentoTexto(planejamento3));

console.log("\n✅ Planejamentos salvos em planejamento.json");
console.log("Execute: cat planejamento.json | jq .ultimo_planejamento.interpretacao");
