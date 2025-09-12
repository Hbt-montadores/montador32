// --- server.js para TESTE DE FUMAÇA ---

// Sentry DEVE ser o primeiro módulo importado e inicializado.
require("dotenv").config();
const Sentry = require("@sentry/node");

// Inicialização Mínima do Sentry
Sentry.init({
  dsn: "https://3f1ba888a405e00e37691801ce9fa998@o4510002850824192.ingest.us.sentry.io/4510003238141952",
  tracesSampleRate: 1.0,
});

// Apenas o Express é importado depois
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

// Os Handlers do Sentry devem ser os primeiros middlewares
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Rota de teste simples
app.get("/", (req, res) => {
  res.send("Servidor de teste mínimo está funcionando!");
});

// Rota para testar a captura de erros
app.get("/debug-sentry-test", (req, res) => {
  throw new Error("Erro de teste do servidor mínimo.");
});

// O Error Handler do Sentry deve vir depois das rotas
app.use(Sentry.Handlers.errorHandler());

// Inicialização do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor de TESTE rodando com sucesso na porta ${port}`);
});
