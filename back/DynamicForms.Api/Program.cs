using System.Text.Json;
using System.Text.Json.Serialization;
using DynamicForms.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        // Le front consomme du camelCase, et on n'envoie pas les branches vides du schéma
        // (visibleIf, options, fields sont absents sur la plupart des champs).
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddSingleton<FormSchemaCatalog>();
builder.Services.AddSingleton<ResourceCatalog>();
builder.Services.AddSingleton<FormSchemaValidator>();

builder.Services.AddOpenApi();

const string AngularCors = "angular";
builder.Services.AddCors(options =>
    options.AddPolicy(AngularCors, policy => policy
        .WithOrigins("http://localhost:4200")
        .AllowAnyHeader()
        .AllowAnyMethod()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(AngularCors);
app.MapControllers();

app.Run();
