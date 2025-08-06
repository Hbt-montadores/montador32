// server.js - Versão 7.1 (Lógica de Cortesia Final e Código Íntegro)

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

const { pool, markStatus, getCustomerRecordByEmail, getCustomerRecordByPhone, getManualPermission, logSermonActivity, updateGraceSermons } = require('./db');

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

app.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, "public", "login.html")); 
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) { console.error("Erro ao destruir sessão:", err); return res.redirect('/app'); }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

const checkAccessAndLogin = async (req, res, customer) => {
    const now = new Date();
    
    const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
    const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
    
    if (enableGracePeriod && customer.status !== 'paid') {
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        let currentGraceSermonsUsed = customer.grace_sermons_used || 0;

        if (customer.grace_period_month !== currentMonth) {
            await updateGraceSermons(customer.email, 0, currentMonth);
            currentGraceSermonsUsed = 0;
        }

        if (currentGraceSermonsUsed < graceSermonsLimit) {
            req.session.loginAttempts = 0;
            req.session.user = { email: customer.email, status: 'grace_period' };
            return res.redirect('/welcome.html');
        }
    }

    if (customer.expires_at && now > new Date(customer.expires_at)) {
        const expiredErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acesso Expirado</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
        return res.status(401).send(expiredErrorMessageHTML);
    }

    if (customer.status === 'paid') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'paid' };
        return res.redirect('/welcome.html');
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
        return res.redirect("/welcome.html");
    }

    try {
        const manualPermission = await getManualPermission(lowerCaseEmail);
        if (manualPermission === 'block') {
            return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
        }
        if (manualPermission === 'allow') {
            req.session.loginAttempts = 0;
            req.session.user = { email: lowerCaseEmail, status: 'allowed_manual' };
            return res.redirect('/welcome.html');
        }

        const customer = await getCustomerRecordByEmail(lowerCaseEmail);

        if (customer) {
            return await checkAccessAndLogin(req, res, customer);
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
                return res.redirect('/welcome.html');
            }
            return await checkAccessAndLogin(req, res, customer);
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
  
  const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
  const validProductIds = (process.env.EDUZZ_PRODUCT_IDS || "").split(',').map(id => id.trim());
  const isAccessProduct = validProductIds.includes(product_cod.toString());

  if (!isAccessProduct && enableGracePeriod) {
      const status = 'prospect';
      try {
          await markStatus(cus_email, cus_name, cus_cel, status);
          console.log(`[Webhook-Info] Cliente [${cus_email}] registrado como 'prospect' a partir do produto [${product_cod}].`);
          return res.status(200).send("Prospect registrado.");
      } catch (error) {
          console.error(`[Webhook-Erro] Falha ao registrar prospect [${cus_email}].`, error);
          return res.status(500).send("Erro interno ao registrar prospect.");
      }
  } else if (!isAccessProduct) {
      console.log(`[Webhook-Info] Ignorando webhook para produto não relacionado e cortesia desativada: ${product_cod}`);
      return res.status(200).send("Webhook ignorado.");
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
      console.log(`[Webhook-Info] Ignorando evento não mapeado para produto de acesso: ${event_name}`);
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

app.get("/admin/view-data", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT email, name, phone, status, updated_at, expires_at, grace_sermons_used, grace_period_month FROM customers ORDER BY updated_at DESC');
        let html = getAdminPanelHeader(key, 'data');
        html += `<h2>Clientes da Eduzz (${rows.length} registros)</h2>
            <table><tr><th>Email</th><th>Nome</th><th>Telefone</th><th>Status</th><th>Última Atualização (Brasília)</th><th>Expira em (Brasília)</th><th>Cortesia Usada</th><th>Mês da Cortesia</th><th>Ações</th></tr>`;

        rows.forEach(customer => {
            const dataAtualizacao = customer.updated_at ? new Date(customer.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            const dataExpiracao = customer.expires_at ? new Date(customer.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A (Controlado pela Eduzz)';
            html += `<tr><td>${customer.email}</td><td>${customer.name || 'Não informado'}</td><td>${customer.phone || 'Não informado'}</td><td>${customer.status}</td><td>${dataAtualizacao}</td><td>${dataExpiracao}</td><td>${customer.grace_sermons_used || 0}</td><td>${customer.grace_period_month || 'N/A'}</td><td class="actions"><a href="/admin/edit-customer?email=${encodeURIComponent(customer.email)}&key=${key}">[Editar]</a></td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar dados de admin:", error);
        res.status(500).send("<h1>Erro ao buscar dados</h1>");
    }
});

app.get("/admin/edit-customer", async (req, res) => {
    const { key, email } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    if (!email) { return res.status(400).send("E-mail do cliente não fornecido."); }

    try {
        const customer = await getCustomerRecordByEmail(email);
        if (!customer) { return res.status(404).send("Cliente não encontrado."); }

        const expires_at_value = customer.expires_at 
            ? new Date(new Date(customer.expires_at).getTime() - (3 * 60 * 60 * 1000)).toISOString().slice(0, 16)
            : "";

        res.send(`
            <style>
                body { font-family: sans-serif; max-width: 600px; margin: 40px auto; }
                form div { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; }
                input, select { width: 100%; padding: 8px; font-size: 1em; }
                button { padding: 10px 15px; font-size: 1em; cursor: pointer; }
            </style>
            <h1>Editar Cliente: ${customer.email}</h1>
            <form action="/admin/update-customer" method="POST">
                <input type="hidden" name="key" value="${key}">
                <input type="hidden" name="email" value="${customer.email}">

                <div><label for="name">Nome:</label><input type="text" id="name" name="name" value="${customer.name || ''}"></div>
                <div><label for="phone">Telefone:</label><input type="text" id="phone" name="phone" value="${customer.phone || ''}"></div>
                
                <div><label for="status">Status:</label>
                    <select id="status" name="status">
                        <option value="paid" ${customer.status === 'paid' ? 'selected' : ''}>paid</option>
                        <option value="overdue" ${customer.status === 'overdue' ? 'selected' : ''}>overdue</option>
                        <option value="canceled" ${customer.status === 'canceled' ? 'selected' : ''}>canceled</option>
                        <option value="prospect" ${customer.status === 'prospect' ? 'selected' : ''}>prospect</option>
                        <option value="grace_period" ${customer.status === 'grace_period' ? 'selected' : ''}>grace_period</option>
                    </select>
                </div>

                <div><label for="expires_at">Data de Expiração (deixe em branco para controle da Eduzz):</label>
                <input type="datetime-local" id="expires_at" name="expires_at" value="${expires_at_value}"></div>
                
                <button type="submit">Salvar Alterações</button>
            </form>
            <br>
            <a href="/admin/view-data?key=${key}">Voltar para a lista</a>
        `);
    } catch (error) {
        console.error("Erro ao carregar formulário de edição:", error);
        res.status(500).send("Erro interno.");
    }
});

app.post("/admin/update-customer", async (req, res) => {
    const { key, email, name, phone, status, expires_at } = req.body;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    
    try {
        const expirationDate = expires_at ? new Date(expires_at).toISOString() : null;

        const query = `
            UPDATE customers 
            SET name = $1, phone = $2, status = $3, expires_at = $4, updated_at = NOW() 
            WHERE email = $5
        `;
        await pool.query(query, [name, phone, status, expirationDate, email]);
        res.redirect(`/admin/view-data?key=${key}`);
    } catch (error) {
        console.error("Erro ao atualizar cliente:", error);
        res.status(500).send("Erro ao atualizar dados do cliente.");
    }
});

app.get("/admin/view-access-control", async (req, res) => {
    // ... (Esta rota permanece a mesma)
});

app.get("/admin/view-activity", async (req, res) => {
    // ... (Esta rota permanece a mesma)
});

app.get("/admin/import-from-csv", async (req, res) => {
    // ... (Esta rota permanece a mesma)
});

// --- 4. ROTAS PROTEGIDAS (Apenas para usuários logados) ---
app.get("/app", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
});

async function fetchWithTimeout(url, options, timeout = 90000) {
    // ... (Esta função permanece a mesma)
}

function getPromptConfig(sermonType, duration) {
    // ... (Esta função permanece a mesma)
}

app.post("/api/next-step", requireLogin, async (req, res) => {
    const { userResponse } = req.body;
    const step = req.body.step || 1;
    console.log(`Usuário [${req.session.user.email}] - Processando etapa ${step}, resposta: ${userResponse}`);

    try {
        if (step === 1) {
            req.session.sermonData = { topic: userResponse };
            return res.json({ question: "Que tipo de público você vai pregar?", options: ["A) Crianças", "B) Adolescentes", "C) Jovens", "D) Mulheres", "E) Homens", "F) Público misto", "G) Não convertido"], step: 2 });
        }
        if (step === 2) {
            req.session.sermonData.audience = userResponse;
            return res.json({ question: "Que tipo de sermão você vai pregar?", options: ["A) Expositivo", "B) Textual", "C) Temático"], step: 3 });
        }
        if (step === 3) {
            req.session.sermonData.sermonType = userResponse;
            return res.json({ question: "Quantos minutos deve durar o sermão?", options: ["Entre 1 e 10 min", "Entre 10 e 20 min", "Entre 20 e 30 min", "Entre 30 e 40 min", "Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"], step: 4 });
        }
        if (step === 4) {
            req.session.sermonData.duration = userResponse;
            const { topic, audience, sermonType, duration } = req.session.sermonData;

            if (!topic || !audience || !sermonType || !duration) {
                return res.status(400).json({ error: "Faltam informações para gerar o sermão." });
            }
            if (!process.env.OPENAI_API_KEY) {
                console.error("Erro: Chave da API OpenAI não configurada.");
                return res.status(500).json({ error: "Erro interno: Chave da API não encontrada." });
            }
            
            const customer = await getCustomerRecordByEmail(req.session.user.email);
            const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
            const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
            const isGraceStatus = enableGracePeriod && customer && customer.status !== 'paid';

            if (isGraceStatus) {
                const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                let currentGraceSermonsUsed = customer.grace_sermons_used || 0;
                if(customer.grace_period_month !== currentMonth){
                    currentGraceSermonsUsed = 0;
                }
                
                if (currentGraceSermonsUsed >= graceSermonsLimit) {
                    return res.json({ sermon: "GRACE_PERIOD_ENDED" });
                }
            }

            const promptConfig = getPromptConfig(sermonType, duration);
            const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanAudience = audience.replace(/^[A-Z]\)\s*/, '').trim();
            
            const promptInstruction = promptConfig.instruction || `Escreva um sermão de ${duration}.`;
            const prompt = `Gere um sermão do tipo ${cleanSermonType} para um público de ${cleanAudience} sobre o tema "${topic}". ${promptConfig.structure}`;
            
            const { model, temperature, max_tokens } = promptConfig;
            
            console.log(`[OpenAI] Enviando requisição. Modelo: ${model}, Temperatura: ${temperature}, Max Tokens: ${max_tokens}`);
            
            try {
                const data = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: max_tokens,
                        temperature: temperature,
                    }),
                });

                if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
                    throw new Error("Resposta inválida ou vazia da OpenAI.");
                }
                
                console.log(`[OpenAI] Sermão para [${req.session.user.email}] gerado com sucesso!`);
                
                if (isGraceStatus) {
                    const newCount = (customer.grace_sermons_used || 0) + 1;
                     const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                    await updateGraceSermons(customer.email, newCount, currentMonth);
                }

                await logSermonActivity({
                    user_email: req.session.user.email,
                    sermon_topic: topic,
                    sermon_audience: audience,
                    sermon_type: sermonType,
                    sermon_duration: duration,
                    model_used: model,
                    prompt_instruction: promptConfig.structure
                });

                delete req.session.sermonData;
                res.json({ sermon: data.choices[0].message.content });

            } catch (error) {
                console.error("[Erro ao gerar sermão] Falha na chamada da API:", error);
                return res.status(500).json({ error: "Ocorreu um erro ao se comunicar com a IA para gerar o sermão. Por favor, tente novamente." });
            }
        }
    } catch (error) {
        console.error("[Erro geral no fluxo /api/next-step]", error);
        return res.status(500).json({ error: `Erro interno no servidor.` });
    }
});

// --- 5. INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
