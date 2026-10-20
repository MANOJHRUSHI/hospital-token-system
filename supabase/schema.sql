-- =====================================================================
-- HOSPITAL TOKEN SYSTEM: ALL-IN-ONE COMPLETE DATABASE SETUP
--
-- Run this ENTIRE file once in Supabase Dashboard > SQL Editor > New query.
-- It creates all tables, roles, security policies, token workflows,
-- admin management functions (with full GoTrue auth identities),
-- and standard hospital departments in a single clean run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 1. CLEAN START ----------
-- Cleanly wipe existing auth accounts and application tables for a fresh installation
delete from auth.users;

drop table if exists doctor_day_counters cascade;
drop table if exists token_details cascade;
drop table if exists tokens cascade;
drop table if exists doctors cascade;
drop table if exists departments cascade;
drop table if exists profiles cascade;
drop type if exists token_status cascade;
drop type if exists user_role cascade;

-- ---------- 2. ENUM TYPES ----------
create type user_role as enum ('patient', 'receptionist', 'doctor', 'admin');
create type token_status as enum
  ('waiting', 'called', 'in_consultation', 'completed', 'skipped', 'cancelled');

-- ---------- 3. HELPER FUNCTIONS ----------
-- India Standard Time date helper
create or replace function ist_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------- 4. APPLICATION TABLES ----------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  role        user_role not null default 'patient',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table departments (
  id    serial primary key,
  name  text not null unique
);

create table doctors (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null unique references profiles(id) on delete cascade,
  department_id        int  not null references departments(id),
  is_available         boolean not null default true,
  avg_consult_minutes  int  not null default 10
);

create table tokens (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references doctors(id) on delete cascade,
  token_date    date not null default ist_today(),
  token_number  int  not null,
  status        token_status not null default 'waiting',
  is_priority   boolean not null default false,
  created_at    timestamptz not null default now(),
  called_at     timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  unique (doctor_id, token_date, token_number)
);
create index tokens_queue_idx on tokens (doctor_id, token_date, status);

create table token_details (
  token_id       uuid primary key references tokens(id) on delete cascade,
  patient_id     uuid references profiles(id) on delete set null,
  patient_name   text not null,
  patient_phone  text
);

create table doctor_day_counters (
  doctor_id    uuid not null references doctors(id) on delete cascade,
  day          date not null,
  last_number  int  not null,
  primary key (doctor_id, day)
);

-- ---------- 5. TRIGGERS & ROLE HELPERS ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := trim(coalesce(new.raw_user_meta_data->>'phone', ''));
  v_name  text := trim(coalesce(new.raw_user_meta_data->>'full_name', ''));
begin
  if v_phone != '' then
    if v_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Phone number must be a valid 10-digit Indian mobile number';
    end if;
  end if;

  insert into profiles (id, full_name, phone, role, is_active)
  values (
    new.id,
    v_name,
    nullif(v_phone, ''),
    'patient',
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_doctor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from doctors where profile_id = auth.uid()
$$;

create or replace function doctor_owns_token(p_token uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tokens t
    join doctors d on d.id = t.doctor_id
    where t.id = p_token and d.profile_id = auth.uid()
  )
$$;

-- Internal token state transition helper
create or replace function _move_token(p_token uuid, p_from token_status[], p_to token_status)
returns tokens
language plpgsql security definer set search_path = public as $$
declare v tokens;
begin
  update tokens set
    status       = p_to,
    called_at    = case when p_to = 'called' then now()
                        when p_to = 'waiting' then null
                        else called_at end,
    started_at   = case when p_to = 'in_consultation' then now() else started_at end,
    completed_at = case when p_to = 'completed' then now() else completed_at end
  where id = p_token and status = any (p_from)
  returning * into v;

  if v.id is null then
    raise exception 'This token cannot be changed to % from its current state', p_to;
  end if;
  return v;
end $$;

-- ---------- 6. CORE TOKEN WORKFLOW FUNCTIONS ----------
create or replace function create_token(
  p_doctor uuid,
  p_name text default null,
  p_phone text default null,
  p_priority boolean default false
) returns tokens
language plpgsql security definer set search_path = public as $$
declare
  v_role  user_role := my_role();
  v_today date := ist_today();
  v_num   int;
  v_token tokens;
  v_pname text;
  v_pphone text;
begin
  if v_role is null or v_role not in ('patient', 'receptionist', 'admin') then
    raise exception 'Not allowed';
  end if;
  if not exists (select 1 from doctors where id = p_doctor) then
    raise exception 'Doctor not found';
  end if;

  if v_role = 'patient' then
    p_priority := false;
    if exists (
      select 1 from tokens t join token_details d on d.token_id = t.id
      where t.doctor_id = p_doctor and t.token_date = v_today
        and d.patient_id = auth.uid()
        and t.status in ('waiting', 'called', 'in_consultation')
    ) then
      raise exception 'You already have an active token for this doctor today';
    end if;
    select full_name, phone into v_pname, v_pphone from profiles where id = auth.uid();
    p_name  := coalesce(nullif(trim(p_name), ''), v_pname);
    p_phone := coalesce(nullif(trim(p_phone), ''), v_pphone);
  else
    if coalesce(trim(p_name), '') = '' then
      raise exception 'Patient name is required';
    end if;
  end if;

  insert into doctor_day_counters (doctor_id, day, last_number)
  values (p_doctor, v_today, 1)
  on conflict (doctor_id, day)
  do update set last_number = doctor_day_counters.last_number + 1
  returning last_number into v_num;

  insert into tokens (doctor_id, token_date, token_number, is_priority)
  values (p_doctor, v_today, v_num, p_priority)
  returning * into v_token;

  insert into token_details (token_id, patient_id, patient_name, patient_phone)
  values (
    v_token.id,
    case when v_role = 'patient' then auth.uid() end,
    coalesce(p_name, ''),
    p_phone
  );

  return v_token;
end $$;

create or replace function call_next() returns tokens
language plpgsql security definer set search_path = public as $$
declare
  v_doc   doctors;
  v_next  tokens;
  v_today date := ist_today();
begin
  select * into v_doc from doctors where profile_id = auth.uid();
  if v_doc.id is null then raise exception 'Only doctors can call patients'; end if;
  if not v_doc.is_available then
    raise exception 'You are on break. Switch to Available first';
  end if;
  if exists (
    select 1 from tokens
    where doctor_id = v_doc.id and token_date = v_today
      and status in ('called', 'in_consultation')
  ) then
    raise exception 'Finish the current patient first';
  end if;

  select * into v_next from tokens
  where doctor_id = v_doc.id and token_date = v_today and status = 'waiting'
  order by is_priority desc, token_number asc
  limit 1
  for update skip locked;

  if v_next.id is null then raise exception 'No patients are waiting'; end if;

  update tokens set status = 'called', called_at = now()
  where id = v_next.id returning * into v_next;
  return v_next;
end $$;

create or replace function start_consultation(p_token uuid) returns tokens
language plpgsql security definer set search_path = public as $$
begin
  if not doctor_owns_token(p_token) then raise exception 'Not allowed'; end if;
  return _move_token(p_token, array['called']::token_status[], 'in_consultation');
end $$;

create or replace function complete_token(p_token uuid) returns tokens
language plpgsql security definer set search_path = public as $$
begin
  if not doctor_owns_token(p_token) then raise exception 'Not allowed'; end if;
  return _move_token(p_token, array['in_consultation']::token_status[], 'completed');
end $$;

create or replace function skip_token(p_token uuid) returns tokens
language plpgsql security definer set search_path = public as $$
begin
  if not doctor_owns_token(p_token) then raise exception 'Not allowed'; end if;
  return _move_token(p_token, array['called']::token_status[], 'skipped');
end $$;

create or replace function requeue_token(p_token uuid) returns tokens
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('receptionist', 'admin') then raise exception 'Not allowed'; end if;
  return _move_token(p_token, array['skipped']::token_status[], 'waiting');
end $$;

create or replace function cancel_token(p_token uuid) returns tokens
language plpgsql security definer set search_path = public as $$
declare v_role user_role := my_role();
begin
  if v_role in ('receptionist', 'admin') then
    return _move_token(p_token, array['waiting', 'skipped']::token_status[], 'cancelled');
  elsif v_role = 'patient' and exists (
    select 1 from token_details where token_id = p_token and patient_id = auth.uid()
  ) then
    return _move_token(p_token, array['waiting']::token_status[], 'cancelled');
  else
    raise exception 'Not allowed';
  end if;
end $$;

create or replace function set_priority(p_token uuid, p_priority boolean) returns tokens
language plpgsql security definer set search_path = public as $$
declare v tokens;
begin
  if my_role() not in ('receptionist', 'admin') then raise exception 'Not allowed'; end if;
  update tokens set is_priority = p_priority
  where id = p_token and status = 'waiting'
  returning * into v;
  if v.id is null then raise exception 'Only waiting tokens can be prioritised'; end if;
  return v;
end $$;

-- ---------- 7. ROW LEVEL SECURITY ----------
alter table profiles            enable row level security;
alter table departments         enable row level security;
alter table doctors             enable row level security;
alter table tokens              enable row level security;
alter table token_details       enable row level security;
alter table doctor_day_counters enable row level security;

create policy "profiles: read" on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or role = 'doctor'
    or my_role() in ('admin', 'receptionist')
  );

create policy "profiles: update own or admin" on profiles
  for update to authenticated
  using (id = auth.uid() or my_role() = 'admin')
  with check (id = auth.uid() or my_role() = 'admin');

create policy "departments: read" on departments
  for select to authenticated using (true);

create policy "doctors: read" on doctors
  for select to authenticated using (true);

create policy "doctors: update own or admin" on doctors
  for update to authenticated
  using (profile_id = auth.uid() or my_role() = 'admin')
  with check (profile_id = auth.uid() or my_role() = 'admin');

create policy "tokens: read" on tokens
  for select to authenticated using (true);

create policy "token_details: owner, reception, doctor, admin" on token_details
  for select to authenticated
  using (
    patient_id = auth.uid()
    or my_role() in ('receptionist', 'admin')
    or doctor_owns_token(token_id)
  );

-- ---------- 8. TABLE PRIVILEGES ----------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on tokens, token_details, doctor_day_counters, departments from authenticated;
revoke all on doctor_day_counters from authenticated;
revoke insert, update, delete on profiles from authenticated;
grant update (full_name, phone, is_active) on profiles to authenticated;
revoke insert, update, delete on doctors from authenticated;
grant update (is_available, avg_consult_minutes, department_id) on doctors to authenticated;

-- ---------- 9. ADMINISTRATOR MANAGEMENT FUNCTIONS ----------

create or replace function admin_get_stats()
returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role user_role := my_role();
  v_today date := ist_today();
  v_result json;
begin
  if v_role is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select json_build_object(
    'total_patients', (select count(*) from profiles where role = 'patient'),
    'total_doctors', (select count(*) from doctors),
    'available_doctors', (select count(*) from doctors where is_available = true),
    'total_receptionists', (select count(*) from profiles where role = 'receptionist'),
    'total_tokens_all', (select count(*) from tokens),
    'total_tokens_today', (select count(*) from tokens where token_date = v_today),
    'waiting_today', (select count(*) from tokens where token_date = v_today and status = 'waiting'),
    'in_progress_today', (select count(*) from tokens where token_date = v_today and status in ('called', 'in_consultation')),
    'completed_today', (select count(*) from tokens where token_date = v_today and status = 'completed'),
    'skipped_today', (select count(*) from tokens where token_date = v_today and status = 'skipped'),
    'cancelled_today', (select count(*) from tokens where token_date = v_today and status = 'cancelled')
  ) into v_result;

  return v_result;
end $$;

create or replace function admin_list_doctors()
returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_today date := ist_today();
  v_result json;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      d.id,
      d.profile_id as "profileId",
      p.full_name as "name",
      u.email,
      p.phone,
      d.department_id as "departmentId",
      dep.name as "departmentName",
      d.is_available as "isAvailable",
      p.is_active as "isActive",
      d.avg_consult_minutes as "avgMinutes",
      p.created_at as "createdAt",
      (
        select count(*) from tokens tk
        where tk.doctor_id = d.id and tk.token_date = v_today and tk.status in ('waiting', 'called', 'in_consultation')
      ) as "activeTokensCount",
      (
        select count(*) from tokens tk
        where tk.doctor_id = d.id
      ) as "totalTokensCount"
    from doctors d
    join profiles p on p.id = d.profile_id
    left join auth.users u on u.id = d.profile_id
    left join departments dep on dep.id = d.department_id
    order by p.full_name asc
  ) t;

  return v_result;
end $$;

-- Create doctor with non-null tokens and full auth.identities
create or replace function admin_create_doctor(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text default null,
  p_department_id int default null,
  p_avg_minutes int default 10
) returns json
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_uid uuid;
  v_doc_id uuid;
  v_clean_phone text := trim(coalesce(p_phone, ''));
  v_clean_email text := lower(trim(p_email));
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters long';
  end if;

  if v_clean_phone != '' and v_clean_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone number must be a valid 10-digit Indian mobile number';
  end if;

  if exists (select 1 from auth.users where email = v_clean_email) then
    raise exception 'An account with email % already exists', v_clean_email;
  end if;

  if not exists (select 1 from departments where id = p_department_id) then
    raise exception 'Invalid department ID';
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('full_name', p_full_name, 'phone', nullif(v_clean_phone, ''))::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_uid,
    v_uid,
    v_uid::text,
    format('{"sub":"%s","email":"%s"}', v_uid::text, v_clean_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  ) on conflict do nothing;

  insert into profiles (id, full_name, phone, role, is_active)
  values (v_uid, trim(p_full_name), nullif(v_clean_phone, ''), 'doctor', true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      role = 'doctor',
      is_active = true;

  insert into doctors (profile_id, department_id, is_available, avg_consult_minutes)
  values (v_uid, p_department_id, true, coalesce(p_avg_minutes, 10))
  returning id into v_doc_id;

  return json_build_object(
    'id', v_doc_id,
    'profileId', v_uid,
    'email', v_clean_email,
    'name', trim(p_full_name)
  );
end $$;

create or replace function admin_update_doctor(
  p_doctor_id uuid,
  p_full_name text,
  p_phone text,
  p_department_id int,
  p_avg_minutes int,
  p_is_available boolean,
  p_is_active boolean
) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_profile_id uuid;
  v_clean_phone text := trim(coalesce(p_phone, ''));
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  if v_clean_phone != '' and v_clean_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone number must be a valid 10-digit Indian mobile number';
  end if;

  select profile_id into v_profile_id from doctors where id = p_doctor_id;
  if v_profile_id is null then
    raise exception 'Doctor not found';
  end if;

  update profiles
  set full_name = trim(p_full_name),
      phone = nullif(v_clean_phone, ''),
      is_active = p_is_active
  where id = v_profile_id;

  update doctors
  set department_id = p_department_id,
      avg_consult_minutes = greatest(1, coalesce(p_avg_minutes, 10)),
      is_available = case when p_is_active = false then false else p_is_available end
  where id = p_doctor_id;

  return true;
end $$;

create or replace function admin_delete_doctor(p_doctor_id uuid)
returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_profile_id uuid;
  v_token_count int;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select profile_id into v_profile_id from doctors where id = p_doctor_id;
  if v_profile_id is null then
    raise exception 'Doctor not found';
  end if;

  select count(*) into v_token_count from tokens where doctor_id = p_doctor_id;
  if v_token_count > 0 then
    raise exception 'Cannot delete doctor with existing token records (% tokens). Please deactivate the doctor account instead to preserve patient history.', v_token_count;
  end if;

  delete from doctors where id = p_doctor_id;
  delete from profiles where id = v_profile_id;
  delete from auth.users where id = v_profile_id;

  return true;
end $$;

create or replace function admin_list_receptionists()
returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_result json;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      p.id,
      p.full_name as "name",
      u.email,
      p.phone,
      p.is_active as "isActive",
      p.created_at as "createdAt"
    from profiles p
    left join auth.users u on u.id = p.id
    where p.role = 'receptionist'
    order by p.full_name asc
  ) t;

  return v_result;
end $$;

-- Create receptionist with non-null tokens and full auth.identities
create or replace function admin_create_receptionist(
  p_email text,
  p_password text,
  p_full_name text,
  p_phone text default null
) returns json
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_uid uuid;
  v_clean_phone text := trim(coalesce(p_phone, ''));
  v_clean_email text := lower(trim(p_email));
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  if length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters long';
  end if;

  if v_clean_phone != '' and v_clean_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone number must be a valid 10-digit Indian mobile number';
  end if;

  if exists (select 1 from auth.users where email = v_clean_email) then
    raise exception 'An account with email % already exists', v_clean_email;
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('full_name', p_full_name, 'phone', nullif(v_clean_phone, ''))::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    v_uid,
    v_uid,
    v_uid::text,
    format('{"sub":"%s","email":"%s"}', v_uid::text, v_clean_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  ) on conflict do nothing;

  insert into profiles (id, full_name, phone, role, is_active)
  values (v_uid, trim(p_full_name), nullif(v_clean_phone, ''), 'receptionist', true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      role = 'receptionist',
      is_active = true;

  return json_build_object(
    'id', v_uid,
    'email', v_clean_email,
    'name', trim(p_full_name)
  );
end $$;

create or replace function admin_update_receptionist(
  p_profile_id uuid,
  p_full_name text,
  p_phone text,
  p_is_active boolean
) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_clean_phone text := trim(coalesce(p_phone, ''));
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  if v_clean_phone != '' and v_clean_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Phone number must be a valid 10-digit Indian mobile number';
  end if;

  update profiles
  set full_name = trim(p_full_name),
      phone = nullif(v_clean_phone, ''),
      is_active = p_is_active
  where id = p_profile_id and role = 'receptionist';

  return true;
end $$;

create or replace function admin_delete_receptionist(p_profile_id uuid)
returns boolean
language plpgsql security definer set search_path = public, auth as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  delete from profiles where id = p_profile_id and role = 'receptionist';
  delete from auth.users where id = p_profile_id;
  return true;
end $$;

create or replace function admin_reset_user_password(
  p_user_id uuid,
  p_new_password text
) returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  if length(p_new_password) < 6 then
    raise exception 'Password must be at least 6 characters long';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found';
  end if;

  update auth.users
  set encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  return true;
end $$;

create or replace function admin_list_patients(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
) returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_today date := ist_today();
  v_q text := lower(trim(coalesce(p_search, '')));
  v_result json;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      p.id,
      p.full_name as "name",
      p.phone,
      u.email,
      p.created_at as "createdAt",
      p.is_active as "isActive",
      (
        select count(*) from token_details td
        where td.patient_id = p.id
      ) as "totalTokens",
      (
        select tk.token_number
        from tokens tk
        join token_details td on td.token_id = tk.id
        where td.patient_id = p.id and tk.token_date = v_today
        order by tk.created_at desc limit 1
      ) as "todayTokenNumber",
      (
        select tk.status
        from tokens tk
        join token_details td on td.token_id = tk.id
        where td.patient_id = p.id and tk.token_date = v_today
        order by tk.created_at desc limit 1
      ) as "todayTokenStatus",
      (
        select doc_p.full_name
        from tokens tk
        join token_details td on td.token_id = tk.id
        join doctors d on d.id = tk.doctor_id
        join profiles doc_p on doc_p.id = d.profile_id
        where td.patient_id = p.id and tk.token_date = v_today
        order by tk.created_at desc limit 1
      ) as "todayDoctorName"
    from profiles p
    left join auth.users u on u.id = p.id
    where p.role = 'patient'
      and (
        v_q = ''
        or lower(p.full_name) like '%' || v_q || '%'
        or lower(coalesce(p.phone, '')) like '%' || v_q || '%'
        or lower(coalesce(u.email, '')) like '%' || v_q || '%'
        or p.id::text like '%' || v_q || '%'
      )
    order by p.created_at desc
    limit greatest(1, p_limit) offset greatest(0, p_offset)
  ) t;

  return v_result;
end $$;

create or replace function admin_get_patient_history(p_patient_id uuid)
returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_result json;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      tk.id,
      tk.token_number as "tokenNumber",
      tk.token_date as "tokenDate",
      tk.status,
      tk.is_priority as "isPriority",
      tk.created_at as "createdAt",
      tk.called_at as "calledAt",
      tk.started_at as "startedAt",
      tk.completed_at as "completedAt",
      doc_p.full_name as "doctorName",
      dep.name as "departmentName"
    from tokens tk
    join token_details td on td.token_id = tk.id
    join doctors d on d.id = tk.doctor_id
    join profiles doc_p on doc_p.id = d.profile_id
    left join departments dep on dep.id = d.department_id
    where td.patient_id = p_patient_id
    order by tk.created_at desc
  ) t;

  return v_result;
end $$;

create or replace function admin_list_all_tokens(
  p_date date default null,
  p_doctor_id uuid default null,
  p_status token_status default null,
  p_search text default null,
  p_limit int default 100,
  p_offset int default 0
) returns json
language plpgsql security definer set search_path = public, auth as $$
declare
  v_q text := lower(trim(coalesce(p_search, '')));
  v_result json;
begin
  if my_role() is distinct from 'admin' then
    raise exception 'Unauthorized: Administrator privileges required';
  end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      tk.id,
      tk.token_number as "tokenNumber",
      tk.token_date as "tokenDate",
      tk.status,
      tk.is_priority as "isPriority",
      tk.created_at as "createdAt",
      tk.called_at as "calledAt",
      tk.started_at as "startedAt",
      tk.completed_at as "completedAt",
      tk.doctor_id as "doctorId",
      doc_p.full_name as "doctorName",
      dep.name as "departmentName",
      td.patient_id as "patientId",
      td.patient_name as "patientName",
      td.patient_phone as "patientPhone"
    from tokens tk
    left join token_details td on td.token_id = tk.id
    join doctors d on d.id = tk.doctor_id
    join profiles doc_p on doc_p.id = d.profile_id
    left join departments dep on dep.id = d.department_id
    where (p_date is null or tk.token_date = p_date)
      and (p_doctor_id is null or tk.doctor_id = p_doctor_id)
      and (p_status is null or tk.status = p_status)
      and (
        v_q = ''
        or tk.token_number::text = v_q
        or lower(coalesce(td.patient_name, '')) like '%' || v_q || '%'
        or lower(coalesce(td.patient_phone, '')) like '%' || v_q || '%'
      )
    order by tk.created_at desc
    limit greatest(1, p_limit) offset greatest(0, p_offset)
  ) t;

  return v_result;
end $$;

-- ---------- 10. FUNCTION PERMISSIONS ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  ist_today(),
  my_role(),
  my_doctor_id(),
  doctor_owns_token(uuid),
  create_token(uuid, text, text, boolean),
  call_next(),
  start_consultation(uuid),
  complete_token(uuid),
  skip_token(uuid),
  requeue_token(uuid),
  cancel_token(uuid),
  set_priority(uuid, boolean),
  admin_get_stats(),
  admin_list_doctors(),
  admin_create_doctor(text, text, text, text, int, int),
  admin_update_doctor(uuid, text, text, int, int, boolean, boolean),
  admin_delete_doctor(uuid),
  admin_list_receptionists(),
  admin_create_receptionist(text, text, text, text),
  admin_update_receptionist(uuid, text, text, boolean),
  admin_delete_receptionist(uuid),
  admin_reset_user_password(uuid, text),
  admin_list_patients(text, int, int),
  admin_get_patient_history(uuid),
  admin_list_all_tokens(date, uuid, token_status, text, int, int)
to authenticated;

-- ---------- 11. REALTIME PUBLICATIONS ----------
do $$ begin
  alter publication supabase_realtime add table tokens;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table doctors;
exception when duplicate_object then null; end $$;

-- ---------- 12. INITIAL HOSPITAL DEPARTMENTS SEED ----------
insert into departments (name) values
  ('General Medicine'),
  ('Pediatrics'),
  ('Orthopedics'),
  ('Cardiology'),
  ('Dermatology'),
  ('ENT (Ear, Nose & Throat)'),
  ('Gynecology')
on conflict (name) do nothing;

-- ---------- 13. SEED DEFAULT HOSPITAL ADMINISTRATOR ----------
-- Provisions the default Admin account: admin@hospital.com / admin123
do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_admin_email text := 'admin@hospital.com';
  v_admin_pass text := 'admin123';
begin
  if not exists (select 1 from auth.users where email = v_admin_email) then
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_admin_email,
      crypt(v_admin_pass, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Hospital Administrator"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_admin_id,
      v_admin_id,
      v_admin_id::text,
      format('{"sub":"%s","email":"%s"}', v_admin_id::text, v_admin_email)::jsonb,
      'email',
      now(),
      now(),
      now()
    );

    insert into profiles (id, full_name, phone, role, is_active)
    values (v_admin_id, 'Hospital Administrator', null, 'admin', true)
    on conflict (id) do update
    set role = 'admin',
        full_name = 'Hospital Administrator',
        is_active = true;
  end if;
end $$;
