// Mini-runner de testes sem dependências. Funciona no navegador (run.html) e no Node (run.mjs).

const testes = [];

export function teste(nome, fn) {
  testes.push({ nome, fn });
}

function mostrar(v) {
  return typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
}

export function igual(atual, esperado, contexto = '') {
  if (!Object.is(atual, esperado)) {
    throw new Error(`${contexto ? contexto + ': ' : ''}esperado ${mostrar(esperado)}, recebido ${mostrar(atual)}`);
  }
}

export function igualProfundo(atual, esperado, contexto = '') {
  const a = JSON.stringify(atual);
  const e = JSON.stringify(esperado);
  if (a !== e) throw new Error(`${contexto ? contexto + ': ' : ''}esperado ${e}, recebido ${a}`);
}

export function verdadeiro(valor, contexto = '') {
  igual(Boolean(valor), true, contexto);
}

export function falso(valor, contexto = '') {
  igual(Boolean(valor), false, contexto);
}

/** Roda todos os testes registrados. Retorna [{ nome, ok, erro }]. */
export async function rodar() {
  const resultados = [];
  for (const t of testes) {
    try {
      await t.fn();
      resultados.push({ nome: t.nome, ok: true });
    } catch (erro) {
      resultados.push({ nome: t.nome, ok: false, erro: erro.message });
    }
  }
  return resultados;
}
