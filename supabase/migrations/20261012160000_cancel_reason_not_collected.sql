-- A takeout order nobody came for: its own reason on the cancel list.
-- Alone in this file: a new enum value cannot be used in the transaction that adds it (see order_cancelled_status).
alter type public.order_cancel_reason add value 'NOT_COLLECTED';
