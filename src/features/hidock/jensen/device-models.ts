export type HiDockModel =
  | "hidock-h1"
  | "hidock-h1e"
  | "hidock-p1"
  | "hidock-p1:mini"
  | "hidock-h1:lite"

export const HINOTES_PRODUCT_MODELS: Readonly<Record<number, HiDockModel>> = {
  45068: "hidock-h1",
  45069: "hidock-h1e",
  45070: "hidock-p1",
  45071: "hidock-p1:mini",
  256: "hidock-h1",
  257: "hidock-h1e",
  258: "hidock-h1",
  259: "hidock-h1e",
  8256: "hidock-p1",
  8257: "hidock-p1:mini",
  260: "hidock-h1:lite",
}

/**
 * Product IDs used by earlier HiDock hardware. They remain aliases and never
 * override the authoritative HiNotes meanings above.
 */
export const LEGACY_PRODUCT_ALIASES: Readonly<Record<number, HiDockModel>> = {
  44812: "hidock-h1",
  44813: "hidock-h1e",
  44814: "hidock-p1",
  44815: "hidock-p1:mini",
}

export function modelFromProductId(
  productId?: number,
): HiDockModel | undefined {
  if (productId == null) return undefined
  return HINOTES_PRODUCT_MODELS[productId] ?? LEGACY_PRODUCT_ALIASES[productId]
}

export function isSupportedJensenDevice(device: {
  productId: number
  productName?: string
}): boolean {
  return (
    modelFromProductId(device.productId) != null ||
    /\bhidock\b/i.test(device.productName ?? "")
  )
}
