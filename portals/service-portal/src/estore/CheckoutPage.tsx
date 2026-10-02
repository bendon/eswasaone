import { Link } from "react-router-dom";
import { RequireAuth } from "../auth/RequireAuth";

/**
 * Wave 0 / F0c — route shell for e-store checkout.
 * Full cart → MoMo → licence flow is owned by Wave 1 WS-S1.
 */
export function CheckoutPage() {
  return (
    <RequireAuth>
      <div className="wrap" style={{ padding: "48px 24px", maxWidth: 640 }}>
        <h1>Checkout</h1>
        <p>
          Complete your standards purchase. Payment and licence delivery land in Wave 1 (WS-S1).
        </p>
        <p>
          <Link to="/standards">Browse standards</Link>
          {" · "}
          <Link to="/account/orders">Your orders</Link>
        </p>
      </div>
    </RequireAuth>
  );
}
