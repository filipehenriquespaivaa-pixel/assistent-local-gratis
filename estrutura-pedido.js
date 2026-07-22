// ============================================================
// estrutura-pedido.js
// Modelo de memoria para pedidos compostos.
// ============================================================

export function criarEstruturaPedido() {
  return {
    pedidoOriginal: '',
    objetivoPrincipal: '',
    tarefas: [],
    regras: [],
    restricoes: [],
    destino: null,
    resultadoEsperado: ''
  };
}

export function adicionarTarefa(estrutura, tarefa) {
  estrutura.tarefas.push(tarefa);
  return estrutura;
}
