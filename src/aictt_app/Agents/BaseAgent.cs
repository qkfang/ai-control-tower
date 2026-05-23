using Azure.AI.Extensions.OpenAI;
using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Microsoft.Extensions.Logging;
using OpenAI.Responses;
using System.Diagnostics;

namespace FxAgent.Agents;

public abstract class BaseAgent
{
    protected readonly ProjectResponsesClient _responseClient;
    protected readonly ILogger _logger;
    protected readonly string _agentId;

    protected BaseAgent(AIProjectClient aiProjectClient, string agentId, string deploymentName, string instructions, IList<ResponseTool>? tools = null, ILogger? logger = null)
        : this(aiProjectClient, agentId, deploymentName, instructions, tools, null, logger)
    {
    }

    protected BaseAgent(AIProjectClient aiProjectClient, string agentId, string deploymentName, string instructions, IList<ResponseTool>? tools = null, Action<DeclarativeAgentDefinition>? configureAgent = null, ILogger? logger = null)
    {
        _agentId = agentId;
        _logger = logger ?? LoggerFactory.Create(b => b.AddConsole()).CreateLogger(agentId);

        var agentDefinition = new DeclarativeAgentDefinition(model: deploymentName)
        {
            Instructions = instructions
        };

        if (tools != null)
        {
            foreach (var tool in tools)
            {
                if (tool != null)
                    agentDefinition.Tools.Add(tool);
            }
        }

        configureAgent?.Invoke(agentDefinition);

        var agentVersion = aiProjectClient.AgentAdministrationClient.CreateAgentVersion(
            agentId,
            new ProjectsAgentVersionCreationOptions(agentDefinition)).Value;

        _responseClient = aiProjectClient.ProjectOpenAIClient.GetProjectResponsesClientForAgent(agentVersion.Name);
    }

    public async Task<string> RunAsync(string message)
    {
        var sw = Stopwatch.StartNew();

        CreateResponseOptions nextOptions = new()
        {
            InputItems = { ResponseItem.CreateUserMessageItem(message) }
        };

        ResponseResult? result = null;

        while (nextOptions is not null)
        {
            result = await _responseClient.CreateResponseAsync(nextOptions);
            nextOptions = null;

            foreach (var item in result.OutputItems)
            {
                if (item is McpToolCallApprovalRequestItem mcpCall)
                {
                    _logger.LogInformation("Auto-approving MCP tool call on {ServerLabel}", mcpCall.ServerLabel);
                    nextOptions ??= new CreateResponseOptions { PreviousResponseId = result.Id };
                    nextOptions.InputItems.Add(ResponseItem.CreateMcpApprovalResponseItem(mcpCall.Id, approved: true));
                }
            }
        }

        sw.Stop();
        _logger.LogInformation("Agent {AgentId} completed in {Duration}ms", _agentId, sw.ElapsedMilliseconds);

        return result?.GetOutputText() ?? string.Empty;
    }
}
