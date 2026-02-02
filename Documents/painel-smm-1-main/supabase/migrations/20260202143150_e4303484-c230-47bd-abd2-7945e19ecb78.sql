-- Enable cron + http calls for automated background syncing
create extension if not exists pg_cron;
create extension if not exists pg_net;