using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;

namespace FxAgent.Agents;

public class CtAgCustomer : BaseAgent
{
    public CtAgCustomer(AIProjectClient aiProjectClient, string deploymentName, ILogger? logger = null)
        : base(aiProjectClient, "ct-ag-customer", deploymentName, GetInstructions(), null, logger)
    {
    }

    private static string GetInstructions() => """
        You are a customer relationship agent. Your role is to assist customers with account inquiries, service questions, and general information.

        When responding:
        1. Address the customer by acknowledging their question directly
        2. Provide clear answers about account features, billing, and services
        3. Guide customers to the right resources or next steps
        4. Maintain a friendly and empathetic tone throughout the conversation

        Always prioritize customer satisfaction.
        """;
}
