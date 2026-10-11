-- Cancelling orders, part 1 of 2: the new status value.
--
-- It has to be its own migration: Postgres does not let a new enum value be USED in the transaction that adds it,
-- and the rules that use it (the next migration) are created in one.
--
-- CANCELLED is not a step of the flow NEW -> ... -> COMPLETED: an order can be taken OUT of the flow at any point
-- before it is completed, and nothing follows it. The status-flow trigger is rewritten in part 2 accordingly (the
-- old one used "the next value of the enum" as "the next step", which this new last value would have broken).

alter type public.order_status add value 'CANCELLED';
