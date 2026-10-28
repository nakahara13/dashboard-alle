import { revalidatePath } from "next/cache";

export function refreshClientPages() {
  for (const path of ["/", "/cadastros/clientes", "/cadastros/clientes/visao-geral", "/cadastros/clientes/cruzamento", "/comissoes", "/comissoes/nova", "/comissoes/importar"]) revalidatePath(path);
}
