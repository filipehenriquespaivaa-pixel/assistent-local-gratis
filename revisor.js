// ============================================================
// revisor.js — valida resultado antes da entrega
// ============================================================

export function revisarResultado(tipo, resultado, criterios = []) {
  const texto = String(resultado || '');

  const verificacoes = criterios.map(criterio => ({
    criterio,
    atendido: verificar(texto, criterio)
  }));

  return {
    aprovado: verificacoes.every(v => v.atendido),
    verificacoes,
    sugestoes: verificacoes
      .filter(v => !v.atendido)
      .map(v => `Corrigir: ${v.criterio}`)
  };
}

function verificar(texto, criterio) {
  const c = criterio.toLowerCase();

  if (c.includes('inicio, meio e fim')) {
    return /fim|final|conclus[aã]o/i.test(texto);
  }

  if (c.includes('codigo executavel')) {
    return texto.length > 20;
  }

  if (c.includes('testar')) {
    return /teste|validar|verificar/i.test(texto);
  }

  return texto.length > 0;
}
