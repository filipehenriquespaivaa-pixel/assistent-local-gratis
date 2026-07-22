// ============================================================
// gerente-arquivos.js
// Controla onde arquivos podem ser criados.
// ============================================================

import path from 'path';

export function validarDestino(contrato, arquivo) {
  if (!contrato.destino) return true;

  const destinoFinal = path.resolve(contrato.destino);
  const arquivoFinal = path.resolve(arquivo);

  return arquivoFinal.startsWith(destinoFinal);
}
