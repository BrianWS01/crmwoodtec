// Helpers de interface: toasts, confirmação, estados vazios e validação de formulário.
// Usa o Bootstrap carregado globalmente (window.bootstrap).

export function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------
const CORES_TOAST = {
  sucesso: 'text-bg-success',
  erro: 'text-bg-danger',
  aviso: 'text-bg-warning',
  info: 'text-bg-primary',
};

function containerToasts() {
  let el = document.getElementById('toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toasts';
    el.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/** tipo: 'sucesso' | 'erro' | 'aviso' | 'info' */
export function toast(mensagem, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `toast align-items-center border-0 ${CORES_TOAST[tipo] ?? CORES_TOAST.info}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(mensagem)}</div>
      <button type="button" class="btn-close ${tipo === 'aviso' ? '' : 'btn-close-white'} me-2 m-auto"
              data-bs-dismiss="toast" aria-label="Fechar"></button>
    </div>`;
  containerToasts().appendChild(el);
  const t = new bootstrap.Toast(el, { delay: tipo === 'erro' ? 7000 : 4000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

// ---------------------------------------------------------------------
// Confirmação (modal reutilizável)
// ---------------------------------------------------------------------

/** Abre um modal de confirmação. Resolve true se o usuário confirmar. */
export function confirmar({ titulo = 'Confirmar', mensagem, textoBotao = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal fade';
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title fs-5">${escapeHtml(titulo)}</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">${escapeHtml(mensagem)}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-acao="ok">${escapeHtml(textoBotao)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el);
    let confirmado = false;
    el.querySelector('[data-acao="ok"]').addEventListener('click', () => {
      confirmado = true;
      modal.hide();
    });
    el.addEventListener('hidden.bs.modal', () => {
      modal.dispose();
      el.remove();
      resolve(confirmado);
    });
    modal.show();
  });
}

// ---------------------------------------------------------------------
// Estado vazio
// ---------------------------------------------------------------------

/**
 * Renderiza um estado vazio dentro de `container`.
 * acoes: [{ texto, icone, onClick, classe }]
 */
export function estadoVazio(container, { icone = 'bi-inbox', titulo, texto = '', acoes = [] }) {
  container.innerHTML = `
    <div class="estado-vazio text-center text-body-secondary py-5 px-3">
      <i class="bi ${icone} fs-1 d-block mb-2" aria-hidden="true"></i>
      <p class="fw-semibold mb-1 text-body">${escapeHtml(titulo)}</p>
      ${texto ? `<p class="mb-3">${escapeHtml(texto)}</p>` : ''}
      <div class="d-flex gap-2 justify-content-center flex-wrap"></div>
    </div>`;
  const barra = container.querySelector('.d-flex');
  for (const a of acoes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.classe ?? 'btn-primary'}`;
    b.innerHTML = `${a.icone ? `<i class="bi ${a.icone} me-1" aria-hidden="true"></i>` : ''}${escapeHtml(a.texto)}`;
    b.addEventListener('click', a.onClick);
    barra.appendChild(b);
  }
}

// ---------------------------------------------------------------------
// Validação de formulário (classes do Bootstrap)
// ---------------------------------------------------------------------

export function limparValidacao(form, nome = null) {
  const alvo = nome ? [form.elements[nome]].filter(Boolean) : form.querySelectorAll('.is-invalid');
  alvo.forEach((el) => el.classList.remove('is-invalid'));
}

/** Marca o campo `nome` do form como inválido com a mensagem. */
export function marcarInvalido(form, nome, mensagem) {
  const campo = form.elements[nome];
  if (!campo) return;
  campo.classList.add('is-invalid');
  const fb = form.querySelector(`.invalid-feedback[data-campo="${nome}"]`);
  if (fb) fb.textContent = mensagem;
}

/** Marca vários campos e foca o primeiro. */
export function mostrarErros(form, erros) {
  limparValidacao(form);
  const nomes = Object.keys(erros);
  nomes.forEach((n) => marcarInvalido(form, n, erros[n]));
  if (nomes.length) form.elements[nomes[0]]?.focus();
}

/** Coloca o botão em estado "carregando" e devolve uma função que restaura. */
export function carregando(botao, texto = 'Salvando...') {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${escapeHtml(texto)}`;
  return () => {
    botao.disabled = false;
    botao.innerHTML = original;
  };
}
