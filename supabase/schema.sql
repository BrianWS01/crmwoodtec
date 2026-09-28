-- =====================================================================
-- CRM WoodTec Company — schema Supabase
-- Rodar inteiro no SQL Editor. Pode ser rodado de novo sem erro.
-- NÃO contém INSERT de dados: o banco começa vazio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções de trigger
-- ---------------------------------------------------------------------
create or replace function public.tg_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create or replace function public.tg_leads_movido_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etapa is distinct from old.etapa then
    new.movido_em := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabela: leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  nome              text not null,
  cnpj              text,
  telefone          text not null,
  segmento          text not null,
  servico           text,
  responsavel       text,
  etapa             text not null default 'Novo',
  origem            text,
  observacoes       text,
  follow_up_em      date,
  ultimo_contato_em timestamptz,
  movido_em         timestamptz not null default now(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  constraint leads_nome_preenchido     check (length(btrim(nome)) > 0),
  constraint leads_segmento_preenchido check (length(btrim(segmento)) > 0),
  constraint leads_cnpj_formato        check (cnpj ~ '^[0-9]{14}$'),
  -- 55 + DDD (11..99) + 8 ou 9 dígitos
  constraint leads_telefone_formato    check (telefone ~ '^55[1-9][1-9][0-9]{8,9}$'),
  constraint leads_servico_valido      check (servico in (
    'E-commerce','Catálogo','Landing page','Site institucional','Automação','SaaS avulso'
  )),
  constraint leads_etapa_valida        check (etapa in (
    'Novo','Mensagem enviada','Respondeu','Reunião marcada','Proposta enviada','Fechado','Perdido'
  ))
);

-- Duplicados (nomes fixos: o front lê o nome do índice no erro 23505
-- para dizer se o conflito é de CNPJ ou de telefone)
create unique index if not exists leads_user_cnpj_uniq
  on public.leads (user_id, cnpj) where cnpj is not null;
create unique index if not exists leads_user_telefone_uniq
  on public.leads (user_id, telefone);

create index if not exists leads_user_etapa_idx     on public.leads (user_id, etapa);
create index if not exists leads_user_segmento_idx  on public.leads (user_id, segmento);
create index if not exists leads_user_follow_up_idx on public.leads (user_id, follow_up_em)
  where follow_up_em is not null;

drop trigger if exists leads_atualizado_em on public.leads;
create trigger leads_atualizado_em
  before update on public.leads
  for each row execute function public.tg_set_atualizado_em();

drop trigger if exists leads_movido_em on public.leads;
create trigger leads_movido_em
  before update of etapa on public.leads
  for each row execute function public.tg_leads_movido_em();

-- ---------------------------------------------------------------------
-- Tabela: mensagens_padrao
-- ---------------------------------------------------------------------
create table if not exists public.mensagens_padrao (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  titulo           text not null,
  texto            text not null,
  segmento_gatilho text,
  servico_gatilho  text,
  padrao           boolean not null default false,
  criado_em        timestamptz not null default now(),

  constraint mensagens_titulo_preenchido check (length(btrim(titulo)) > 0),
  constraint mensagens_texto_preenchido  check (length(btrim(texto)) > 0),
  constraint mensagens_servico_valido    check (servico_gatilho in (
    'E-commerce','Catálogo','Landing page','Site institucional','Automação','SaaS avulso'
  ))
);

-- No máximo uma mensagem padrão por usuário
create unique index if not exists mensagens_padrao_uma_por_usuario
  on public.mensagens_padrao (user_id) where padrao;

create index if not exists mensagens_padrao_user_idx on public.mensagens_padrao (user_id);

-- ---------------------------------------------------------------------
-- Tabela: historico_contatos
-- ---------------------------------------------------------------------
create table if not exists public.historico_contatos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  lead_id          uuid not null references public.leads (id) on delete cascade,
  data             timestamptz not null default now(),
  mensagem_enviada text,
  etapa_anterior   text,
  etapa_nova       text,

  constraint historico_etapa_anterior_valida check (etapa_anterior in (
    'Novo','Mensagem enviada','Respondeu','Reunião marcada','Proposta enviada','Fechado','Perdido'
  )),
  constraint historico_etapa_nova_valida check (etapa_nova in (
    'Novo','Mensagem enviada','Respondeu','Reunião marcada','Proposta enviada','Fechado','Perdido'
  ))
);

create index if not exists historico_lead_data_idx on public.historico_contatos (lead_id, data desc);
create index if not exists historico_user_data_idx on public.historico_contatos (user_id, data desc);

-- ---------------------------------------------------------------------
-- RLS: cada usuário só enxerga e altera as próprias linhas
-- ---------------------------------------------------------------------
alter table public.leads              enable row level security;
alter table public.mensagens_padrao   enable row level security;
alter table public.historico_contatos enable row level security;

-- leads
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;
create policy leads_select on public.leads for select to authenticated
  using ((select auth.uid()) = user_id);
create policy leads_insert on public.leads for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy leads_update on public.leads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy leads_delete on public.leads for delete to authenticated
  using ((select auth.uid()) = user_id);

-- mensagens_padrao
drop policy if exists mensagens_select on public.mensagens_padrao;
drop policy if exists mensagens_insert on public.mensagens_padrao;
drop policy if exists mensagens_update on public.mensagens_padrao;
drop policy if exists mensagens_delete on public.mensagens_padrao;
create policy mensagens_select on public.mensagens_padrao for select to authenticated
  using ((select auth.uid()) = user_id);
create policy mensagens_insert on public.mensagens_padrao for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy mensagens_update on public.mensagens_padrao for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy mensagens_delete on public.mensagens_padrao for delete to authenticated
  using ((select auth.uid()) = user_id);

-- historico_contatos (além do dono, o lead também precisa ser do usuário)
drop policy if exists historico_select on public.historico_contatos;
drop policy if exists historico_insert on public.historico_contatos;
drop policy if exists historico_update on public.historico_contatos;
drop policy if exists historico_delete on public.historico_contatos;
create policy historico_select on public.historico_contatos for select to authenticated
  using ((select auth.uid()) = user_id);
create policy historico_insert on public.historico_contatos for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.leads l
                where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy historico_update on public.historico_contatos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.leads l
                where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy historico_delete on public.historico_contatos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Funções RPC (SECURITY INVOKER: rodam com as permissões e o RLS do usuário)
-- Cada uma roda numa única transação: se uma parte falha, nada é gravado.
-- ---------------------------------------------------------------------

-- Move o lead de etapa e registra no histórico
create or replace function public.mover_lead(p_lead_id uuid, p_etapa text)
returns public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior text;
  v_lead     public.leads;
begin
  select etapa into v_anterior
    from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;

  if v_anterior = p_etapa then
    select * into v_lead from public.leads where id = p_lead_id;
    return v_lead;
  end if;

  update public.leads set etapa = p_etapa
   where id = p_lead_id
   returning * into v_lead;

  insert into public.historico_contatos (lead_id, etapa_anterior, etapa_nova)
  values (p_lead_id, v_anterior, p_etapa);

  return v_lead;
end;
$$;

-- Registra um envio de WhatsApp: último contato + histórico
-- e, se o lead estava em "Novo", move para "Mensagem enviada"
create or replace function public.registrar_envio(p_lead_id uuid, p_mensagem text)
returns public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior text;
  v_nova     text;
  v_lead     public.leads;
begin
  select etapa into v_anterior
    from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;

  v_nova := case when v_anterior = 'Novo' then 'Mensagem enviada' else v_anterior end;

  update public.leads
     set ultimo_contato_em = now(), etapa = v_nova
   where id = p_lead_id
   returning * into v_lead;

  insert into public.historico_contatos (lead_id, mensagem_enviada, etapa_anterior, etapa_nova)
  values (p_lead_id, p_mensagem, v_anterior, v_nova);

  return v_lead;
end;
$$;

-- Define a mensagem padrão (desmarca a anterior na mesma transação)
create or replace function public.definir_mensagem_padrao(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.mensagens_padrao
     set padrao = false
   where user_id = auth.uid() and padrao and id <> p_id;

  update public.mensagens_padrao
     set padrao = true
   where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'Mensagem não encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões: só usuário autenticado; anon não acessa nada
-- ---------------------------------------------------------------------
revoke all on public.leads, public.mensagens_padrao, public.historico_contatos from anon;
grant select, insert, update, delete
  on public.leads, public.mensagens_padrao, public.historico_contatos
  to authenticated;

revoke execute on function public.mover_lead(uuid, text)         from public, anon;
revoke execute on function public.registrar_envio(uuid, text)    from public, anon;
revoke execute on function public.definir_mensagem_padrao(uuid)  from public, anon;
grant  execute on function public.mover_lead(uuid, text)         to authenticated;
grant  execute on function public.registrar_envio(uuid, text)    to authenticated;
grant  execute on function public.definir_mensagem_padrao(uuid)  to authenticated;
