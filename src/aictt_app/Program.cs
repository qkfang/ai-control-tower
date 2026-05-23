using Azure.AI.Projects;
using Azure.AI.Projects.Agents;
using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using FxAgent.Agents;
using OpenAI.Responses;
using OpenTelemetry.Instrumentation.Http;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenTelemetry().UseAzureMonitor();

// Exclude Live Metrics (QuickPulse) calls from telemetry to avoid self-tracking noise
builder.Services.Configure<HttpClientTraceInstrumentationOptions>(options =>
{
    options.FilterHttpRequestMessage = req =>
    {
        var host = req.RequestUri?.Host;
        if (string.IsNullOrEmpty(host)) return true;
        return !host.EndsWith("livediagnostics.monitor.azure.com", StringComparison.OrdinalIgnoreCase);
    };
});

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHealthChecks();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHealthChecks("/health");

app.MapGet("/", () => Results.Redirect("/index.html"));

var logger = app.Services.GetRequiredService<ILogger<Program>>();

var endpoint = app.Configuration["AZURE_AI_PROJECT_ENDPOINT"]
    ?? throw new InvalidOperationException("AZURE_AI_PROJECT_ENDPOINT is not set.");
var deploymentName = app.Configuration["AZURE_AI_MODEL_DEPLOYMENT_NAME"]
    ?? throw new InvalidOperationException("AZURE_AI_MODEL_DEPLOYMENT_NAME is not set.");
var webSearchTool = ResponseTool.CreateWebSearchTool();

var tenantId = app.Configuration["AZURE_TENANT_ID"];
var defaultCredential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
{
    TenantId = tenantId,
    ExcludeVisualStudioCodeCredential = true,
    ExcludeSharedTokenCacheCredential = true
});

AIProjectClient aiProjectClient = new(new Uri(endpoint), defaultCredential);

var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();

var supportAgent = new CtAgSupport(aiProjectClient, deploymentName, loggerFactory.CreateLogger<CtAgSupport>());
var docAgent = new CtAgDoc(aiProjectClient, deploymentName, loggerFactory.CreateLogger<CtAgDoc>());
var customerAgent = new CtAgCustomer(aiProjectClient, deploymentName, loggerFactory.CreateLogger<CtAgCustomer>());

app.MapPost("/support", async (ChatRequest request) =>
{
    logger.LogInformation("Support request: {Message}", request.Message);
    var response = await supportAgent.RunAsync(request.Message);
    return Results.Ok(new { response });
});

app.MapPost("/doc", async (ChatRequest request) =>
{
    logger.LogInformation("Doc request: {Message}", request.Message);
    var response = await docAgent.RunAsync(request.Message);
    return Results.Ok(new { response });
});

app.MapPost("/customer", async (ChatRequest request) =>
{
    logger.LogInformation("Customer request: {Message}", request.Message);
    var response = await customerAgent.RunAsync(request.Message);
    return Results.Ok(new { response });
});

await app.RunAsync();

record ChatRequest(string Message);
