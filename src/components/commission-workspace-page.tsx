import Link from "next/link";
import type { ReactNode } from "react";
import { loadCommissionOptions } from "@/lib/commission-options";
import type { CommissionOptions } from "@/components/commission-forms";

// Compartilha título, carregamento e tratamento de falhas entre as páginas separadas.
export async function CommissionWorkspacePage({ title, description, children, action }: {
  action?: (options: CommissionOptions) => ReactNode;
  title: string;
  description: string;
  children: (options: CommissionOptions) => ReactNode;
}) {
  let options;
  try { options = await loadCommissionOptions(); } catch {
    return <div className="space-y-6"><h1 className="text-3xl font-semibold">{title}</h1><p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger-ink">Não foi possível carregar os cadastros. Verifique a conexão e tente novamente.</p></div>;
  }
  return <div className="mx-auto w-full max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="border-l-4 border-accent pl-3 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm text-muted-ink">{description}</p></div>{action?.(options)}</div>
    {children(options)}
    <Link href="/comissoes" className="inline-block text-sm text-accent-ink underline">Ver comissões</Link>
  </div>;
}
