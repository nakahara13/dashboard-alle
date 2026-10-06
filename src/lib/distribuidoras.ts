// Mantém a mesma validação na criação e na edição pela tabela de distribuidoras.
export function validateDistributorName(value: string) {
  const nome = value.trim();
  if (!nome || nome.length > 255) throw new Error("Informe um nome com até 255 caracteres.");
  return nome;
}
