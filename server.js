// --- server.js para TESTE DE FUMAÇA (v2 - Importação Explícita) ---

require("dotenv").config();

// CORREÇÃO: Importar explicitamente os componentes necessários do Sentry.
// Esta é a maneira mais robusta para ambientes CommonJS.
const { init, Handlers } = require("@sentry/node");

// Inicialização Mínima do Sentry, usando a função 'init' importada.
init({
  dsn: "https://3f1ba888a405e00e37691801ce9fa998@o4510002850824192.ingest.us.sentry.io/4510003238141952",
  tracesSampleRate: 1.0,
});

const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

// Os Handlers do Sentry, usando o objeto 'Handlers' importado.
app.use(Handlers.requestHandler());
app.use(Handlers.tracingHandler());

// Rota de teste simples
app.get("/", (req, res) => {
  res.send("Servidor de teste mínimo está funcionando!");
});

// Rota para testar a captura de erros
app.get("/debug-sentry-test", (req, res) => {
  throw new Error("Erro de teste do servidor mínimo.");
});

// O Error Handler do Sentry
app.use(Handlers.errorHandler());

// Inicialização do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor de TESTE rodando com sucesso na porta ${port}`);
});
