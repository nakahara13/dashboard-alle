export const USER_ROLES = [{ value: "admin", label: "Admin" }, { value: "gestor", label: "Gestor" }] as const;
export type UserInput = { nome: string; email: string; role: string; senha?: string };

export function validateUser(input: UserInput): { nome: string; email: string; role: "admin" | "gestor" } {
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (!nome || nome.length > 255) throw new Error("Informe um nome com até 255 caracteres.");
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if (input.role !== "admin" && input.role !== "gestor") throw new Error("Selecione Admin ou Gestor.");
  return { nome, email, role: input.role };
}
