-- Recreate extensions in a non-public schema to satisfy security linter
create schema if not exists extensions;

-- Recreate pg_net outside public
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;

-- Recreate pg_cron outside public (required for scheduled background jobs)
drop extension if exists pg_cron;
create extension if not exists pg_cron with schema extensions;