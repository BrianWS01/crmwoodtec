-- =====================================================================
-- CRM WoodTec Company — schema Supabase
-- Rodar inteiro no SQL Editor. Pode ser rodado de novo sem erro
-- (também serve para atualizar um banco criado com a versão anterior).
-- NÃO contém INSERT de leads: o banco começa vazio. Só entram as
-- configurações padrão da cadência de follow-up.
--
-- Modelo de acesso: EQUIPE. Todo usuário cadastrado em Authentication
-- vira membro (tabela membros) e enxerga os mesmos leads. Por isso o
-- cadastro público precisa ficar DESLIGADO no Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares
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

-- "Hoje" no fuso de São Paulo (o servidor roda em UTC)
create or replace function public.hoje_sp()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------
-- Tabela: membros (a equipe)
-- ---------------------------------------------------------------------
create table if not exists public.membros (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nome      text not null,
  email     text,
  criado_em timestamptz not null default now(),
  constraint membros_nome_preenchido check (length(btrim(nome)) > 0)
);

-- É membro da equipe? SECURITY DEFINER para ler membros sem cair no próprio RLS.
create or replace function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.membros where user_id = auth.uid());
$$;

-- Todo usuário criado em Authentication vira membro automaticamente
create or replace function public.tg_novo_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.membros (user_id, nome, email)
  values (new.id, split_part(coalesce(new.email, 'Usuário'), '@', 1), new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_novo_membro on auth.users;
create trigger auth_novo_membro
  after insert on auth.users
  for each row execute function public.tg_novo_membro();

-- Quem já existia antes do trigger
insert into public.membros (user_id, nome, email)
select id, split_part(coalesce(email, 'Usuário'), '@', 1), email from auth.users
on conflict (user_id) do nothing;

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

-- Colunas da versão 2 (equipe, cadência, dados do CNPJ)
alter table public.leads add column if not exists vendedor_id uuid
  default auth.uid() references auth.users (id) on delete set null;
alter table public.leads add column if not exists tentativas int not null default 0;
alter table public.leads add column if not exists email  text;
alter table public.leads add column if not exists cidade text;
alter table public.leads add column if not exists uf     text;

update public.leads set vendedor_id = user_id where vendedor_id is null;

alter table public.leads drop constraint if exists leads_uf_formato;
alter table public.leads add constraint leads_uf_formato check (uf ~ '^[A-Z]{2}$');
alter table public.leads drop constraint if exists leads_tentativas_positivas;
alter table public.leads add constraint leads_tentativas_positivas check (tentativas >= 0);

-- Duplicados: valem para a equipe toda (nomes fixos: o front lê o nome do
-- índice no erro 23505 para dizer se o conflito é de CNPJ ou de telefone)
drop index if exists public.leads_user_cnpj_uniq;
drop index if exists public.leads_user_telefone_uniq;
create unique index leads_user_cnpj_uniq     on public.leads (cnpj) where cnpj is not null;
create unique index leads_user_telefone_uniq on public.leads (telefone);

create index if not exists leads_user_etapa_idx     on public.leads (user_id, etapa);
create index if not exists leads_user_segmento_idx  on public.leads (user_id, segmento);
create index if not exists leads_user_follow_up_idx on public.leads (user_id, follow_up_em)
  where follow_up_em is not null;
create index if not exists leads_vendedor_idx       on public.leads (vendedor_id);

drop trigger if exists leads_atualizado_em on public.leads;
create trigger leads_atualizado_em
  before update on public.leads
  for each row execute function public.tg_set_atualizado_em();

drop trigger if exists leads_movido_em on public.leads;
create trigger leads_movido_em
  before update of etapa on public.leads
  for each row execute function public.tg_leads_movido_em();

-- ---------------------------------------------------------------------
-- Tabela: cadencia (dias até o próximo follow-up quando o lead entra na etapa)
-- dias null = não agenda sozinho
-- ---------------------------------------------------------------------
create table if not exists public.cadencia (
  etapa text primary key,
  dias  int,
  constraint cadencia_etapa_valida check (etapa in (
    'Novo','Mensagem enviada','Respondeu','Reunião marcada','Proposta enviada','Fechado','Perdido'
  )),
  constraint cadencia_dias_validos check (dias between 0 and 90)
);

insert into public.cadencia (etapa, dias) values
  ('Novo', null),
  ('Mensagem enviada', 2),
  ('Respondeu', 1),
  ('Reunião marcada', null),
  ('Proposta enviada', 3),
  ('Fechado', null),
  ('Perdido', null)
on conflict (etapa) do nothing;

-- Data do próximo follow-up para a etapa (null = sem agendamento automático)
create or replace function public.follow_up_da_etapa(p_etapa text)
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when p_etapa in ('Fechado', 'Perdido') then null
    else public.hoje_sp() + (select c.dias from public.cadencia c where c.etapa = p_etapa)
  end;
$$;

-- Lead novo sem follow-up recebe o da cadência da etapa
create or replace function public.tg_leads_follow_up_inicial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.follow_up_em is null then
    new.follow_up_em := public.follow_up_da_etapa(new.etapa);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_follow_up_inicial on public.leads;
create trigger leads_follow_up_inicial
  before insert on public.leads
  for each row execute function public.tg_leads_follow_up_inicial();

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

alter table public.mensagens_padrao add column if not exists etapa_gatilho text;
alter table public.mensagens_padrao drop constraint if exists mensagens_etapa_valida;
alter table public.mensagens_padrao add constraint mensagens_etapa_valida check (etapa_gatilho in (
  'Novo','Mensagem enviada','Respondeu','Reunião marcada','Proposta enviada','Fechado','Perdido'
));

-- No máximo uma mensagem padrão para a equipe
drop index if exists public.mensagens_padrao_uma_por_usuario;
create unique index if not exists mensagens_padrao_unica
  on public.mensagens_padrao ((true)) where padrao;

create index if not exists mensagens_padrao_user_idx on public.mensagens_padrao (user_id);

-- ---------------------------------------------------------------------
-- Tabela: historico_contatos (linha do tempo do lead)
-- tipo: 'etapa' (mudou de etapa), 'envio' (WhatsApp), 'nota' (anotação)
-- user_id = quem fez
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

alter table public.historico_contatos add column if not exists tipo text not null default 'etapa';
alter table public.historico_contatos add column if not exists nota text;
update public.historico_contatos set tipo = 'envio'
 where mensagem_enviada is not null and tipo = 'etapa';
alter table public.historico_contatos drop constraint if exists historico_tipo_valido;
alter table public.historico_contatos add constraint historico_tipo_valido
  check (tipo in ('etapa', 'envio', 'nota'));

create index if not exists historico_lead_data_idx on public.historico_contatos (lead_id, data desc);
create index if not exists historico_user_data_idx on public.historico_contatos (user_id, data desc);

-- ---------------------------------------------------------------------
-- RLS: membros da equipe enxergam e alteram tudo; quem não é membro, nada
-- ---------------------------------------------------------------------
alter table public.membros            enable row level security;
alter table public.leads              enable row level security;
alter table public.cadencia           enable row level security;
alter table public.mensagens_padrao   enable row level security;
alter table public.historico_contatos enable row level security;

-- membros
drop policy if exists membros_select on public.membros;
drop policy if exists membros_update on public.membros;
create policy membros_select on public.membros for select to authenticated
  using ((select public.eh_membro()));
create policy membros_update on public.membros for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- leads
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;
create policy leads_select on public.leads for select to authenticated
  using ((select public.eh_membro()));
create policy leads_insert on public.leads for insert to authenticated
  with check ((select public.eh_membro()) and (select auth.uid()) = user_id);
create policy leads_update on public.leads for update to authenticated
  using ((select public.eh_membro()))
  with check ((select public.eh_membro()));
create policy leads_delete on public.leads for delete to authenticated
  using ((select public.eh_membro()));

-- cadencia
drop policy if exists cadencia_select on public.cadencia;
drop policy if exists cadencia_update on public.cadencia;
create policy cadencia_select on public.cadencia for select to authenticated
  using ((select public.eh_membro()));
create policy cadencia_update on public.cadencia for update to authenticated
  using ((select public.eh_membro()))
  with check ((select public.eh_membro()));

-- mensagens_padrao
drop policy if exists mensagens_select on public.mensagens_padrao;
drop policy if exists mensagens_insert on public.mensagens_padrao;
drop policy if exists mensagens_update on public.mensagens_padrao;
drop policy if exists mensagens_delete on public.mensagens_padrao;
create policy mensagens_select on public.mensagens_padrao for select to authenticated
  using ((select public.eh_membro()));
create policy mensagens_insert on public.mensagens_padrao for insert to authenticated
  with check ((select public.eh_membro()) and (select auth.uid()) = user_id);
create policy mensagens_update on public.mensagens_padrao for update to authenticated
  using ((select public.eh_membro()))
  with check ((select public.eh_membro()));
create policy mensagens_delete on public.mensagens_padrao for delete to authenticated
  using ((select public.eh_membro()));

-- historico_contatos (qualquer membro lê; cada um só grava/apaga o que é seu)
drop policy if exists historico_select on public.historico_contatos;
drop policy if exists historico_insert on public.historico_contatos;
drop policy if exists historico_update on public.historico_contatos;
drop policy if exists historico_delete on public.historico_contatos;
create policy historico_select on public.historico_contatos for select to authenticated
  using ((select public.eh_membro()));
create policy historico_insert on public.historico_contatos for insert to authenticated
  with check (
    (select public.eh_membro())
    and (select auth.uid()) = user_id
    and exists (select 1 from public.leads l where l.id = lead_id)
  );
create policy historico_update on public.historico_contatos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy historico_delete on public.historico_contatos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- Funções RPC (SECURITY INVOKER: rodam com as permissões e o RLS do usuário)
-- Cada uma roda numa única transação: se uma parte falha, nada é gravado.
-- ---------------------------------------------------------------------

-- Move o lead de etapa, agenda o próximo follow-up pela cadência e registra no histórico.
-- p_manter_follow_up = true quando o usuário escolheu a data na mão.
drop function if exists public.mover_lead(uuid, text);
create or replace function public.mover_lead(p_lead_id uuid, p_etapa text, p_manter_follow_up boolean default false)
returns public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior text;
  v_follow   date;
  v_lead     public.leads;
begin
  select etapa, follow_up_em into v_anterior, v_follow
    from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead não encontrado' using errcode = 'P0002';
  end if;

  if v_anterior = p_etapa then
    select * into v_lead from public.leads where id = p_lead_id;
    return v_lead;
  end if;

  if p_etapa in ('Fechado', 'Perdido') then
    v_follow := null;
  elsif not p_manter_follow_up then
    v_follow := coalesce(public.follow_up_da_etapa(p_etapa), v_follow);
  end if;

  update public.leads
     set etapa = p_etapa,
         follow_up_em = v_follow,
         -- saiu da prospecção (respondeu ou avançou): zera as tentativas sem resposta
         tentativas = case when p_etapa in ('Novo', 'Mensagem enviada') then tentativas else 0 end
   where id = p_lead_id
   returning * into v_lead;

  insert into public.historico_contatos (lead_id, tipo, etapa_anterior, etapa_nova)
  values (p_lead_id, 'etapa', v_anterior, p_etapa);

  return v_lead;
end;
$$;

-- Registra um envio de WhatsApp: último contato, tentativa, próximo follow-up e histórico.
-- Se o lead estava em "Novo", move para "Mensagem enviada".
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
     set ultimo_contato_em = now(),
         etapa = v_nova,
         tentativas = case when v_nova in ('Novo', 'Mensagem enviada') then tentativas + 1 else tentativas end,
         follow_up_em = coalesce(public.follow_up_da_etapa(v_nova), follow_up_em)
   where id = p_lead_id
   returning * into v_lead;

  insert into public.historico_contatos (lead_id, tipo, mensagem_enviada, etapa_anterior, etapa_nova)
  values (p_lead_id, 'envio', p_mensagem, v_anterior, v_nova);

  return v_lead;
end;
$$;

-- Define a mensagem padrão da equipe (desmarca a anterior na mesma transação)
create or replace function public.definir_mensagem_padrao(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.mensagens_padrao
     set padrao = false
   where padrao and id <> p_id;

  update public.mensagens_padrao
     set padrao = true
   where id = p_id;

  if not found then
    raise exception 'Mensagem não encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões: só usuário autenticado; anon não acessa nada
-- ---------------------------------------------------------------------
revoke all on public.membros, public.leads, public.cadencia,
              public.mensagens_padrao, public.historico_contatos from anon;
grant select, insert, update, delete
  on public.leads, public.mensagens_padrao, public.historico_contatos
  to authenticated;
grant select, update on public.membros, public.cadencia to authenticated;

revoke execute on function public.eh_membro()                             from public, anon;
revoke execute on function public.mover_lead(uuid, text, boolean)         from public, anon;
revoke execute on function public.registrar_envio(uuid, text)             from public, anon;
revoke execute on function public.definir_mensagem_padrao(uuid)           from public, anon;
grant  execute on function public.eh_membro()                             to authenticated;
grant  execute on function public.mover_lead(uuid, text, boolean)         to authenticated;
grant  execute on function public.registrar_envio(uuid, text)             to authenticated;
grant  execute on function public.definir_mensagem_padrao(uuid)           to authenticated;

-- ---------------------------------------------------------------------
-- Tempo real: quando um sócio mexe num lead, a tela do outro atualiza
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.leads;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
