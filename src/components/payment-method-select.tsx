import Link from "next/link";

export type PaymentMethodOption = { id: number; nome: string };

export function PaymentMethodSelect({ methods }: { methods: PaymentMethodOption[] }) {
  return <div>
    <label htmlFor="metodo_id" className="mb-2 block text-sm font-medium">Método de pagamento *</label>
    <select id="metodo_id" name="metodo_id" required defaultValue="" className="min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm">
      <option value="" disabled>Selecione o método</option>
      {methods.map((method) => <option key={method.id} value={method.id}>{method.nome}</option>)}
    </select>
    <Link href="/metodos-de-pagamento" className="mt-2 inline-block text-xs text-orange-700 underline">Cadastrar método de pagamento</Link>
  </div>;
}
