"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addToCart, EMPTY_CART, parseCart, removeLine, setQuantity, type Cart, type CartError } from "@/domain/cart/cart";
import type { MenuItemId } from "@/domain/menu/menu";
import type { OptionId } from "@/domain/menu/options";
import type { Result } from "@/domain/shared/result";

const storageKey = (restaurantSlug: string) => `smartmenu:cart:${restaurantSlug}`;

/**
 * The customer's cart, kept in this browser (localStorage, one per restaurant). It holds only ids and quantities
 * (domain/cart): prices always come from the live menu. Storage can be unavailable (private mode, blocked, full) or
 * hold anything, so every access is wrapped and a broken cart simply starts empty.
 */
export function useCart(restaurantSlug: string) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [ready, setReady] = useState(false); // false until the saved cart is read (avoids a server/client mismatch)
  const current = useRef<Cart>(EMPTY_CART);

  useEffect(() => {
    const key = storageKey(restaurantSlug);
    const read = (raw: string | null): Cart => {
      try {
        return raw ? parseCart(JSON.parse(raw)) : EMPTY_CART;
      } catch {
        return EMPTY_CART;
      }
    };
    const load = (raw: string | null) => {
      current.current = read(raw);
      setCart(current.current);
    };
    try {
      load(window.localStorage.getItem(key));
    } catch {
      load(null);
    }
    setReady(true);
    // Another tab of the same restaurant changed the cart.
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) load(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [restaurantSlug]);

  /** Applies a change; only a valid result is kept and saved. Returns it so the screen can show an error. */
  const apply = useCallback(
    (change: (cart: Cart) => Result<Cart, CartError>): Result<Cart, CartError> => {
      const result = change(current.current);
      if (result.ok) {
        current.current = result.value;
        setCart(result.value);
        try {
          window.localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(result.value));
        } catch {
          // Storage unavailable: the cart still works for this visit, it just will not survive a reload.
        }
      }
      return result;
    },
    [restaurantSlug],
  );

  return {
    cart,
    ready,
    add: (menuItemId: MenuItemId, optionIds: readonly OptionId[], quantity: number) =>
      apply((c) => addToCart(c, { menuItemId, optionIds, quantity })),
    setQuantity: (key: string, quantity: number) => apply((c) => setQuantity(c, key, quantity)),
    remove: (key: string) => apply((c) => ({ ok: true as const, value: removeLine(c, key) })),
    clear: () => apply(() => ({ ok: true as const, value: EMPTY_CART })),
  };
}
