"use client";

import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Valores fictícios em centavos; cada posição representa um horário do dia.
const samples = [
  { entries: [0, 320000, 185000, 450000, 275000, 120000], exits: [0, 80000, 140000, 65000, 210000, 95000], alerts: 3 },
  { entries: [0, 150000, 90000, 220000, 75000, 180000], exits: [0, 200000, 120000, 175000, 95000, 210000], alerts: 5 },
  { entries: [0, 210000, 135000, 320000, 185000, 90000], exits: [0, 65000, 105000, 90000, 150000, 45000], alerts: 2 },
];

function previousDay(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function Dashboard({ today }: { today: string }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const sampleIndex = samples.findIndex((_, index) => previousDay(today, index) === selectedDate);
  const sample = samples[sampleIndex];
  const entries = sample?.entries.reduce((sum, value) => sum + value, 0) ?? 0;
  const exits = sample?.exits.reduce((sum, value) => sum + value, 0) ?? 0;
  let runningEntries = 0;
  let runningExits = 0;
  const series = ["08h", "10h", "12h", "14h", "16h", "18h"].map((hour, index) => {
    runningEntries += sample?.entries[index] ?? 0;
    runningExits += sample?.exits[index] ?? 0;
    return { hour, entries: runningEntries / 100, exits: runningExits / 100, balance: (runningEntries - runningExits) / 100 };
  });
  const cards = [
    { title: "Balanço", value: entries - exits, key: "balance", description: "Entradas menos saídas do dia", color: "#ea580c" },
    { title: "Entradas", value: entries, key: "entries", description: "Total de recebimentos do dia", color: "#f97316" },
    { title: "Saídas", value: exits, key: "exits", description: "Total de pagamentos do dia", color: "#a8a29e" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-3"><span aria-hidden="true" className="h-7 w-1 rounded-full bg-orange-500" /><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1></div>
          <p className="mt-3 text-sm text-stone-500">Seu resumo financeiro do dia.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="dashboard-date" className="mb-2 block text-xs font-medium text-stone-500">Filtrar por dia</label>
            <input id="dashboard-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-11 min-w-0 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700" />
          </div>
          <button type="button" onClick={() => setSelectedDate(today)} className="min-h-11 rounded-lg border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100">Hoje</button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 font-medium text-purple-700"><span aria-hidden="true" className="size-1.5 rounded-full bg-purple-400" />Demonstração</span>
        <span>Dados fictícios disponíveis para hoje e os dois dias anteriores.</span>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedDate ? `Resumo de ${selectedDate}: ${sample?.alerts ?? 0} alertas. Balanço ${currency.format((entries - exits) / 100)}. Entradas ${currency.format(entries / 100)}. Saídas ${currency.format(exits / 100)}.` : "Selecione um dia para visualizar o resumo."}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        <article className="flex min-h-64 flex-col rounded-2xl border border-orange-200 bg-white p-6 shadow-sm shadow-orange-100/30">
          <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-stone-500">Alertas</h2><span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></span></div>
          <p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums">{sample?.alerts ?? 0}</p>
          <p className="mt-2 text-xs text-stone-400">Pendências do dia selecionado</p>
          <div className="mt-auto pt-6"><p className="rounded-lg bg-orange-50 px-3 py-2.5 text-xs text-orange-800">{sample ? "Pendências que precisam de atenção." : "Nenhum alerta de demonstração neste dia."}</p></div>
        </article>
        {cards.map((card) => (
          <article key={card.key} className="min-w-0 rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm shadow-stone-100">
            <div className="flex min-h-9 items-center justify-between"><h2 className="text-sm font-medium text-stone-500">{card.title}</h2><span aria-hidden="true" className="rounded-lg bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-400">R$</span></div>
            <p className="mt-5 text-2xl font-semibold tracking-tight tabular-nums">{currency.format(card.value / 100)}</p>
            <p className="mt-2 text-xs text-stone-400">{card.description}</p>
            <div className="mt-5 h-20 min-w-0" aria-label={`${card.title}: evolução acumulada ao longo do dia`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={series} margin={{ top: 5, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
                  <XAxis dataKey="hour" hide />
                  <Tooltip formatter={(value) => currency.format(Number(value))} labelFormatter={(label) => `Acumulado até ${label}`} contentStyle={{ borderRadius: 12, borderColor: "#e7e5e4", fontSize: 12 }} />
                  <Area type="linear" dataKey={card.key} name={card.title} stroke={card.color} fill={card.color} fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-stone-400"><span>08h</span><span>Acumulado do dia</span><span>18h</span></div>
          </article>
        ))}
      </div>
      {!sample && <p role="status" className="mt-5 text-sm text-stone-500">{selectedDate ? "Sem dados de demonstração para este dia." : "Selecione um dia para visualizar o resumo."}</p>}
    </div>
  );
}
