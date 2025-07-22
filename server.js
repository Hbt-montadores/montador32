// server.js - Versão 2.0 com Integração Eduzz e Sessão

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const rateLimit = require('express-rate-limit');

// Importa as novas funções e a pool do nosso módulo de banco de dados
const { 
  pool, // Importamos a pool para o connect-pg-simple
  markStatus, 
  getCustomerStatus, 
  getManualPermission 
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1); // Essencial para o rate-limit e logs funcionarem corretamente no Render

// --- 2. MIDDLEWARES (Configurações que rodam em todas as requisições) ---

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Middleware de segurança: Limita as requisições de login para evitar ataques
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 10, // Limita cada IP a 10 requisições de login por janela
	message: '<h1>Muitas tentativas de login</h1><p>Detectamos muitas tentativas a partir do seu IP. Por favor, tente novamente em 15 minutos.</p><a href="/">Voltar</a>',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de sessão: Configura e armazena a sessão no PostgreSQL
// Isso substitui a antiga variável 'session' global
app.use(
  session({
    store: new PgStore({
      pool: pool,
      tableName: 'user_sessions', // Nome da tabela que será criada para as sessões
    }),
    secret: process.env.SESSION_SECRET, // Chave secreta para assinar a sessão
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias de duração do cookie de login
      httpOnly: true, // Previne acesso ao cookie via JS no frontend
      secure: process.env.NODE_ENV === 'production', // Usar cookies seguros em produção
    },
  })
);

// Middleware para proteger rotas: verifica se o usuário está logado
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next(); // Usuário está logado, pode prosseguir
  } else {
    return res.redirect('/'); // Usuário não está logado, é redirecionado para a página de login
  }
}

// --- 3. ROTAS PÚBLICAS (Acessíveis sem login) ---

// Variável de ambiente para acesso geral (mantida para testes)
const ALLOW_ANYONE = process.env.ALLOW_ANYONE === "true";

// Rota principal: exibe a página de login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Rota de Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Erro ao destruir sessão:", err);
      return res.redirect('/app');
    }
    res.clearCookie('connect.sid'); // Limpa o cookie de sessão do navegador
    res.redirect('/');
  });
});

// NOVA ROTA DE LOGIN POR E-MAIL
app.post("/login", loginLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).send("O campo de e-mail é obrigatório.");
    }

    const lowerCaseEmail = email.toLowerCase();

    // Liberação total quando ALLOW_ANYONE=true (mantido para testes)
    if (ALLOW_ANYONE) {
        req.session.user = { email: lowerCaseEmail, status: 'admin_test' };
        return res.redirect("/app");
    }

    try {
        // PRIORIDADE 1: Verificar controle manual
        const manualPermission = await getManualPermission(lowerCaseEmail);
        if (manualPermission) {
            if (manualPermission === 'block') {
                const blockedMessageHTML = `...`; // Adapte seu HTML de erro aqui
                return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
            }
            if (manualPermission === 'allow') {
                req.session.user = { email: lowerCaseEmail, status: 'allowed_manual' };
                return res.redirect('/app');
            }
        }

        // PRIORIDADE 2: Verificar status da Eduzz
        const customerStatus = await getCustomerStatus(lowerCaseEmail);

        switch (customerStatus) {
            case 'paid':
                req.session.user = { email: lowerCaseEmail, status: 'paid' };
                return res.redirect('/app');
            
            case 'overdue':
            case 'canceled':
                // Reutilizando sua estrutura de mensagem de erro para pagamentos pendentes
                const overdueErrorMessageHTML = `
                <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title>
                <style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style>
                </head><body><div class="container"><h1>Atenção!</h1><p>Identificamos que sua assinatura está com o pagamento pendente ou foi cancelada. Clique no botão abaixo para regularizar seu acesso.</p>
                <a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">REGULARIZAR ACESSO</a>
                <a href="/" class="back-link">Tentar novamente após regularizar</a></div></body></html>`;
                return res.status(401).send(overdueErrorMessageHTML);

            default: // null ou qualquer outro status não reconhecido
                // Reutilizando sua estrutura de mensagem de erro para e-mail não encontrado
                const notFoundErrorMessageHTML = `
                <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title>
                <style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style>
                </head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Por favor, verifique se você digitou o mesmo e-mail que usou no momento da compra.</p>
                <a href="/" class="back-link">Tentar com outro e-mail</a></div></body></html>`;
                return res.status(401).send(notFoundErrorMessageHTML);
        }

    } catch (error) {
        console.error("Erro no processo de login:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});


// ROTA DE WEBHOOK (Esqueleto para análise)
app.post("/eduzz/webhook", async (req, res) => {
  console.log("--- NOVO WEBHOOK RECEBIDO DA EDUZZ ---");
  console.log("Cabeçalhos (Headers):", JSON.stringify(req.headers, null, 2));
  console.log("Corpo (Body):", JSON.stringify(req.body, null, 2));

  // Futuramente, aqui entrará a lógica de verificação e processamento.
  // Por enquanto, apenas registramos e respondemos para a Eduzz que recebemos.
  
  res.status(200).send("OK");
});


// --- 4. ROTAS PROTEGIDAS (Apenas para usuários logados) ---

// Rota que serve a página principal do aplicativo
// Agora ela usa o middleware 'requireLogin' para proteção
app.get("/app", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
});


// Sua função original para requisições com timeout, mantida intacta
async function fetchWithTimeout(url, options, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            console.error("[Timeout] OpenAI demorou muito para responder.");
            reject(new Error("Tempo limite atingido para a requisição OpenAI"));
        }, timeout);

        fetch(url, options)
            .then((response) => {
                clearTimeout(timer);
                if (!response.ok)
                    throw new Error(`HTTP error! Status: ${response.status}`);
                return response.json();
            })
            .then(resolve)
            .catch((error) => {
                console.error("[Erro na requisição OpenAI]", error);
                reject(error);
            });
    });
}


// Sua rota de API original, agora protegida e usando o novo sistema de sessão
app.post("/api/next-step", requireLogin, async (req, res) => {
    // A lógica foi movida para usar 'req.session.sermonData' em vez da 'session' global
    const userResponse = req.body.response;
    const step = req.body.step || 1;
    console.log( `Usuário [${req.session.user.email}] - Processando etapa ${step}, resposta: ${userResponse}`);

    try {
        if (step === 1) {
            // Inicia o objeto de dados do sermão na sessão do usuário
            req.session.sermonData = { topic: userResponse };
            return res.json({
                question: "Que tipo de público você vai pregar?",
                options: ["A) Crianças","B) Adolescentes","C) Jovens","D) Mulheres","E) Homens","F) Público misto","G) Não convertido"],
                step: 2,
            });
        } else if (step === 2) {
            req.session.sermonData.audience = userResponse;
            return res.json({
                question: "Que tipo de sermão você vai pregar?",
                options: ["A) Expositivo", "B) Textual", "C) Temático"],
                step: 3,
            });
        } else if (step === 3) {
            req.session.sermonData.sermonType = userResponse;
            return res.json({
                question: "Quantos minutos deve durar o sermão?",
                options: ["Entre 1 e 10 min","Entre 10 e 20 min","Entre 20 e 30 min","Entre 30 e 40 min","Entre 40 e 50 min","Entre 50 e 60 min","Acima de 1 hora"],
                step: 4,
            });
        } else if (step === 4) {
            req.session.sermonData.duration = userResponse;

            const { topic, audience, sermonType, duration } = req.session.sermonData;

            if (!topic || !audience || !sermonType || !duration) {
                return res.status(400).json({ error: "Faltam informações para gerar o sermão." });
            }

            if (!process.env.OPENAI_API_KEY) {
                console.error("Erro: Chave da API OpenAI não configurada.");
                return res.status(500).json({ error: "Erro interno: Chave da API não encontrada." });
            }

            const prompt = `Tema: ${topic}, Público: ${audience}, Tipo de Sermão: ${sermonType}, Duração: ${duration} minutos. Gere um sermão completo com exegese e aplicação prática.`;
            console.log("[OpenAI] Enviando requisição para a API...");

            const data = await fetchWithTimeout( "https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}`},
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 3500,
                    temperature: 0.7,
                }),
            });

            console.log(`[OpenAI] Sermão para [${req.session.user.email}] gerado com sucesso!`);
            
            // Limpa os dados do sermão da sessão para o próximo uso
            delete req.session.sermonData;
            
            res.json({ sermon: data.choices[0].message.content });

        }
    } catch (error) {
        console.error("[Erro ao gerar sermão]", error);
        return res.status(500).json({ error: "Erro ao gerar sermão após várias tentativas." });
    }
});


// --- 5. INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
