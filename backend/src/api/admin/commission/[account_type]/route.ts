import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const VALID_ACCOUNT_TYPES = ["normal_customer", "b2b_customer", "vendor"] as const
type AccountType = typeof VALID_ACCOUNT_TYPES[number]

const DEFAULT_FEE_VALUES: Record<AccountType, number> = {
  normal_customer: 10,
  b2b_customer: 10,
  vendor: 8,
}

function isValidAccountType(accountType: string): accountType is AccountType {
  return VALID_ACCOUNT_TYPES.includes(accountType as AccountType)
}

function isMissingCommissionSchemaError(error: any) {
  const message = String(error?.message || "")
  return (
    message.includes("commission_setting") &&
    (message.includes("does not exist") || message.includes("relation"))
  )
}

function serializeSetting(setting: any) {
  return {
    id: setting.id,
    account_type: setting.account_type,
    fee_type: setting.fee_type,
    fee_value: Number(setting.fee_value),
    is_active: Boolean(setting.is_active),
    created_at: setting.created_at,
    updated_at: setting.updated_at,
  }
}

function rows(result: any) {
  return result?.rows || result || []
}

async function getOrCreateSetting(connection: any, accountType: AccountType) {
  const settingResult = await connection.raw(
    `
      SELECT *
      FROM "commission_setting"
      WHERE "account_type" = ?
      AND "deleted_at" IS NULL
      ORDER BY "updated_at" DESC NULLS LAST, "created_at" DESC NULLS LAST, "id" ASC
      LIMIT 1
    `,
    [accountType]
  )
  const setting = rows(settingResult)[0]

  if (setting) {
    return setting
  }

  const inserted = await connection.raw(
    `
      INSERT INTO "commission_setting" (
        "id",
        "account_type",
        "fee_type",
        "fee_value",
        "is_active",
        "created_at",
        "updated_at"
      )
      VALUES (?, ?, 'percentage', ?, true, now(), now())
      RETURNING *
    `,
    [`commset_${accountType}`, accountType, DEFAULT_FEE_VALUES[accountType]]
  )

  return rows(inserted)[0]
}

function validatePayload(body: any) {
  const feeType = body?.fee_type
  const rawFeeValue = Number(body?.fee_value)
  const isActive = body?.is_active ?? true

  if (!["percentage", "fixed"].includes(feeType)) {
    return { error: "fee_type must be either 'percentage' or 'fixed'." }
  }

  if (!Number.isFinite(rawFeeValue)) {
    return { error: "fee_value must be a valid number." }
  }

  if (feeType === "percentage" && (rawFeeValue < 0 || rawFeeValue > 100)) {
    return { error: "For percentage fee type, fee_value must be between 0 and 100." }
  }

  if (feeType === "fixed" && rawFeeValue < 0) {
    return { error: "For fixed fee type, fee_value must be zero or greater." }
  }

  if (typeof isActive !== "boolean") {
    return { error: "is_active must be a boolean." }
  }

  return {
    value: {
      fee_type: feeType,
      fee_value: rawFeeValue,
      is_active: isActive,
    },
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { account_type } = req.params as { account_type: string }

    if (!isValidAccountType(account_type)) {
      return res.status(400).json({ message: "Invalid account_type" })
    }

    const connection = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const setting = await getOrCreateSetting(connection, account_type)

    return res.status(200).json({ setting: serializeSetting(setting) })
  } catch (error: any) {
    console.error("[COMMISSION_SETTING_ROUTE_ERROR]", {
      method: req.method,
      url: req.url,
      params: req.params,
      message: error?.message,
      stack: error?.stack,
    })

    if (isMissingCommissionSchemaError(error)) {
      return res.status(500).json({ message: "Commission schema missing. Run repair-commission-schema.ts" })
    }

    return res.status(500).json({ message: "An unexpected error occurred while retrieving the commission setting." })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { account_type } = req.params as { account_type: string }

    if (!isValidAccountType(account_type)) {
      return res.status(400).json({ message: "Invalid account_type" })
    }

    const validation = validatePayload(req.body)
    if ("error" in validation) {
      return res.status(400).json({ message: validation.error })
    }

    const connection = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await getOrCreateSetting(connection, account_type)

    const updated = await connection.raw(
      `
        UPDATE "commission_setting"
        SET
          "fee_type" = ?,
          "fee_value" = ?,
          "is_active" = ?,
          "updated_at" = now()
        WHERE "account_type" = ?
        AND "deleted_at" IS NULL
        RETURNING *
      `,
      [
        validation.value.fee_type,
        validation.value.fee_value,
        validation.value.is_active,
        account_type,
      ]
    )

    const updatedSettings = rows(updated)
    const setting = updatedSettings
      .sort((a: any, b: any) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime()
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime()
        return bTime - aTime
      })[0]

    if (!setting) {
      throw new Error("Commission setting could not be saved.")
    }

    return res.status(200).json({
      setting: serializeSetting(setting),
      message: "Commission setting saved successfully",
    })
  } catch (error: any) {
    console.error("[COMMISSION_SETTING_ROUTE_ERROR]", {
      method: req.method,
      url: req.url,
      params: req.params,
      message: error?.message,
      stack: error?.stack,
    })

    if (isMissingCommissionSchemaError(error)) {
      return res.status(500).json({ message: "Commission schema missing. Run repair-commission-schema.ts" })
    }

    return res.status(500).json({ message: "An unexpected error occurred while saving the commission setting." })
  }
}

export const PATCH = POST
export const PUT = POST
