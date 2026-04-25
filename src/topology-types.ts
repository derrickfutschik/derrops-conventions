/**
 * Binds an AZ suffix to a fixed CIDR slot within a kind's /22 block.
 *
 * `slot` determines the /24 offset within the kind's /22:
 * - slot 0 → first /24  (offset 0 addresses)
 * - slot 1 → second /24 (offset 256 addresses)
 * - slot 2 → third /24  (offset 512 addresses)
 * - slot 3 → fourth /24 (offset 768 addresses)
 *
 * Valid range: 0–3. Never change the slot of an existing AZ — this changes its CIDR.
 * To add a new AZ, append a new entry with a slot number higher than all existing ones.
 */
export interface AzAllocation {
  /** CIDR offset within the kind's /22. Valid: 0–3. */
  slot: number
  /** AZ suffix, e.g. `'1a'`, `'1b'`, `'1c'`. */
  az: string
}

/**
 * Binds a subnet kind (tier) to a fixed CIDR slot within a domain's /20 block.
 *
 * `slot` determines the /22 offset within the domain's /20:
 * - slot 0 → first /22  (offset 0 addresses)
 * - slot 1 → second /22 (offset 1024 addresses)
 * - slot 2 → third /22  (offset 2048 addresses)
 * - slot 3 → fourth /22 (offset 3072 addresses)
 *
 * Valid range: 0–3. Never change the slot of an existing kind — this changes all its subnet CIDRs.
 * To add a new kind, append with a slot number higher than all existing ones.
 */
export interface KindAllocation {
  /** CIDR offset within the domain's /20. Valid: 0–3. */
  slot: number
  /** Tier name — `'private'`, `'public'`, `'isolated'`, or any custom string. */
  name: string
  /**
   * Per-kind AZ overrides. When present, takes priority over the domain-level
   * `azAllocations` and the global `azAllocations`.
   */
  azAllocations?: AzAllocation[]
}

/**
 * Per-domain topology configuration overlay.
 *
 * Exactly one of `kinds`, `includeKinds`, or `additionalKinds` may be set.
 *
 * - `kinds` replaces `defaultKinds` entirely (requires explicit slot numbers).
 * - `includeKinds` filters `defaultKinds` to only the named tiers, preserving their slots.
 * - `additionalKinds` extends `defaultKinds` with extra tiers (must use distinct slots).
 * - `azAllocations` overrides the global AZ list for this domain only.
 *
 * @example Only private and isolated for the identity domain
 * ```ts
 * domains: {
 *   identity: { includeKinds: ['private', 'isolated'] },
 * }
 * ```
 */
export interface DomainAllocationConfig {
  /**
   * Replace `defaultKinds` entirely for this domain with an explicit slot-based list.
   * Mutually exclusive with `includeKinds` and `additionalKinds`.
   */
  kinds?: KindAllocation[]
  /**
   * Filter `defaultKinds` to only the named tiers. Each kept kind retains its original
   * slot number, so existing CIDRs are undisturbed. Names not present in `defaultKinds`
   * are ignored with a warning.
   * Mutually exclusive with `kinds` and `additionalKinds`.
   */
  includeKinds?: string[]
  /**
   * Append extra kinds to `defaultKinds` for this domain.
   * Slot numbers must not conflict with slots already used in `defaultKinds`.
   * Mutually exclusive with `kinds` and `includeKinds`.
   */
  additionalKinds?: KindAllocation[]
  /** Override the global `azAllocations` for this domain only. */
  azAllocations?: AzAllocation[]
}

/**
 * Options for `topology()`. Fully backward-compatible with the legacy
 * `{ vpcCidr, azs, kinds? }` shape — shorthand fields are automatically
 * converted to slot-based allocations (array position becomes slot index).
 *
 * @example Backward-compatible (slot 0 = array[0], slot 1 = array[1], …)
 * ```ts
 * orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
 * ```
 *
 * @example Slot-based — add a fourth AZ without touching existing CIDRs
 * ```ts
 * orgC.topology({
 *   vpcCidr: '10.0.0.0/16',
 *   azAllocations: [
 *     { slot: 0, az: '1a' },
 *     { slot: 1, az: '1b' },
 *     { slot: 2, az: '1c' },
 *     // Later addition — existing slots 0-2 are undisturbed:
 *     { slot: 3, az: '1d' },
 *   ],
 * })
 * ```
 *
 * @example Per-domain kind control
 * ```ts
 * orgC.topology({
 *   vpcCidr: '10.0.0.0/16',
 *   azs: ['1a', '1b'],
 *   defaultKinds: [
 *     { slot: 0, name: 'private' },
 *     { slot: 1, name: 'isolated' },
 *   ],
 *   domains: {
 *     // payments also needs a public tier
 *     payments: {
 *       additionalKinds: [{ slot: 2, name: 'public' }],
 *     },
 *   },
 * })
 * ```
 */
export interface TopologyOptions {
  vpcCidr: string

  // ── Structured (stable, slot-based) ──────────────────────────────────────
  /** Global AZ defaults with explicit slot numbers. */
  azAllocations?: AzAllocation[]
  /** Subnet kinds applied to all domains by default. */
  defaultKinds?: KindAllocation[]
  /** Per-domain overrides. Keys are domain names. */
  domains?: Record<string, DomainAllocationConfig>

  // ── Shorthand / backward-compat ───────────────────────────────────────────
  /** Shorthand AZ list. Auto-assigned slots 0, 1, 2… (same behaviour as before). */
  azs?: string[]
  /** Shorthand kind list. Auto-assigned slots 0, 1, 2… (same behaviour as before). */
  kinds?: string[]
}

// ── Capacity reporting ────────────────────────────────────────────────────────

/** CIDR slot utilisation for one domain. */
export interface DomainCapacityReport {
  domain: string
  kindSlotsUsed: number
  kindSlotsTotal: 4
  perKind: Array<{
    name: string
    slot: number
    azSlotsUsed: number
    azSlotsTotal: 4
  }>
}

/**
 * Full capacity report returned by `capacityReport()`.
 * `warnings` is non-empty when any domain exceeds 75 % slot utilisation.
 */
export interface TopologyCapacityReport {
  domains: DomainCapacityReport[]
  warnings: string[]
}
