"use client";

import { useState } from "react";
import { ManagementDrawer, RecordDetails } from "@/components/management-drawer";
import { RowActions, RowActionButton } from "@/components/row-actions";
import { CommissionForm, type CommissionOptions } from "@/components/commission-forms";
import type { CommissionRow } from "@/lib/comissao-module";
import { formatMoney } from "@/lib/recebimentos-filtros";

const money = (value: string) => formatMoney({ toFixed: () => value });
const dateLabel = (value: string) => value ? value.split("-").reverse().join("/") : "—";

// Detalhes e edição compartilham o drawer, preservando o contexto da consulta.
function CommissionDetails({ row, options, onClose, onSaved, initialEditing }: {
  row: CommissionRow;
  options: CommissionOptions;
  onClose: () => void;
  onSaved: (message: string) => void;
  initialEditing: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  // A consulta preserva todos os dados antes exibidos abaixo da tabela.
  const details = [
    { label: "Cliente / UC", value: `${row.cliente.nome} / ${row.cliente.uc}` },
    { label: "Geradora pagadora", value: row.geradora?.nome ?? "Não informada — selecione ao editar" },
    { label: "Distribuidora da UC", value: row.distribuidora.nome },
    { label: "Unidade Allp Fit de origem", value: row.cliente.unidade?.nome ?? "Não informada" },
    { label: "Gestor / parceiro", value: row.parceiro?.nome ?? "Sem parceiro" },
    { label: "Competência", value: dateLabel(row.competencia) },
    { label: "Economia", value: money(row.valor_economia) },
    { label: "Comissão da empresa", value: money(row.valor_comissao_empresa) },
    { label: "Comissão do parceiro", value: money(row.valor_comissao_parceiro) },
    { label: "Margem", value: money(row.margem) },
    { label: "Recebimento", value: row.status_recebimento },
    { label: "Pagamento", value: row.status_pagamento },
    { label: "Data de recebimento", value: dateLabel(row.data_recebimento) },
    { label: "Data de pagamento", value: dateLabel(row.data_pagamento) },
    { label: "Entrada vinculada", value: row.entrada_id ? `#${row.entrada_id}` : "Sem vínculo" },
    { label: "Saída vinculada", value: row.saida_id ? `#${row.saida_id}` : "Sem vínculo" },
  ];
  return <ManagementDrawer title={editing ? "Editar comissão" : "Detalhes da comissão"} onClose={onClose} onSaved={onSaved}>
    <div className="p-5 sm:p-6">
      {/* A edição reutiliza o formulário e as validações existentes, sem sair da visão geral. */}
      {editing ? <CommissionForm options={options} row={row} /> : <>
        <RecordDetails items={details} />
        {Number(row.margem) <= 0 && <p role="status" className="mt-5 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">Atenção: margem zero ou negativa.</p>}
        <button type="button" onClick={() => setEditing(true)} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Editar comissão</button>
      </>}
    </div>
  </ManagementDrawer>;
}

// Monta apenas o painel da linha selecionada.
export function CommissionRowActions({ row, options }: { row: CommissionRow; options: CommissionOptions }) {
  const [mode, setMode] = useState<"view" | "edit" | null>(null);
  const [message, setMessage] = useState("");
  return <>
    <RowActions label={row.cliente.nome}>
      <RowActionButton action="view" label={row.cliente.nome} aria-haspopup="dialog" onClick={() => { setMessage(""); setMode("view"); }} />
      <RowActionButton action="edit" label={row.cliente.nome} aria-haspopup="dialog" onClick={() => { setMessage(""); setMode("edit"); }} />
    </RowActions>
    {message && <p role="status" className="mt-2 text-xs text-accent-ink">{message}</p>}
    {mode && <CommissionDetails row={row} options={options} initialEditing={mode === "edit"} onClose={() => setMode(null)} onSaved={setMessage} />}
  </>;
}
