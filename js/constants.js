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

// Depois de quantos envios sem resposta o CRM sugere marcar como "Perdido"
export const TENTATIVAS_MAX = 3;

// Etapas de prospecção: o lead ainda não respondeu
export const ETAPAS_PROSPECCAO = ['Novo', 'Mensagem enviada'];

// Variáveis aceitas nas mensagens padrão (com ou sem acento)
export const VARIAVEIS_MENSAGEM = [
  ['{saudacao}', 'Bom dia / Boa tarde / Boa noite, conforme o horário'],
  ['{responsavel}', 'Primeiro nome do responsável (some com a vírgula se estiver vazio)'],
  ['{empresa}', 'Nome da empresa (também aceita {nome})'],
  ['{segmento}', 'Segmento do lead'],
  ['{servico}', 'Serviço do lead'],
  ['{cidade}', 'Cidade do lead'],
  ['{vendedor}', 'Primeiro nome de quem está enviando'],
];
