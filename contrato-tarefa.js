// ============================================================
// contrato-tarefa.js
// Define regras fixas antes da execucao.
// O agente deve obedecer este contrato.
// ============================================================

export function criarContrato(analise, pedido) {
  const texto = String(pedido || '');
  const caminho = extrairCaminhoWindows(texto);

  return {
    objetivo: analise.objetivo,
    tipo: analise.tipo,
    destino: caminho || null,
    usarDestinoInformado: !!caminho,
    criarPastasExtras: false,
    restricoes: [
      'Respeitar caminho informado pelo usuario',
      'Nao criar arquivos fora do destino',
      'Nao criar arquitetura maior que a solicitada'
    ],
    aprovado: false
  };
}

function extrairCaminhoWindows(texto) {
  const match = texto.match(/[A-Za-z]:\\[^\n]+/);
  return match ? match[0].trim() : null;
}
