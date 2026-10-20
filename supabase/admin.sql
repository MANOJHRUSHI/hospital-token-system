-- =====================================================================
-- Hospital Token System: Administrator Provisioning
--
-- How to create or promote an Administrator:
-- 1. Sign up a new user via the application interface (e.g. admin@hospital.com)
--    OR create the user in Supabase Dashboard > Authentication > Add user.
-- 2. Run the SQL below in Supabase Dashboard > SQL Editor.
-- 3. The account will immediately have full Administrator privileges.
-- =====================================================================

-- Promote an existing user to Administrator by email:
update profiles
set role = 'admin',
    full_name = 'Hospital Administrator',
    is_active = true
where id = (select id from auth.users where email = 'admin@hospital.com');

-- Verify the admin was promoted:
select id, full_name, role, phone, is_active, created_at
from profiles
where role = 'admin';
