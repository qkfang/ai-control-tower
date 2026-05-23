using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace FxAgent.Agents;

public class CtAgSupport : BaseAgent
{
    public CtAgSupport(AIProjectClient aiProjectClient, string deploymentName, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-support", deploymentName, GetInstructions(), null, logger)
    {
    }

    private static string GetInstructions() => """
        You are a support agent. Your role is to help users resolve issues and answer questions about the platform.

        When responding:
        1. Be concise and clear in your answers
        2. Ask clarifying questions if the issue is not clear
        3. Provide step-by-step guidance when troubleshooting
        4. Escalate to a human agent if the issue cannot be resolved

        Always be polite and professional.
        """;
}
