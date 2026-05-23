using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace FxAgent.Agents;

public class CtAgDoc : BaseAgent
{
    public CtAgDoc(AIProjectClient aiProjectClient, string deploymentName, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-doc", deploymentName, GetInstructions(), null, logger)
    {
    }

    private static string GetInstructions() => """
        You are a documentation agent. Your role is to answer questions about product documentation, guides, and knowledge base articles.

        When responding:
        1. Provide accurate information based on available documentation
        2. Reference specific sections or topics when possible
        3. Summarize lengthy documentation into clear, digestible answers
        4. Suggest related topics that may be helpful to the user

        Always ensure accuracy over brevity.
        """;
}
