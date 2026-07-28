//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/**
 * Agent identifiers in the telemetry are shaped `<family>:<version>`, for
 * example `ct-ag-doc:2`. This module is the single source of truth for
 * turning those raw ids into human labels, so the DAX stays purely about
 * data and no view ever renders a raw id by accident.
 */

/** Explicit labels for known agent families. */
const FAMILY_LABELS: Record<string, string> = {
    "ct-ag-doc": "Document Agent",
    "ct-ag-customer": "Customer Agent",
    "ct-ag-support": "Support Agent",
};

/** Prefix stripped from unknown families before deriving a fallback label. */
const FAMILY_PREFIX = "ct-ag-";

/** A parsed agent identifier. */
export interface AgentIdentity {
    /** The raw id exactly as stored, e.g. `ct-ag-doc:2`. */
    id: string;
    /** The portion before the version separator, e.g. `ct-ag-doc`. */
    family: string;
    /** Friendly family name, e.g. `Document Agent`. */
    label: string;
    /** Bare version token, e.g. `2`. Empty when the id carries no version. */
    version: string;
    /** Version formatted for display, e.g. `v2`. Empty when unversioned. */
    versionLabel: string;
    /** Fully qualified display name, e.g. `Document Agent v2`. */
    displayName: string;
}

/**
 * Derives a readable label for a family that has no explicit mapping, so a
 * newly onboarded agent still renders sensibly instead of leaking its id.
 * `ct-ag-risk-review` becomes `Risk Review Agent`.
 */
function deriveLabel(family: string): string {
    const stem = family.startsWith(FAMILY_PREFIX) ? family.slice(FAMILY_PREFIX.length) : family;

    const words = stem
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1));

    if (words.length === 0) return family;
    if (words[words.length - 1].toLowerCase() === "agent") return words.join(" ");
    return `${words.join(" ")} Agent`;
}

/** Splits an agent id into its family, version, and display labels. */
export function parseAgentId(rawId: unknown): AgentIdentity {
    const id = String(rawId ?? "").trim();

    // Split on the last separator so families containing ":" still parse.
    const sep = id.lastIndexOf(":");
    const hasVersion = sep > 0 && sep < id.length - 1;
    const family = hasVersion ? id.slice(0, sep) : id;
    const version = hasVersion ? id.slice(sep + 1) : "";

    const label = FAMILY_LABELS[family] ?? deriveLabel(family);
    const versionLabel = version ? `v${version}` : "";

    return {
        id,
        family,
        label,
        version,
        versionLabel,
        displayName: versionLabel ? `${label} ${versionLabel}` : label,
    };
}

/** Convenience helper for the common "just give me the display name" case. */
export function agentDisplayName(rawId: unknown): string {
    return parseAgentId(rawId).displayName;
}
