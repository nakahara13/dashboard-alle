import Link from "next/link";

export type TipoOption = { id: number; nome: string };

export function TipoSelect({ types, defaultValue = "", id = "tipo_id" }: { types: TipoOption[]; defaultValue?: string; id?: string }) {
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium">Tipo *</label>
    <select id={id} name="tipo_id" required defaultValue={defaultValue} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
      <option value="" disabled>Selecione o tipo</option>
      {types.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}
    </select>
    <Link href="/tipos" className="mt-2 inline-block text-xs text-accent-ink underline">Cadastrar tipo</Link>
  </div>;
}
