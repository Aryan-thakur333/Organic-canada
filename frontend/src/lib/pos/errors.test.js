import { describe, expect, it } from "vitest";
import { posErrorCode, posErrorMessage } from "./errors";

const apiError = (status, code, message = "") => ({ response: { status, data: { code, message } } });

describe("POS operator-facing error contract", () => {
  it.each([
    [403, "POS_OPERATOR_NOT_ASSIGNED", "You are not assigned to the selected register."],
    [403, "POS_REGISTER_NOT_ASSIGNED", "Operator is not assigned to this register."],
    [409, "POS_REGISTER_SESSION_MISMATCH", "Your active POS session belongs to another register."],
    [409, "POS_SESSION_NOT_OPEN", "Open the register session before scanning products."],
    [409, "POS_SESSION_OPEN_BY_OTHER_OPERATOR", "This register is currently open under another operator."],
    [404, "POS_PRODUCT_NOT_FOUND", "No matching product found."],
    [422, "POS_PRODUCT_NOT_IN_SALES_CHANNEL", "This product is not available in the selected POS sales channel."],
    [422, "POS_PRICE_NOT_AVAILABLE", "This product has no USD price for the USA register."],
    [422, "POS_PRICE_UNAVAILABLE", "This product has no valid price for the selected register currency."],
    [422, "POS_INVENTORY_UNAVAILABLE", "Inventory is unavailable at the selected POS location."],
    [422, "POS_INSUFFICIENT_INVENTORY", "This product is out of stock at this POS location."],
  ])("maps %s %s to an actionable message", (status, code, expected) => {
    expect(posErrorMessage(apiError(status, code), "usd")).toBe(expected);
  });

  it("maps connection refusal to a backend-unavailable state", () => {
    const error = { code: "ERR_NETWORK", message: "net::ERR_CONNECTION_REFUSED" };
    expect(posErrorCode(error)).toBe("BACKEND_OFFLINE");
    expect(posErrorMessage(error)).toBe("POS backend is unavailable. Start the backend and retry.");
  });
});
