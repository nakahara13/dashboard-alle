import Link from "next/link";

export type PaymentMethodOption = { id: number; nome: string };

export function PaymentMethodSelect({ methods, defaultValue = "", id = "metodo_id" }: { methods: PaymentMethodOption[]; defaultValue?: string; id?: string }) {
  return <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium">Método de pagamento *</label>
    <select id={id} name="metodo_id" required defaultValue={defaultValue} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
      <option value="" disabled>Selecione o método</option>
      {methods.map((method) => <option key={method.id} value={method.id}>{method.nome}</option>)}
    </select>
    <Link href="/metodos-de-pagamento" className="mt-2 inline-block text-xs text-accent-ink underline">Cadastrar método de pagamento</Link>
  </div>;
}
