import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ICartModuleService, IPaymentModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

type PaymentSessionProjection = {
  id: string;
  status: string | null;
};

type PaymentCollectionProjection = {
  id: string | null;
  paymentSessions: PaymentSessionProjection[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getActorId(request: unknown): string | undefined {
  if (!isRecord(request) || !isRecord(request.auth_context)) {
    return undefined;
  }

  return typeof request.auth_context.actor_id === "string"
    ? request.auth_context.actor_id
    : undefined;
}

function getPaymentCollection(cart: unknown): PaymentCollectionProjection | null {
  if (!isRecord(cart) || !isRecord(cart.payment_collection)) {
    return null;
  }

  const collection = cart.payment_collection;
  const paymentSessions = Array.isArray(collection.payment_sessions)
    ? collection.payment_sessions.flatMap((session) => {
        if (!isRecord(session) || typeof session.id !== "string") {
          return [];
        }

        return [{
          id: session.id,
          status: typeof session.status === "string" ? session.status : null,
        }];
      })
    : [];

  return {
    id: typeof collection.id === "string" ? collection.id : null,
    paymentSessions,
  };
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params;

  console.log("[RESET_PAYMENT_SESSION_REACHED]", {
    cart_id: id,
  });

  try {
    const cartService: ICartModuleService = req.scope.resolve(Modules.CART);
    const paymentService: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT);

    // Retrieve cart to get payment collections
    const cart = await cartService.retrieveCart(id, {
      relations: ["payment_collection", "payment_collection.payment_sessions"],
    });

    if (!cart) {
      res.status(404).json({ message: "Cart not found" });
      return;
    }

    const actorId = getActorId(req);
    if (cart.customer_id && actorId) {
      if (cart.customer_id !== actorId) {
        res.status(403).json({ message: "Unauthorized" });
        return;
      }
    }

    if (cart.completed_at) {
      res.status(400).json({ message: "Cart is already completed" });
      return;
    }

    const paymentCollection = getPaymentCollection(cart);
    if (!paymentCollection || paymentCollection.paymentSessions.length === 0) {
      res.json({ cart, reset: false });
      return;
    }

    let hasDeleteError = false;

    // Attempt to delete associated payment sessions safely
    try {
      for (const session of paymentCollection.paymentSessions) {
        if (!session) {
          console.warn("[RESET_PAYMENT_SESSION_SKIP_MISSING_SESSION]");
          continue;
        }

        console.log("[RESET_PAYMENT_SESSION_OBJECT]", {
          valueExists: !!session,
          keys: session ? Object.keys(session) : [],
          id: session?.id
        });

        if (session.status !== 'captured' && session.status !== 'succeeded') {
          // Wrap in try catch, because Medusa's internal code might throw `.kind`
          try {
            await paymentService.deletePaymentSession(session.id);
          } catch (e: any) {
            console.error(`[RESET_PAYMENT_SESSION_DELETE_ERROR] session ${session.id}:`, e?.message);
            if (e?.message?.includes('kind') || e?.message?.includes('undefined')) {
              hasDeleteError = true;
            } else {
              throw e;
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[RESET_PAYMENT_SESSION_LOOP_ERROR] cart ${id}`, err);
      hasDeleteError = true;
    }

    if (hasDeleteError) {
      // If we couldn't cleanly delete the session due to a Medusa internal `.kind` error, it is completely broken.
      // We return a 409 and instruct the client to recreate the cart.
      res.status(409).json({
        code: "STALE_PAYMENT_SESSION",
        message: "The cart payment session is stale. Create a new cart.",
        recreate_cart: true
      });
      return;
    }

    if (paymentCollection.id) {
      try {
        await paymentService.deletePaymentCollections([paymentCollection.id]);
      } catch (e: any) {
        console.warn(`[RESET_PAYMENT_SESSION_COLLECTION_ERROR] collection ${paymentCollection.id}`, e?.message);
      }
    }

    // Refresh the cart to get the updated state
    const refreshedCart = await cartService.retrieveCart(id, {
      relations: [
        "items",
        "items.variant",
        "items.variant.product",
        "shipping_methods",
        "payment_collection",
        "payment_collection.payment_sessions",
        "promotions"
      ],
    });

    res.json({ cart: refreshedCart, reset: true });
  } catch (error: any) {
    console.error("[RESET_PAYMENT_SESSION_ERROR]", {
      cart_id: id,
      message: error?.message,
      stack: error?.stack,
    });
    
    // If anything fails unexpectedly, assume it is stale and unrecoverable
    res.status(409).json({
      code: "STALE_PAYMENT_SESSION",
      message: "The cart payment session is stale. Create a new cart.",
      recreate_cart: true
    });
  }
}
