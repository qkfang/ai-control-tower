//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { RayfinClient } from "@microsoft/rayfin-client";
import type { KillSwitchFunctions } from "./kill-switch";

let _client: RayfinClient<Record<string, any>, KillSwitchFunctions> | undefined;

/**
 * Returns the pre-configured RayfinClient singleton.
 */
export function getRayfinClient(): RayfinClient<Record<string, any>, KillSwitchFunctions> {
    if (!_client) {
        const apiUrl = import.meta.env.VITE_RAYFIN_API_URL;
        const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY;

        if (!apiUrl || !publishableKey) {
            throw new Error(`Missing required env vars for creating rayfin client - run 'npx rayfin up'`);
        }

        _client = new RayfinClient<Record<string, any>, KillSwitchFunctions>({
            baseUrl: apiUrl,
            publishableKey,
            authStorage: true,
            useProxy: false,
            functionsBaseUrl: import.meta.env.VITE_RAYFIN_FUNCTIONS_URL,
        });
    }

    return _client;
}