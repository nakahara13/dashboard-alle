"use client";

import { useEffect, useRef, useState } from "react";
import { CommissionForm, type CommissionOptions } from "@/components/commission-forms";
import type { CommissionRow } from "@/lib/comissao-module";
import { formatMoney } from "@/lib/recebimentos-filtros";

const money = (value: string) => formatMoney({ toFixed: () => value });
const dateLabel = (value: string) => value ? value.split("-").reverse().join("/") : "—";

// O diálogo nativo mantém o foco no pop-up, fecha com Escape e devolve o foco à ação da linha.
function CommissionModal({ row, options, onClose }: {
  row: CommissionRow;
  options: CommissionOptions;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const titleId = `commission-modal-${row.id}-title`;
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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
  // O cleanup do efeito também dispara o evento nativo close no Strict Mode.
  // Apenas ações do usuário alteram o estado, evitando que esse evento atrasado desmonte o modal reaberto.
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    onClose();
  }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto whitespace-normal rounded-2xl border border-line bg-surface p-0 text-primary shadow-xl backdrop:bg-black/50">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface p-5 sm:p-6">
      <div><h2 id={titleId} className="text-lg font-semibold">{editing ? "Editar comissão" : "Detalhes da comissão"}</h2><p className="mt-1 text-sm text-muted-ink">{row.cliente.nome} · {row.cliente.uc} · {dateLabel(row.competencia)}</p></div>
      <button type="button" onClick={onClose} aria-label="Fechar modal de comissão" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-muted">Fechar</button>
    </header>
    <div className="p-5 sm:p-6">
      {/* A edição reutiliza o formulário e as validações existentes, sem sair da visão geral. */}
      {editing ? <CommissionForm options={options} row={row} /> : <>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">{details.map((item) => <div key={item.label}><dt className="text-muted-ink">{item.label}</dt><dd className="mt-1 break-words font-medium">{item.value}</dd></div>)}</dl>
        {row.parceiro_id && Number(row.margem) <= 0 && <p role="status" className="mt-5 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">Atenção: margem zero ou negativa.</p>}
        <button type="button" onClick={() => setEditing(true)} className="mt-6 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover">Editar comissão</button>
      </>}
    </div>
  </dialog>;
}

// Monta apenas o modal da linha selecionada; fechar descarta a edição ainda não salva.
export function CommissionRowActions({ row, options }: { row: CommissionRow; options: CommissionOptions }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="text-accent-ink underline">Detalhes / editar</button>
    {open && <CommissionModal row={row} options={options} onClose={() => setOpen(false)} />}
  </>;
}
