-- =====================================================================
-- Give an existing account the Receptionist or Doctor role.
--
-- Public signup always creates a PATIENT, so staff are promoted here.
--   1. Create the account first: sign up in the app, or Supabase Dashboard,
--      Authentication, Users, Add user.
--   2. Replace the example emails, names and department below.
--   3. Run in the SQL Editor. Repeat the block for each staff member.
--
-- As written, these examples match no account and change nothing.
-- =====================================================================

-- Receptionist
update profiles
set role = 'receptionist', full_name = 'Front Desk'
where id = (select id from auth.users where email = 'reception@example.com');

-- Doctor (also links the doctor to a department from the departments table)
update profiles
set role = 'doctor', full_name = 'Dr. Example Name'
where id = (select id from auth.users where email = 'doctor@example.com');

insert into doctors (profile_id, department_id)
select u.id, d.id
from auth.users u, departments d
where u.email = 'doctor@example.com'
  and d.name = 'General Medicine'
on conflict (profile_id) do nothing;
