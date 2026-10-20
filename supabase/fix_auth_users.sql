-- =====================================================================
-- FIX: "Database error querying schema" on staff sign-in
--
-- Why this happens:
-- Supabase GoTrue (the auth engine) requires:
-- 1. Non-null empty strings for token columns in auth.users
-- 2. A matching entry in auth.identities
--
-- Run this ONCE in Supabase Dashboard > SQL Editor > New query.
-- It immediately repairs all existing doctor and receptionist accounts!
-- =====================================================================

-- 1. Repair NULL token columns in auth.users
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    recovery_token = coalesce(recovery_token, '');

-- 2. Populate auth.identities for any account that does not have one yet
insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  u.id::text,
  format('{"sub":"%s","email":"%s"}', u.id::text, u.email)::jsonb,
  'email',
  now(),
  now(),
  now()
from auth.users u
where not exists (
  select 1 from auth.identities i where i.user_id = u.id
)
on conflict do nothing;

-- 3. Update admin_create_doctor so all future doctors are created with identities and non-null tokens
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

  -- Insert into auth.users with empty string tokens expected by GoTrue
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

  -- Insert matching identity into auth.identities
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

  -- Upsert profile with doctor role
  insert into profiles (id, full_name, phone, role, is_active)
  values (v_uid, trim(p_full_name), nullif(v_clean_phone, ''), 'doctor', true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      role = 'doctor',
      is_active = true;

  -- Insert into doctors table
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

-- 4. Update admin_create_receptionist so all future receptionists are created with identities and non-null tokens
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
