-- =====================================================================
-- Hospital Token System: Admin Role, Permissions & RPC Migration
-- Run this in Supabase Dashboard > SQL Editor > New query
-- This migration is SAFE, IDEMPOTENT, and preserves all existing data.
-- =====================================================================

create extension if not exists pgcrypto;

-- 1. Add 'admin' to user_role enum if it does not already exist
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'admin'
  ) then
    alter type user_role add value 'admin';
  end if;
end $$;

-- 2. Add is_active column to profiles if it does not already exist
alter table profiles add column if not exists is_active boolean not null default true;

-- 3. Update handle_new_user() trigger function with phone validation
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := trim(coalesce(new.raw_user_meta_data->>'phone', ''));
  v_name  text := trim(coalesce(new.raw_user_meta_data->>'full_name', ''));
begin
  -- Validate phone if provided (10 numeric digits, Indian mobile format 6-9...)
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
    'patient',                       -- role is never taken from user input
    true
  )
  on conflict (id) do update
  set full_name = case when profiles.full_name = '' then excluded.full_name else profiles.full_name end,
      phone = coalesce(profiles.phone, excluded.phone);
      
  return new;
end $$;

-- 4. Update Row Level Security Policies
-- Profiles: allow admin to read all profiles, reception to read patient & doctor profiles
drop policy if exists "profiles: own row or doctors" on profiles;
drop policy if exists "profiles: read" on profiles;
create policy "profiles: read" on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or role = 'doctor'
    or my_role() in ('admin', 'receptionist')
  );

drop policy if exists "profiles: update own" on profiles;
drop policy if exists "profiles: update own or admin" on profiles;
create policy "profiles: update own or admin" on profiles
  for update to authenticated
  using (id = auth.uid() or my_role() = 'admin')
  with check (id = auth.uid() or my_role() = 'admin');

-- Token details: visible to owner, reception, token's doctor, and administrator
drop policy if exists "token_details: owner, reception, doctor" on token_details;
drop policy if exists "token_details: owner, reception, doctor, admin" on token_details;
create policy "token_details: owner, reception, doctor, admin" on token_details
  for select to authenticated
  using (
    patient_id = auth.uid()
    or my_role() in ('receptionist', 'admin')
    or doctor_owns_token(token_id)
  );

-- Doctors table: allow admin to update doctors as well as the doctor themselves
drop policy if exists "doctors: update own" on doctors;
drop policy if exists "doctors: update own or admin" on doctors;
create policy "doctors: update own or admin" on doctors
  for update to authenticated
  using (profile_id = auth.uid() or my_role() = 'admin')
  with check (profile_id = auth.uid() or my_role() = 'admin');

-- 5. Grant table update privileges
grant update (full_name, phone, is_active) on profiles to authenticated;
grant update (is_available, avg_consult_minutes, department_id) on doctors to authenticated;

-- 6. Administrative RPC Functions

-- D2: Admin Overview Statistics
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

-- D3: Doctor Management Functions
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

-- Admin Create Doctor
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

-- Admin Update Doctor
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

-- Admin Delete Doctor (Safe: checks if tokens exist)
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

-- D4: Receptionist Management Functions
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

-- Password Reset for any user by Administrator
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

-- D5: Patient Directory & Full History
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

-- Patient History Details
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

-- D6: Token Workflow View for Admin
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

-- 7. Grant execute privileges on all new admin functions
grant execute on function
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
