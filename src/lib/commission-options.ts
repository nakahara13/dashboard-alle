import "server-only";
import { getPrisma } from "@/lib/prisma";

// Centraliza os vínculos necessários às páginas de comissões e cadastros.
export async function loadCommissionOptions() {
  const db = getPrisma();
  const [clients, generators, distributors, units, partners, accounts, methods] = await Promise.all([
    db.cliente.findMany({ include: { unidade: true }, orderBy: { nome: "asc" } }),
    db.geradora.findMany({ orderBy: { nome: "asc" } }),
    db.distribuidora.findMany({ orderBy: { nome: "asc" } }),
    db.unidadeAllpFit.findMany({ orderBy: { nome: "asc" } }),
    db.parceiro.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.contaBancaria.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    db.metodoPagamento.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  return { clients, generators, distributors, units, partners, accounts, methods };
}
