// ============================================================
// regras-execucao.js
// Regras de seguranca para execucao de tarefas.
// ============================================================

export function validarExecucao(contrato, plano) {
  const erros = [];

  if (contrato.usarDestinoInformado && !plano.destino) {
    erros.push('Plano nao possui o destino informado pelo usuario');
  }

  if (plano.criarPastas && !contrato.criarPastasExtras) {
    erros.push('Tentativa de criar pastas extras sem autorizacao');
  }

  return {
    permitido: erros.length === 0,
    erros
  };
}
