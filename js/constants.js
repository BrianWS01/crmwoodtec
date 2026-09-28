// Listas fixas do CRM. Módulo puro (sem DOM): usado pelo front e pelos testes.
// Os valores de ETAPAS e SERVICOS precisam bater com os CHECKs do schema.sql.

export const ETAPAS = [
  'Novo',
  'Mensagem enviada',
  'Respondeu',
  'Reunião marcada',
  'Proposta enviada',
  'Fechado',
  'Perdido',
];

export const ETAPA_INICIAL = 'Novo';

// Etapas finais: sem botão "Disparar" no pipeline
export const ETAPAS_FINAIS = ['Fechado', 'Perdido'];

export const SERVICOS = [
  'E-commerce',
  'Catálogo',
  'Landing page',
  'Site institucional',
  'Automação',
  'SaaS avulso',
];

// Sugestões iniciais do campo Segmento (somadas aos segmentos já cadastrados)
export const SEGMENTOS_SUGERIDOS = [
  'Clínica médica',
  'Clínica odontológica',
  'Petshop',
  'Advocacia',
];

// Nomes dos índices únicos do schema.sql (usados para traduzir o erro 23505)
export const INDICE_CNPJ = 'leads_user_cnpj_uniq';
export const INDICE_TELEFONE = 'leads_user_telefone_uniq';
