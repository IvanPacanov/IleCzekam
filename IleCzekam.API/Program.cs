using System.Reflection;
using Scalar.AspNetCore;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi(options =>
{
    options.AddSchemaTransformer((schema, ctx, ct) =>
    {
        Type type = ctx.JsonTypeInfo.Type;

        if(type.Namespace is not null && !type.Namespace.StartsWith("System"))
        {
            schema.Title = (type.DeclaringType?.Name ?? "") + "_" + type.Name;
        }

        return Task.CompletedTask;
    });
});

WebApplication app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.WithTitle(Assembly.GetEntryAssembly()!.FullName!.Split(",").First())
               .WithTheme(ScalarTheme.Mars);
    });
}

app.UseHttpsRedirection();

app.MapControllers();

app.Run();
