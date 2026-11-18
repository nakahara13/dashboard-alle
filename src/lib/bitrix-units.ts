export const normalizeUnitName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Correspondências de nomes confirmadas para o cadastro existente.
const aliases = new Map(Object.entries({
  "Glória - Vila Velha - ES": "Gloria - ES",
  "Vila Velha - ES": "Vila Velha Itaparica - ES",
  "Tirol - MG": "Tirol - BH",
  "Vila Zeferina - SP": "Itaquaquecetuba Vila Zeferina - SP",
}).map(([from, to]) => [normalizeUnitName(from), normalizeUnitName(to)]));

export const bitrixUnitName = (name: string) => aliases.get(normalizeUnitName(name)) ?? normalizeUnitName(name);
