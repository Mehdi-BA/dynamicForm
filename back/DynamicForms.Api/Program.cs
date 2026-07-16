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
builder.Services.AddSingleton<FieldLibrary>();
builder.Services.AddSingleton<DataSourceLibrary>();
builder.Services.AddSingleton<LookupService>();
builder.Services.AddSingleton<FormSchemaValidator>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

const string AngularCors = "angular";
builder.Services.AddCors(options =>
    options.AddPolicy(AngularCors, policy => policy
        .WithOrigins("http://localhost:4200")
        .AllowAnyHeader()
        .AllowAnyMethod()));

var app = builder.Build();

// Construire le catalogue tout de suite : il compose ses formulaires depuis la bibliothèque,
// et un champ manquant est une incohérence. Sans ça, le DI attendrait la première requête et
// l'erreur sortirait en 500 — bien plus difficile à rattacher à sa cause qu'un échec net ici.
app.Services.GetRequiredService<FormSchemaCatalog>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(AngularCors);
app.MapControllers();

app.Run();
