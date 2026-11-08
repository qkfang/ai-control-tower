//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { AppShell } from "./components/dashboard/app-shell.component";
import { FiltersProvider } from "./hooks/use-filters";
import { DataChatProvider } from "./hooks/use-data-chat";
import { FoundryChatProvider } from "./hooks/use-foundry-chat";

function App() {
    return (
        <FiltersProvider>
            <DataChatProvider>
                <FoundryChatProvider>
                    <AppShell />
                </FoundryChatProvider>
            </DataChatProvider>
        </FiltersProvider>
    );
}

export default App;
