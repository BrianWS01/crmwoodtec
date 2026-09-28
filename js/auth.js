// Login, sessão e saída.
import { supabase, mensagemDeErro } from './supabase.js';
import { carregando } from './ui.js';

const PAGINA_LOGIN = 'index.html';
const PAGINA_APP = 'app.html';

/** Tela de login (index.html). Se já houver sessão, vai direto para o app. */
export async function iniciarLogin() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.replace(PAGINA_APP);
    return;
  }

  const form = document.getElementById('form-login');
  const alerta = document.getElementById('login-erro');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    alerta.classList.add('d-none');

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const restaurar = carregando(form.querySelector('button[type="submit"]'), 'Entrando...');
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.senha.value,
    });
    restaurar();

    if (error) {
      alerta.textContent = mensagemDeErro(error, 'Login');
      alerta.classList.remove('d-none');
      form.senha.focus();
      return;
    }
    window.location.replace(PAGINA_APP);
  });
}

/**
 * Garante que há sessão no app.html. Sem sessão, volta para o login.
 * Retorna o usuário logado.
 */
export async function exigirSessao() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.replace(PAGINA_LOGIN);
    return null;
  }
  // Se a sessão expirar ou o usuário sair em outra aba, volta para o login.
  supabase.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'SIGNED_OUT' || !sessao) window.location.replace(PAGINA_LOGIN);
  });
  return data.session.user;
}

export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[Sair]', error);
  window.location.replace(PAGINA_LOGIN);
}
