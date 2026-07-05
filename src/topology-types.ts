/**
 * Binds an AZ suffix to a fixed CIDR slot within a kind's /22 block.
 *
 * Used at the **domain level** to specify a custom AZ set that differs from the global
 * `azs` list. `slot` is required because the domain may be specifying a subset —
 * the slot number preserves the original CIDR position of each AZ.
 *
 * `slot` determines the /24 offset within the kind's /22:
 * - slot 0 → first /24  (offset 0 addresses)
 * - slot 1 → second /24 (offset 256 addresses)
 * - slot 2 → third /24  (offset 512 addresses)
 * - slot 3 → fourth /24 (offset 768 addresses)
 *
 * Valid range: 0–3.
 */
export interface AzAllocation {
  /** CIDR offset within the kind's /22. Valid: 0–3. */
  slot: number
  /** AZ suffix, e.g. `'1a'`, `'1b'`, `'1c'`. */
  az: string
  /**
   * Ordinal index disambiguating **multiple subnets in the same tier + AZ**. AWS subnets are
   * immutable, so when a subnet fills up the only remedy is to add another one in the same AZ;
   * `num` gives that additional subnet a unique name (`…--1a--2`, `…--1a--3`). It occupies its
   * own `slot` (and therefore its own CIDR) — `num` is a naming disambiguator only.
   *
   * Defaults to the 1-based occurrence count of `az` within the allocation list (first `1a` → 1,
   * second `1a` → 2). The first subnet (`num` 1) omits the index for name stability. Set it
   * explicitly to pin the index when preserving CIDRs across a subset override.
   */
  num?: number
}

/**
 * Binds a subnet kind (tier) to a fixed CIDR slot within a domain's /20 block.
 *
 * Used at the **domain level** when a domain has a custom kind set that differs from the
 * global `kinds` list. `slot` is required because the domain may be specifying a subset —
 * the slot number preserves the original CIDR position of each kind.
 *
 * `slot` determines the /22 offset within the domain's /20:
 * - slot 0 → first /22  (offset 0 addresses)
 * - slot 1 → second /22 (offset 1024 addresses)
 * - slot 2 → third /22  (offset 2048 addresses)
 * - slot 3 → fourth /22 (offset 3072 addresses)
 *
 * Valid range: 0–3.
 */
export interface KindAllocation {
  /** CIDR offset within the domain's /20. Valid: 0–3. */
  slot: number
  /** Tier name — `'private'`, `'public'`, `'isolated'`, or any custom string. */
  name: string
  /**
   * Per-kind AZ overrides. When present, takes priority over the domain-level
   * `azAllocations` and the global `azs`.
   */
  azAllocations?: AzAllocation[]
}

/**
 * Per-domain topology configuration overlay.
 *
 * Exactly one of `kinds`, `includeKinds`, or `additionalKinds` may be set.
 *
 * - `kinds` replaces the global `kinds` entirely for this domain (requires explicit slots
 *   to preserve CIDRs from the original global allocation).
 * - `includeKinds` filters the global `kinds` to only the named tiers, preserving their
 *   CIDR positions automatically.
 * - `additionalKinds` extends the global `kinds` with extra tiers for this domain only.
 * - `azAllocations` overrides the global `azs` for this domain (requires explicit slots).
 *
 * @example Only private and isolated — no public-facing load balancer tier
 * ```ts
 * domains: {
 *   identity: { includeKinds: ['private', 'isolated'] },
 * }
 * ```
 *
 * @example Explicit slot-based override — preserves CIDRs when selecting a subset
 * ```ts
 * // Global kinds: ['private', 'public', 'isolated'] (slots 0, 1, 2)
 * // This domain wants private (slot 0) and isolated (slot 2), keeping the gap at slot 1.
 * domains: {
 *   identity: {
 *     kinds: [
 *       { slot: 0, name: 'private' },
 *       { slot: 2, name: 'isolated' },
 *     ],
 *   },
 * }
 * ```
 */
export interface DomainAllocationConfig {
  /**
   * Replace the global `kinds` entirely for this domain with an explicit slot-based list.
   * Use this when the domain needs kinds at specific CIDR positions that differ from the
   * global defaults. Mutually exclusive with `includeKinds` and `additionalKinds`.
   */
  kinds?: KindAllocation[]
  /**
   * Filter the global `kinds` to only the named tiers. Each kept kind retains its original
   * CIDR slot (array position in the global `kinds`), so existing subnets are undisturbed.
   * Mutually exclusive with `kinds` and `additionalKinds`.
   */
  includeKinds?: string[]
  /**
   * Append extra kinds to the global `kinds` for this domain only.
   * Slot numbers must not conflict with slots already used by the global `kinds`.
   * Mutually exclusive with `kinds` and `includeKinds`.
   */
  additionalKinds?: KindAllocation[]
  /**
   * Override the global `azs` for this domain only. Requires explicit slot numbers
   * because the domain may be specifying a subset of the global AZs.
   */
  azAllocations?: AzAllocation[]
  /**
   * Size this domain's CIDR block independently of the others, as a prefix length (e.g. `24`
   * for a `/24`). Overrides the global `domainBits` sizing for this domain only. Use it to give
   * a small domain — say a database-only domain that needs a handful of addresses — a tighter
   * block than data-heavy domains.
   *
   * The tier and AZ blocks scale with the domain: `tier = cidrPrefix + 2`, `subnet = cidrPrefix + 4`.
   * So a `/24` domain has `/26` tiers and `/28` subnets (16 addresses, ~11 usable — the AWS
   * minimum); a `/23` domain has `/27` subnets (~27 usable). `/24` is the practical floor.
   *
   * Domains are packed into the VPC in declared order, each aligned to its own block size, so
   * **mixing sizes can leave alignment gaps** — declare larger domains first for tight packing.
   * Valid range: greater than the VPC prefix, up to `28`.
   */
  cidrPrefix?: number
}

/**
 * Options for `topology()`.
 *
 * At the global level, `azs` and `kinds` are plain ordered arrays — array position
 * determines the CIDR slot (position 0 = slot 0, etc.). Always append to grow;
 * never insert or reorder.
 *
 * Slots appear only at the **domain level** (`DomainAllocationConfig`), where a domain
 * may use a subset of the global kinds or AZs and needs to declare which CIDR positions
 * it occupies.
 *
 * @example Basic — two AZs, default three kinds
 * ```ts
 * orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b'] })
 * ```
 *
 * @example Per-domain kind control
 * ```ts
 * orgC.topology({
 *   vpcCidr: '10.0.0.0/16',
 *   azs: ['1a', '1b'],
 *   kinds: ['private', 'isolated'],
 *   domains: {
 *     // payments also needs a public tier — slot 2 (next after 'isolated' at slot 1)
 *     payments: {
 *       additionalKinds: [{ slot: 2, name: 'public' }],
 *     },
 *   },
 * })
 * ```
 *
 * @example Adding a third AZ later — append-only, existing CIDRs unchanged
 * ```ts
 * // v1
 * orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b'] })
 * // v2 — append '1c'; '1a' and '1b' CIDRs are identical
 * orgC.topology({ vpcCidr: '10.0.0.0/16', azs: ['1a', '1b', '1c'] })
 * ```
 */
export interface TopologyOptions {
  vpcCidr: string
  /**
   * Width of the domain index field, in bits. Determines how many domains fit in the VPC:
   * `2 ** domainBits`. Defaults to `4` (16 domains), the historical fixed value.
   *
   * Each domain block is `vpcPrefix + domainBits` wide, so **increasing `domainBits` shrinks
   * every domain block** (and therefore every subnet) unless you widen `vpcCidr` by the same
   * number of bits. To double the domain count while keeping subnet sizing identical, add one
   * bit here and one bit to the VPC (e.g. `/16` + `domainBits: 4` → `/15` + `domainBits: 5`).
   *
   * Changing this on an existing deployment moves every domain's base CIDR — it is a
   * greenfield/reprovision decision, not an in-place expansion. Valid range: 1 up to
   * `28 - vpcPrefix` (2 bits are reserved for the kind tier and 2 for the AZ).
   */
  domainBits?: number
  /**
   * Availability zone suffixes, e.g. `['1a', '1b', '1c']`.
   * Array position determines CIDR slot — always append, never reorder.
   */
  azs: string[]
  /**
   * Subnet kind (tier) names applied to all domains by default.
   * Defaults to `['private', 'public', 'isolated']`.
   * Array position determines CIDR slot — always append, never reorder.
   */
  kinds?: string[]
  /** Per-domain overrides. Keys are domain names. */
  domains?: Record<string, DomainAllocationConfig>
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
 * `warnings` is non-empty when the VPC exceeds 75 % domain-slot utilisation, or when any
 * domain exceeds 75 % kind-slot or AZ-slot utilisation.
 */
export interface TopologyCapacityReport {
  /** Number of constrained domains occupying domain slots. */
  domainSlotsUsed: number
  /** Total domain slots available in the VPC at the default size — `2 ** domainBits`. */
  domainSlotsTotal: number
  /**
   * VPC addresses consumed by the packed domains, including any alignment gaps between
   * differently-sized domains. Correct whether domains are uniform or individually sized.
   */
  addressesUsed: number
  /** Total addresses in the VPC — `2 ** (32 - vpcPrefix)`. */
  addressesTotal: number
  domains: DomainCapacityReport[]
  warnings: string[]
}
