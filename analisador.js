// ============================================================
// analisador.js — camada de entendimento antes do planejamento
// Analisa objetivo, requisitos e critérios de sucesso.
// ============================================================

export function analisarPedido(pedido) {
  const texto = String(pedido || '').toLowerCase();

  let tipo = 'geral';
  if (/hist[oó]ria|conto|roteiro|texto/.test(texto)) tipo = 'escrita';
  if (/c[oó]digo|programa|site|jogo|app|sistema/.test(texto)) tipo = 'programacao';

  const requisitos = [];
  const criterios = [];

  if (tipo === 'escrita') {
    requisitos.push('possuir inicio, meio e fim');
    requisitos.push('apresentar personagens e conflito');
    criterios.push('estrutura narrativa completa');
    criterios.push('final coerente');
  }

  if (tipo === 'programacao') {
    requisitos.push('entender a necessidade antes de codificar');
    requisitos.push('definir funcionamento esperado');
    requisitos.push('verificar se a solução atende ao pedido');
    criterios.push('codigo executavel');
    criterios.push('testar funcionalidades principais');
  }

  return {
    tipo,
    objetivo: pedido,
    requisitos,
    criteriosSucesso: criterios
  };
}
