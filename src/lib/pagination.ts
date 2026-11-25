export type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

export function compactPagination(page: number, pages: number): PaginationItem[] {
  const visible = new Set<number>();
  for (let number = 1; number <= Math.min(3, pages); number++) visible.add(number);
  for (let number = Math.max(1, pages - 2); number <= pages; number++) visible.add(number);
  for (let number = Math.max(1, page - 1); number <= Math.min(pages, page + 1); number++) visible.add(number);
  const sorted = [...visible].sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  let gaps = 0;
  for (const [index, number] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && number - previous === 2) result.push(previous + 1);
    else if (previous !== undefined && number - previous > 2) result.push(gaps++ === 0 ? "ellipsis-start" : "ellipsis-end");
    result.push(number);
  }
  return result;
}

export function paginationJumpTarget(href: string, pageParamName = "pagina") {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex < 0 ? "" : href.slice(hashIndex);
  const withoutHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex < 0 ? "" : withoutHash.slice(queryIndex + 1));
  return { action: `${path}${hash}`, fields: [...params].filter(([name]) => name !== pageParamName) };
}
