-- Cancelling orders, part 2 of 2: the rules (PROJECT_SPEC §4, chosen 2026-10-11).
--
--   * Only staff cancel. The WAITER may cancel an order that is NEW or CONFIRMED (the kitchen has not started);
--     the OWNER and MANAGER any order that is not COMPLETED; the CASHIER never.
--   * A cancelled order is kept: status CANCELLED, with the reason (from a fixed list), when, and who.
--   * CANCELLED is final. A COMPLETED order cannot be cancelled.
--   * A table session cannot be closed while it has unfinished orders (anything not COMPLETED or CANCELLED),
--     unless the session has already run out of time (then the next scan must be able to start a new visit).
--
-- Everything is enforced HERE, for every way in, not only by the screens.

-- ─── What is stored about a cancellation ────────────────────────────────
create type public.order_cancel_reason as enum ('GUEST_CHANGED_MIND', 'ITEM_UNAVAILABLE', 'MISTAKE', 'OTHER');

alter table public.orders
  add column cancel_reason public.order_cancel_reason,
  add column cancelled_at  timestamptz,
  add column cancelled_by  uuid, -- the staff member (auth.uid()); null when the server did it
  -- A reason and a time exactly when the order is cancelled, never otherwise.
  add constraint orders_cancellation_matches_status check (
    (status = 'CANCELLED') = (cancel_reason is not null) and (status = 'CANCELLED') = (cancelled_at is not null)
  ),
  add constraint orders_cancelled_by_needs_cancellation check (cancelled_by is null or status = 'CANCELLED');

comment on column public.orders.cancel_reason is 'Why the order was cancelled (staff pick it from a fixed list). Set exactly when status is CANCELLED.';
comment on column public.orders.cancelled_at is 'Stamped by the status trigger when the order is cancelled.';
comment on column public.orders.cancelled_by is 'auth.uid() of the staff member who cancelled, stamped by the status trigger.';

-- Staff send the reason together with the new status; when and who are stamped by the trigger (not grantable).
grant update (cancel_reason) on public.orders to authenticated;

-- ─── Status flow, rewritten ─────────────────────────────────────────────
-- Forward: exactly one step along NEW -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED, as before, for
-- every role (service_role included). Out: -> CANCELLED from any step before COMPLETED, by the right role, with a
-- reason. Nothing after COMPLETED or CANCELLED. A cancellation cannot be edited afterwards.
create or replace function public.orders_enforce_status_flow() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_flow constant public.order_status[] :=
    array['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']::public.order_status[];
begin
  if new.status is distinct from old.status then
    if new.status = 'CANCELLED' then
      if old.status = 'COMPLETED' then
        raise exception 'a completed order cannot be cancelled' using errcode = '23514';
      end if;
      if new.cancel_reason is null then
        raise exception 'a cancelled order needs a reason' using errcode = '23514';
      end if;
      -- Who may: owner and manager always; the waiter only before the kitchen starts. (The cashier is already
      -- stopped by the update policy. auth.uid() is null for the server itself, which is trusted.)
      if auth.uid() is not null
         and not public.has_restaurant_role(new.restaurant_id, array['OWNER', 'MANAGER']::public.app_role[])
         and not (public.has_restaurant_role(new.restaurant_id, array['WAITER']::public.app_role[])
                  and old.status in ('NEW', 'CONFIRMED')) then
        raise exception 'this role cannot cancel an order that is %', old.status using errcode = '42501';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();
    else
      -- (old.status = 'CANCELLED' is not in the flow: array_position gives null, and nothing equals null + 1.)
      if new.status is distinct from v_flow[array_position(v_flow, old.status) + 1] then
        raise exception 'order status cannot go from % to %', old.status, new.status using errcode = '23514';
      end if;
    end if;
    new.status_changed_at := now();
  elsif (new.cancel_reason, new.cancelled_at, new.cancelled_by) is distinct from (old.cancel_reason, old.cancelled_at, old.cancelled_by) then
    raise exception 'the cancellation of an order cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;

-- Fire on the cancellation columns too, so they cannot be edited on their own.
drop trigger orders_status_flow on public.orders;
create trigger orders_status_flow before update of status, cancel_reason, cancelled_at, cancelled_by on public.orders
  for each row execute function public.orders_enforce_status_flow();

-- The update policy "staff move orders by role" needs no change: the WAITER may write any status except COMPLETED
-- (so CANCELLED too; the trigger above narrows it to NEW / CONFIRMED), OWNER and MANAGER any status, and the
-- CASHIER only COMPLETED (so never CANCELLED).

-- ─── A visit is not closed over unfinished orders ───────────────────────
-- OPEN -> PAYMENT_REQUESTED -> CLOSED (or OPEN -> CLOSED) as before, plus: closing is refused while the session
-- has an order that is neither COMPLETED nor CANCELLED. The exception is a session that has already run out of
-- time (session_ttl): scanning the table again must be able to close it and start a fresh visit; orders left in
-- it stay visible to staff as "orders from visits that have ended".
create or replace function public.table_sessions_enforce_flow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'OPEN' and new.status in ('PAYMENT_REQUESTED', 'CLOSED'))
            or (old.status = 'PAYMENT_REQUESTED' and new.status = 'CLOSED')) then
      raise exception 'session status cannot go from % to %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'CLOSED' then
      if old.started_at >= now() - public.session_ttl()
         and exists (select 1 from public.orders o
                     where o.restaurant_id = old.restaurant_id and o.session_id = old.id
                       and o.status not in ('COMPLETED', 'CANCELLED')) then
        raise exception 'a table session cannot be closed while it has unfinished orders' using errcode = '23514';
      end if;
      new.ended_at := now();
    end if;
  end if;
  return new;
end $$;

-- ...and an order cannot slip in at the moment its visit is being closed. Placing an order now LOCKS its session
-- row while it checks that the session is open (FOR SHARE: other orders can do the same at the same time, but a
-- status change of the session has to wait, and the other way round). Whichever comes first, the other one sees
-- the result: either the order is refused (session closed), or closing is refused (unfinished order).
create or replace function public.orders_require_open_session() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status  public.session_status;
  v_started timestamptz;
begin
  select s.status, s.started_at into v_status, v_started
  from public.table_sessions s where s.restaurant_id = new.restaurant_id and s.id = new.session_id
  for share;
  if v_status is distinct from 'OPEN' or v_started < now() - public.session_ttl() then
    raise exception 'orders can only be placed in an OPEN, unexpired table session' using errcode = '23514';
  end if;
  return new;
end $$;
