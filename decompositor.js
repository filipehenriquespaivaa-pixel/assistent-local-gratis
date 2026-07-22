// ============================================================
// decompositor.js
// Divide pedidos complexos em tarefas independentes.
// Um pedido humano pode conter varias operacoes escondidas.
// ============================================================

export function decomporPedido(analise, contrato) {
  const tarefas = [];

  tarefas.push({
    id: 1,
    tipo: 'principal',
    objetivo: analise.objetivo,
    regras: analise.requisitos || []
  });

  if (contrato && contrato.destino) {
    tarefas.push({
      id: 2,
      tipo: 'arquivo',
      objetivo: 'Salvar resultado no destino informado',
      destino: contrato.destino,
      regras: [
        'Usar exatamente o destino informado',
        'Nao criar pastas extras sem autorizacao'
      ]
    });
  }

  tarefas.push({
    id: tarefas.length + 1,
    tipo: 'validacao',
    objetivo: 'Verificar se o resultado atende ao pedido',
    regras: contrato ? contrato.restricoes : []
  });

  return {
    tarefaOriginal: analise.objetivo,
    tarefas
  };
}
