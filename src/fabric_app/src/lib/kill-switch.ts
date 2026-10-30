//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type { FunctionsSchema } from "@microsoft/rayfin-functions";

/** Result returned by the server-side `kill_agent` Python function. */
export interface KillAgentResult {
    agentId: string;
    status: string;
}

export type KillSwitchFunctions = FunctionsSchema & {
    kill_agent: { input: { agent_id: string }; output: KillAgentResult };
};
