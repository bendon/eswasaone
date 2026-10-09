import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@eswasaone/shared-ui";

type CartToastContextValue = {
  cartCount: number;
  addToCart: (name: string) => void;
  showToast: (msg: string) => void;
};

const CartToastContext = createContext<CartToastContextValue | null>(null);

/** Safe no-op when HMR / error-boundary remount briefly leaves the tree without a provider. */
const FALLBACK: CartToastContextValue = {
  cartCount: 0,
  addToCart: () => undefined,
  showToast: () => undefined,
};

export function CartToastProvider({ children }: { children: ReactNode }) {
  const [cartCount, setCartCount] = useState(0);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastVisible(false), 2200);
  }, []);

  const addToCart = useCallback(
    (name: string) => {
      setCartCount((n) => n + 1);
      showToast(`Added: ${name}`);
    },
    [showToast],
  );

  const value = useMemo(
    () => ({ cartCount, addToCart, showToast }),
    [cartCount, addToCart, showToast],
  );

  return (
    <CartToastContext.Provider value={value}>
      {children}
      <div className={`toast${toastVisible ? " show" : ""}`} role="status" aria-live="polite">
        <Icon name="i-check" />
        <span>{toastMsg}</span>
      </div>
    </CartToastContext.Provider>
  );
}

export function useCartToast(): CartToastContextValue {
  return useContext(CartToastContext) ?? FALLBACK;
}
