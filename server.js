// server.js - Versão Final (Refinada em 31/07)

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const csv = require('csv-parser');

const { pool, markStatus, getCustomerRecordByEmail, getCustomerRecordByPhone, getManualPermission, logSermonActivity } = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

// --- 2. MIDDLEWARES (Segurança e Sessão) ---
app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, max: 15,
	message: '<h1>Muitas tentativas de login</h1><p>Detectamos muitas tentativas a partir do seu IP. Por favor, tente novamente em 15 minutos.</p><a href="/">Voltar</a>',
    standardHeaders: true, legacyHeaders: false,
});

app.use(
  session({
    store: new PgStore({ pool: pool, tableName: 'user_sessions' }),
    secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000, 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
    },
  })
);

function requireLogin(req, res, next) {
  if (req.session && req.session.user) { return next(); } 
  else { return res.redirect('/'); }
}

// --- 3. ROTAS PÚBLICAS E DE ADMINISTRAÇÃO ---
const ALLOW_ANYONE = process.env.ALLOW_ANYONE === "true";

app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "public", "login.html")); });

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) { console.error("Erro ao destruir sessão:", err); return res.redirect('/app'); }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

const checkAccessAndLogin = (req, res, customer) => {
    if (customer.expires_at) {
        const agora = new Date();
        const dataExpiracao = new Date(customer.expires_at);
        if (agora > dataExpiracao) {
            const expiredErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acesso Expirado</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
            return res.status(401).send(expiredErrorMessageHTML);
        }
    }

    if (customer.status === 'paid') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'paid' };
        return res.redirect('/app');
    }
    
    const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
    return res.status(401).send(overdueErrorMessageHTML);
};

app.post("/login", loginLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).send("O campo de e-mail é obrigatório.");
    }
    const lowerCaseEmail = email.toLowerCase();
    
    if (ALLOW_ANYONE) {
        req.session.user = { email: lowerCaseEmail, status: 'admin_test' };
        return res.redirect("/app");
    }

    try {
        const manualPermission = await getManualPermission(lowerCaseEmail);
        if (manualPermission === 'block') {
            return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
        }
        if (manualPermission === 'allow') {
            req.session.loginAttempts = 0;
            req.session.user = { email: lowerCaseEmail, status: 'allowed_manual' };
            return res.redirect('/app');
        }

        const customer = await getCustomerRecordByEmail(lowerCaseEmail);

        if (customer) {
            return checkAccessAndLogin(req, res, customer);
        } else {
            req.session.loginAttempts = (req.session.loginAttempts || 0) + 1;
            
            if (req.session.loginAttempts >= 2) {
                const notFoundWithPhoneOptionHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.input-field{width:calc(100% - 34px);padding:15px;margin-bottom:20px;border:2px solid #0D47A1;border-radius:8px;font-size:1.2em;color:#0D47A1}.action-button{background-color:#1565C0;color:#fff;padding:15px;font-size:1.4em;border:none;border-radius:8px;cursor:pointer;width:100%;display:block}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Por favor, verifique se digitou o e-mail corretamente ou tente acessar com seu número de celular.</p><form action="/login-by-phone" method="POST"><label for="phone">Celular:</label><input type="tel" id="phone" name="phone" class="input-field" placeholder="Insira aqui o seu celular" required><button type="submit" class="action-button">Entrar com Celular</button></form><a href="/" class="back-link">Tentar com outro e-mail</a></div></body></html>`;
                return res.status(401).send(notFoundWithPhoneOptionHTML);
            } else {
                const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Por favor, verifique se você digitou o mesmo e-mail que usou no momento da compra.</p><a href="/" class="back-link">Tentar novamente</a></div></body></html>`;
                return res.status(401).send(notFoundErrorMessageHTML);
            }
        }
    } catch (error) {
        console.error("Erro no processo de login por e-mail:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

app.post("/login-by-phone", loginLimiter, async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send("O campo de celular é obrigatório.");
    }

    try {
        const customer = await getCustomerRecordByPhone(phone);
        
        if (customer) {
            const manualPermission = await getManualPermission(customer.email);
            if (manualPermission === 'block') {
                return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
            }
            if (manualPermission === 'allow') {
                req.session.loginAttempts = 0;
                req.session.user = { email: customer.email, status: 'allowed_manual' };
                return res.redirect('/app');
            }
            return checkAccessAndLogin(req, res, customer);
        } else {
            const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Celular não localizado</h1><p>Não encontramos um cadastro com este número de celular. Por favor, verifique se o número está correto ou tente acessar com seu e-mail.</p><a href="/" class="back-link">Tentar com e-mail</a></div></body></html>`;
            return res.status(401).send(notFoundErrorMessageHTML);
        }
    } catch (error) {
        console.error("Erro no processo de login por celular:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

app.post("/eduzz/webhook", async (req, res) => {
  const { api_key, product_cod, cus_email, cus_name, cus_cel, event_name } = req.body;
  
  if (api_key !== process.env.EDUZZ_API_KEY) {
    console.warn(`[Webhook-Segurança] API Key inválida recebida.`);
    return res.status(403).send("API Key inválida.");
  }
  
  const validProductIds = (process.env.EDUZZ_PRODUCT_IDS || "").split(',').map(id => id.trim());
  if (!validProductIds.includes(product_cod.toString())) {
    console.log(`[Webhook-Info] Ignorando webhook para produto não relacionado: ${product_cod}`);
    return res.status(200).send("Webhook ignorado (produto não corresponde).");
  }

  let status;
  switch (event_name) {
    case 'invoice_paid':
    case 'contract_up_to_date':
      status = 'paid';
      break;
    case 'contract_delayed':
      status = 'overdue';
      break;
    case 'contract_canceled':
    case 'invoice_refunded':
    case 'invoice_expired':
      status = 'canceled';
      break;
    default:
      console.log(`[Webhook-Info] Ignorando evento não mapeado: ${event_name}`);
      return res.status(200).send("Evento não mapeado.");
  }

  if (cus_email && status) {
    try {
      await markStatus(cus_email, cus_name, cus_cel, status);
      console.log(`[Webhook-Sucesso] Cliente [${cus_email}] atualizado para o status [${status}].`);
      res.status(200).send("Webhook processado com sucesso.");
    } catch (error) {
      console.error(`[Webhook-Erro] Falha ao atualizar o cliente [${cus_email}] no banco de dados.`, error);
      res.status(500).send("Erro interno ao processar o webhook.");
    }
  } else {
    console.warn("[Webhook-Aviso] Webhook recebido sem e-mail do cliente ou status válido.");
    res.status(400).send("Dados insuficientes no webhook.");
  }
});

// FUNÇÃO PARA CRIAR O CABEÇALHO DO PAINEL DE ADMIN
const getAdminPanelHeader = (key, activePage) => {
    return `
        <style>
            body { font-family: sans-serif; padding: 20px; } table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }
            .actions a { margin-right: 10px; } .nav-links a { margin-right: 20px; text-decoration: none; color: #1565C0; }
            .nav-links a.active { font-weight: bold; text-decoration: underline; }
            .nav-container { margin-bottom: 20px; } .import-links { margin-top: 10px; }
            .import-links a { font-weight: bold; }
        </style>
        <h1>Painel de Administração</h1>
        <div class="nav-container">
            <div class="nav-links">
                <a href="/admin/view-data?key=${key}" ${activePage === 'data' ? 'class="active"' : ''}>Clientes da Eduzz</a>
                <a href="/admin/view-access-control?key=${key}" ${activePage === 'access' ? 'class="active"' : ''}>Acesso Manual (Vitalícios)</a>
                <a href="/admin/view-activity?key=${key}" ${activePage === 'activity' ? 'class="active"' : ''}>Log de Atividades</a>
            </div>
            <hr>
            <h3>Importação de Clientes (use com cuidado)</h3>
            <div class="nav-links import-links">
                <a href="/admin/import-from-csv?key=${key}&plan_type=anual">[Importar Clientes Anuais via CSV]</a>
                <a href="/admin/import-from-csv?key=${key}&plan_type=vitalicio">[Importar Clientes Vitalícios via CSV]</a>
            </div>
        </div>
    `;
};

app.get("/admin/view-data", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT email, name, phone, status, updated_at, expires_at FROM customers ORDER BY updated_at DESC');
        let html = getAdminPanelHeader(key, 'data');
        html += `<h2>Clientes da Eduzz (${rows.length} registros)</h2>
            <table><tr><th>Email</th><th>Nome</th><th>Telefone</th><th>Status</th><th>Última Atualização (Brasília)</th><th>Expira em (Brasília)</th><th>Ações</th></tr>`;

        rows.forEach(customer => {
            const dataAtualizacao = customer.updated_at ? new Date(customer.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            const dataExpiracao = customer.expires_at ? new Date(customer.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A (Controlado pela Eduzz)';
            html += `<tr><td>${customer.email}</td><td>${customer.name || 'Não informado'}</td><td>${customer.phone || 'Não informado'}</td><td>${customer.status}</td><td>${dataAtualizacao}</td><td>${dataExpiracao}</td><td class="actions"><a href="/admin/edit-customer?email=${encodeURIComponent(customer.email)}&key=${key}">[Editar]</a></td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar dados de admin:", error);
        res.status(500).send("<h1>Erro ao buscar dados</h1>");
    }
});

app.get("/admin/edit-customer", async (req, res) => {
    // ... (Esta rota permanece a mesma) ...
});

app.post("/admin/update-customer", async (req, res) => {
    // ... (Esta rota permanece a mesma) ...
});

app.get("/admin/view-access-control", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT email, permission, reason, created_at FROM access_control ORDER BY created_at DESC');
        let html = getAdminPanelHeader(key, 'access');
        html += `<h2>Acesso Manual (Vitalícios) (${rows.length} registros)</h2>
            <table><tr><th>Email</th><th>Permissão</th><th>Motivo</th><th>Criado em (Brasília)</th></tr>`;

        rows.forEach(rule => {
            const dataCriacao = rule.created_at ? new Date(rule.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${rule.email}</td><td>${rule.permission}</td><td>${rule.reason || 'Não informado'}</td><td>${dataCriacao}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar dados de controle de acesso:", error);
        res.status(500).send("<h1>Erro ao buscar dados</h1>");
    }
});

app.get("/admin/view-activity", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500');
        let html = getAdminPanelHeader(key, 'activity');
        html += `<h2>Log de Atividades (Últimos ${rows.length} sermões gerados)</h2>
            <table><tr><th>Email</th><th>Tema</th><th>Público</th><th>Tipo</th><th>Duração</th><th>Modelo Usado</th><th>Instrução do Prompt</th><th>Gerado em (Brasília)</th></tr>`;

        rows.forEach(log => {
            const dataCriacao = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${log.user_email}</td><td>${log.sermon_topic}</td><td>${log.sermon_audience}</td><td>${log.sermon_type}</td><td>${log.sermon_duration}</td><td>${log.model_used}</td><td>${log.prompt_instruction || ''}</td><td>${dataCriacao}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar log de atividades:", error);
        res.status(500).send("<h1>Erro ao buscar dados</h1>");
    }
});

app.get("/admin/import-from-csv", async (req, res) => {
    // ... (Esta rota permanece a mesma) ...
});

// --- 4. ROTAS PROTEGIDAS (Apenas para usuários logados) ---
app.get("/app", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
});

async function fetchWithTimeout(url, options, timeout = 30000) {
    // ... (Esta função permanece a mesma) ...
}

function getPromptConfig(sermonType, duration) {
    const configs = {
        'Expositivo': {
            'Entre 1 e 10 min': { instruction: 'Escreva um sermão de 1-10 minutos.', structure: 'Siga esta estrutura: 1. Uma linha objetiva com o Tema. 2. Uma linha objetiva com o contexto do texto bíblico. 3. Uma linha objetiva com a Aplicação Prática.', max_tokens: 450 },
            'Entre 10 e 20 min': { instruction: 'Escreva um sermão de 10-20 minutos.', structure: 'Siga esta estrutura: 1. Uma linha de Introdução. 2. Um parágrafo muitíssimo breve e objetivo sobre o contexto. 3. Um parágrafo muitíssimo breve e objetivo com a explicação da ideia central. 4. Um parágrafo muitíssimo breve e objetivo de Aplicação. 5. Uma linha de Chamada à Ação.', max_tokens: 750 },
            'Entre 20 e 30 min': { instruction: 'Escreva um sermão de 20-30 minutos.', structure: 'Siga esta estrutura: 1. Breve Introdução. 2. Breve Contexto histórico-cultural do texto bíblico. 3. Breve Exegese do bloco textual. 4. Breve Aplicação Prática. 5. Breve Conclusão.', max_tokens: 1200 },
            'Entre 30 e 40 min': { instruction: 'Escreva um sermão de 30-40 minutos.', structure: 'Siga esta estrutura: 1. Introdução com ilustração. 2. Contexto do livro e da passagem bíblica. 3. Exegese verso a verso. 4. Aplicação para a vida pessoal. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { instruction: 'Escreva um sermão de 40-50 minutos.', structure: 'Siga esta estrutura: 1. Introdução detalhada. 2. Contexto histórico e teológico. 3. Exegese aprofundada do texto bíblico, com significado de palavra-chave no original. 4. Uma Ilustração. 5. Aplicações (pessoal e comunitária). 6. Conclusão com apelo.', max_tokens: 2500 },
            'Entre 50 e 60 min': { instruction: 'Escreva um sermão de 50-60 minutos.', structure: 'Siga esta estrutura: 1. Introdução detalhada. 2. Grande Contexto Bíblico-Teológico. 3. Exegese minuciosa com análise de palavras no original e referências cruzadas. 4. Duas Ilustrações. 5. Aplicações multi-pastorais. 6. Conclusão e Oração.', max_tokens: 3500 },
            'Acima de 1 hora': { instruction: 'Escreva um sermão de mais de 1 hora.', structure: 'Siga esta estrutura: 1. Introdução. 2. Discussão teológica aprofundada. 3. Exegese exaustiva do texto bíblico. 4. Apontamentos para Cristo. 5. Aplicações profundas. 6. Conclusão missional.', max_tokens: 5000 }
        },
        'Textual': {
            'Entre 1 e 10 min': { instruction: 'Escreva um sermão de 1-10 minutos.', structure: 'Siga esta estrutura: 1. Leitura do Texto Bíblico-Base. 2. Uma linha objetiva com a ideia central. 3. Uma linha objetiva com a Aplicação.', max_tokens: 450 },
            'Entre 10 e 20 min': { instruction: 'Escreva um sermão de 10-20 minutos.', structure: 'Siga esta estrutura: 1. Uma linha de Introdução. 2. Um parágrafo muitíssimo breve e objetivo sobre o Texto Bíblico. 3. Um parágrafo muitíssimo breve e objetivo com o tema principal. 4. Um parágrafo muitíssimo breve e objetivo de Aplicação. 5. Uma linha de Conclusão.', max_tokens: 750 },
            'Entre 20 e 30 min': { instruction: 'Escreva um sermão de 20-30 minutos.', structure: 'Siga esta estrutura: 1. Breve Introdução. 2. Breve leitura e divisão do texto bíblico em 2 pontos. 3. Breve explicação de cada ponto. 4. Breve Aplicação geral. 5. Breve Conclusão.', max_tokens: 1200 },
            'Entre 30 e 40 min': { instruction: 'Escreva um sermão de 30-40 minutos.', structure: 'Siga esta estrutura: 1. Introdução. 2. Divisão do texto bíblico em 3 pontos principais. 3. Desenvolvimento de cada ponto com uma explicação clara. 4. Aplicação para cada ponto. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { instruction: 'Escreva um sermão de 40-50 minutos.', structure: 'Siga esta estrutura: 1. Introdução com ilustração. 2. Contexto da passagem bíblica. 3. Divisão do texto bíblico em 3 pontos. 4. Desenvolvimento de cada ponto com referências e uma breve exegese. 5. Aplicação. 6. Conclusão com apelo.', max_tokens: 2500 },
            'Entre 50 e 60 min': { instruction: 'Escreva um sermão de 50-60 minutos.', structure: 'Siga esta estrutura: 1. Introdução. 2. Contexto. 3. Divisão do texto bíblico em pontos lógicos. 4. Desenvolvimento aprofundado de cada ponto, com análise de palavras e ilustrações. 5. Aplicações. 6. Conclusão e Oração.', max_tokens: 3500 },
            'Acima de 1 hora': { instruction: 'Escreva um sermão de mais de 1 hora.', structure: 'Siga esta estrutura: 1. Introdução. 2. Contexto. 3. Divisão do texto bíblico em todos os seus pontos naturais. 4. Desenvolvimento exaustivo de cada ponto, com exegese e referências cruzadas. 5. Múltiplas Aplicações. 6. Conclusão.', max_tokens: 5000 }
        },
        'Temático': {
            'Entre 1 e 10 min': { instruction: 'Escreva um sermão de 1-10 minutos.', structure: 'Siga esta estrutura: 1. Apresentação do Tema. 2. Uma linha objetiva de explanação com um versículo bíblico principal. 3. Uma linha objetiva de Aplicação.', max_tokens: 450 },
            'Entre 10 e 20 min': { instruction: 'Escreva um sermão de 10-20 minutos.', structure: 'Siga esta estrutura: 1. Uma linha de Introdução ao Tema. 2. Um parágrafo muitíssimo breve e objetivo com base em 2 textos bíblicos. 3. Um parágrafo muitíssimo breve e objetivo de Aplicação. 4. Uma linha de Conclusão.', max_tokens: 750 },
            'Entre 20 e 30 min': { instruction: 'Escreva um sermão de 20-30 minutos.', structure: 'Siga esta estrutura: 1. Breve Introdução. 2. Breve desenvolvimento do tema usando 2 pontos, cada um com um texto bíblico de apoio. 3. Breve Aplicação. 4. Breve Conclusão.', max_tokens: 1200 },
            'Entre 30 e 40 min': { instruction: 'Escreva um sermão de 30-40 minutos.', structure: 'Siga esta estrutura: 1. Introdução ao tema. 2. Primeiro Ponto (com um texto bíblico de apoio). 3. Segundo Ponto (com outro texto bíblico de apoio). 4. Aplicação unificada. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { instruction: 'Escreva um sermão de 40-50 minutos.', structure: 'Siga esta estrutura: 1. Introdução com ilustração. 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico e uma breve explicação. 3. Aplicações práticas. 4. Conclusão.', max_tokens: 2500 },
            'Entre 50 e 60 min': { instruction: 'Escreva um sermão de 50-60 minutos.', structure: 'Siga esta estrutura: 1. Introdução. 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico, breve exegese e uma ilustração. 3. Aplicações para cada ponto. 4. Conclusão com apelo.', max_tokens: 3500 },
            'Acima de 1 hora': { instruction: 'Escreva um sermão de mais de 1 hora.', structure: 'Siga esta estrutura: 1. Introdução. 2. Exploração profunda do tema através de múltiplas passagens bíblicas. 3. Análise teológica e prática. 4. Ilustrações e aplicações robustas. 5. Conclusão e oração.', max_tokens: 5000 }
        }
    };

    const fallbackConfig = configs['Expositivo']['Entre 20 e 30 min'];
    const sermonTypeClean = sermonType.replace(/A\)\s*|B\)\s*|C\)\s*/, '').trim();
    const config = (configs[sermonTypeClean] && configs[sermonTypeClean][duration]) ? configs[sermonTypeClean][duration] : fallbackConfig;
    
    let model;
    let temp;
    
    const size = duration.includes('1 - 10 min') || duration.includes('10 - 20 min') ? 'small'
                 : duration.includes('20 - 30 min') || duration.includes('30 - 40 min') ? 'medium'
                 : 'large';

    if (size === 'small') {
        model = process.env.OPENAI_MODEL_SMALL || 'gpt-4o-mini';
        temp = parseFloat(process.env.OPENAI_TEMP_SMALL) || 0.7;
    } else if (size === 'medium') {
        model = process.env.OPENAI_MODEL_MEDIUM || 'gpt-4o-mini';
        temp = parseFloat(process.env.OPENAI_TEMP_MEDIUM) || 0.7;
    } else { // large
        model = process.env.OPENAI_MODEL_LARGE || 'gpt-4o';
        temp = parseFloat(process.env.OPENAI_TEMP_LARGE) || 0.75;
    }

    return {
        instruction: config.instruction,
        structure: config.structure,
        max_tokens: config.max_tokens,
        model: model,
        temperature: temp
    };
}

app.post("/api/next-step", requireLogin, async (req, res) => {
    const userResponse = req.body.response;
    const step = req.body.step || 1;
    console.log( `Usuário [${req.session.user.email}] - Processando etapa ${step}, resposta: ${userResponse}`);
    try {
        if (step === 1) {
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

            const promptConfig = getPromptConfig(sermonType, duration);

            const prompt = `Gere um sermão do tipo ${sermonType.replace(/A\)\s*|B\)\s*|C\)\s*/, '').trim()} para um público de ${audience.replace(/A-G\)\s*/, '').trim()} sobre o tema "${topic}". ${promptConfig.instruction} ${promptConfig.structure}`;
            const modelToUse = promptConfig.model;
            const temperature = promptConfig.temperature;
            const maxTokens = promptConfig.max_tokens;
            
            console.log(`[OpenAI] Enviando requisição. Modelo: ${modelToUse}, Temperatura: ${temperature}, Max Tokens: ${maxTokens}`);

            const data = await fetchWithTimeout( "https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}`},
                body: JSON.stringify({
                    model: modelToUse,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: maxTokens,
                    temperature: temperature,
                }),
            });
            
            console.log(`[OpenAI] Sermão para [${req.session.user.email}] gerado com sucesso!`);
            
            await logSermonActivity({
                user_email: req.session.user.email,
                sermon_topic: topic,
                sermon_audience: audience,
                sermon_type: sermonType,
                sermon_duration: duration,
                model_used: modelToUse,
                prompt_instruction: promptConfig.structure
            });

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
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
