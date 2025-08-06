// server.js - Versão 7.4 (Fusão Final Completa com Cortesia e Admin)

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

// MUDANÇA: Adicionada a função `updateGraceSermons` que o novo código precisa
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

// MUDANÇA: Implementa o login automático se já houver sessão
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
    
    // MUDANÇA: Lógica do período de cortesia integrada
    const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
    const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
    
    // Prioriza o acesso pago
    if (customer.status === 'paid') {
        if (customer.expires_at && now > new Date(customer.expires_at)) {
             // Se expirou, verifica cortesia
        } else {
            req.session.loginAttempts = 0;
            req.session.user = { email: customer.email, status: 'paid' };
            return res.redirect('/welcome.html');
        }
    }
    
    // Se não for 'paid' ou se expirou, verifica a cortesia
    if (enableGracePeriod) {
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
    
    // Se não tem acesso pago nem cortesia, mostra a mensagem de vencimento
    const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acesso Negado</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
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
        if (manualPermission && manualPermission.permission === 'block') {
            return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
        }
        if (manualPermission && manualPermission.permission === 'allow') {
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
            if (manualPermission && manualPermission.permission === 'block') {
                return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
            }
            if (manualPermission && manualPermission.permission === 'allow') {
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

// A SEÇÃO DE ADMINISTRAÇÃO COMPLETA
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
                <a href="/admin/import-from-csv?key=${key}&plan_type=mensal">[Importar Clientes Mensais via CSV]</a>
            </div>
        </div>
    `;
};

app.get("/admin/view-data", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT email, name, phone, status, updated_at, expires_at, grace_sermons_used, grace_period_month FROM customers ORDER BY updated_at DESC');
        let html = getAdminPanelHeader(key, 'data');
        html += `<h2>Clientes (${rows.length} registros)</h2>
            <table><tr><th>Email</th><th>Nome</th><th>Telefone</th><th>Status</th><th>Última Atualização</th><th>Expira em</th><th>Cortesia Usada</th><th>Mês da Cortesia</th><th>Ações</th></tr>`;

        rows.forEach(customer => {
            const dataAtualizacao = customer.updated_at ? new Date(customer.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            const dataExpiracao = customer.expires_at ? new Date(customer.expires_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${customer.email}</td><td>${customer.name || ''}</td><td>${customer.phone || ''}</td><td>${customer.status}</td><td>${dataAtualizacao}</td><td>${dataExpiracao}</td><td>${customer.grace_sermons_used || 0}</td><td>${customer.grace_period_month || 'N/A'}</td><td class="actions"><a href="/admin/edit-customer?email=${encodeURIComponent(customer.email)}&key=${key}">[Editar]</a></td></tr>`;
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
    const { key, plan_type } = req.query;
    if (key !== process.env.ADMIN_KEY) {
        return res.status(403).send("<h1>Acesso Negado</h1><p>Chave de acesso inválida.</p>");
    }
    if (!['anual', 'vitalicio', 'mensal'].includes(plan_type)) {
        return res.status(400).send("<h1>Erro</h1><p>Você precisa especificar o tipo de plano na URL. Adicione '?plan_type=anual', '?plan_type=vitalicio' ou '?plan_type=mensal'.</p>");
    }

    const CSV_FILE_PATH = path.join(__dirname, 'lista-clientes.csv');
    if (!fs.existsSync(CSV_FILE_PATH)) {
        return res.status(404).send("<h1>Erro</h1><p>Arquivo 'lista-clientes.csv' não encontrado na raiz do projeto.</p>");
    }

    const clientsToImport = [];
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(`<h1>Iniciando importação para plano: ${plan_type}...</h1>`);

    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => {
        const email = row['Cliente / E-mail'];
        const name = row['Cliente / Nome'] || row['Cliente / Razão-Social'];
        const phone = row['Cliente / Fones'];
        const purchaseDateStr = row['Data de Criação'] || row['Início em'];
        const statusCsv = row['Status'];

        if (plan_type === 'mensal') {
            if (email) {
                clientsToImport.push({ email, name, phone, purchaseDateStr, statusCsv });
            }
        } else {
             if (email && purchaseDateStr && statusCsv && statusCsv.toLowerCase() === 'paga') {
                clientsToImport.push({ email, name, phone, purchaseDateStr, statusCsv });
            }
        }
      })
      .on('end', async () => {
        res.write(`<p>Leitura do CSV concluída. ${clientsToImport.length} clientes encontrados para processar.</p>`);
        if (clientsToImport.length === 0) return res.end('<p>Nenhum cliente para importar. Encerrando.</p>');

        const client = await pool.connect();
        try {
            res.write('<p>Iniciando transação com o banco de dados...</p>');
            await client.query('BEGIN');

            for (const [index, customerData] of clientsToImport.entries()) {
                let query;
                let queryParams;

                if (plan_type === 'anual') {
                    const [datePart, timePart] = customerData.purchaseDateStr.split(' ');
                    const [day, month, year] = datePart.split('/');
                    const purchaseDate = new Date(`${year}-${month}-${day}T${timePart || '00:00:00'}`);
                    const expirationDate = new Date(purchaseDate);
                    expirationDate.setDate(expirationDate.getDate() + 365);
                    
                    query = `
                        INSERT INTO customers (email, name, phone, status, expires_at, updated_at)
                        VALUES ($1, $2, $3, 'paid', $4, NOW())
                        ON CONFLICT (email) DO UPDATE SET 
                            name = COALESCE($2, customers.name),
                            phone = COALESCE($3, customers.phone),
                            expires_at = EXCLUDED.expires_at,
                            updated_at = NOW();`;
                    queryParams = [customerData.email.toLowerCase(), customerData.name, customerData.phone, expirationDate.toISOString()];
                } else if (plan_type === 'vitalicio') {
                    query = `
                        INSERT INTO access_control (email, permission, reason)
                        VALUES ($1, 'allow', 'Importado via CSV - Vitalício')
                        ON CONFLICT (email) DO NOTHING;`;
                    queryParams = [customerData.email.toLowerCase()];
                } else if (plan_type === 'mensal') {
                    let status;
                    if (customerData.statusCsv.toLowerCase() === 'em dia') {
                        status = 'paid';
                    } else if (customerData.statusCsv.toLowerCase() === 'atrasado') {
                        status = 'overdue';
                    } else {
                        status = 'canceled';
                    }
                    query = `
                        INSERT INTO customers (email, name, phone, status, expires_at, updated_at)
                        VALUES ($1, $2, $3, $4, NULL, NOW())
                        ON CONFLICT (email) DO UPDATE SET
                            name = COALESCE($2, customers.name),
                            phone = COALESCE($3, customers.phone),
                            status = EXCLUDED.status,
                            expires_at = NULL,
                            updated_at = NOW();`;
                    queryParams = [customerData.email.toLowerCase(), customerData.name, customerData.phone, status];
                }

                if (query) {
                    await client.query(query, queryParams);
                }
            }

            await client.query('COMMIT');
            res.end(`<h2>✅ Sucesso!</h2><p>${clientsToImport.length} clientes foram importados/atualizados para o plano ${plan_type}.</p>`);
        } catch (e) {
            await client.query('ROLLBACK');
            res.end(`<h2>❌ ERRO!</h2><p>Ocorreu um problema durante a importação. Nenhuma alteração foi salva. Verifique os logs do servidor.</p>`);
            console.error(e);
        } finally {
            client.release();
        }
      });
});

// --- 4. ROTAS PROTEGIDAS (Apenas para usuários logados) ---
app.get("/app", requireLogin, async (req, res) => {
    try {
        const customer = await getCustomerRecordByEmail(req.session.user.email);
        if (!customer) {
            return req.session.destroy(() => res.redirect('/'));
        }

        const now = new Date();
        const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
        const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
        
        let hasAccess = false;
        const manualPermission = await getManualPermission(req.session.user.email);

        if (manualPermission && manualPermission.permission === 'allow') {
            hasAccess = true;
        } else if (customer.status === 'paid') {
            if (customer.expires_at) {
                if (now < new Date(customer.expires_at)) {
                    hasAccess = true;
                }
            } else {
                hasAccess = true;
            }
        } else if (enableGracePeriod) {
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            let currentGraceSermonsUsed = customer.grace_sermons_used || 0;
            if(customer.grace_period_month !== currentMonth){
                await updateGraceSermons(customer.email, 0, currentMonth);
                currentGraceSermonsUsed = 0;
            }
            if (currentGraceSermonsUsed < graceSermonsLimit) {
                hasAccess = true;
            }
        }

        if (hasAccess) {
            res.sendFile(path.join(__dirname, "public", "app.html"));
        } else {
            const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
            req.session.destroy(() => {
                res.status(403).send(overdueErrorMessageHTML);
            });
        }
    } catch (error) {
        console.error("Erro na rota /app:", error);
        res.status(500).send("Erro interno ao verificar acesso.");
    }
});

async function fetchWithTimeout(url, options, timeout = 90000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Timeout: A requisição para a OpenAI demorou muito."));
        }, timeout);

        fetch(url, options)
            .then(response => {
                clearTimeout(timer);
                if (!response.ok) {
                    return response.json().then(errorBody => {
                        reject(new Error(`HTTP error! Status: ${response.status}. Detalhes: ${JSON.stringify(errorBody)}`));
                    }).catch(() => {
                        reject(new Error(`HTTP error! Status: ${response.status}.`));
                    });
                }
                return response.json();
            })
            .then(resolve)
            .catch(reject);
    });
}

function getPromptConfig(sermonType, duration) {
    const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
    const fallbackConfig = { structure: 'Gere um sermão completo com exegese e aplicação prática.', max_tokens: 2000 };

    const configs = {
        'Expositivo': {
            'Entre 1 e 10 min': { structure: 'Siga esta estrutura: 1. Uma linha objetiva com o Tema. 2. Uma linha objetiva com o contexto do texto bíblico. 3. Uma linha objetiva com a Aplicação Prática.', max_tokens: 450 },
            'Entre 10 e 20 min': { structure: 'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução, a explicação da ideia central do texto bíblico e uma aplicação.', max_tokens: 750 },
            'Entre 20 e 30 min': { structure: 'Siga esta estrutura: 1. Introdução (um parágrafo curto). 2. Contexto do texto bíblico (um parágrafo curto). 3. Exegese do bloco textual (um parágrafo curto). 4. Aplicação Prática (um parágrafo curto). 5. Conclusão (um parágrafo curto).', max_tokens: 1200 },
            'Entre 30 e 40 min': { structure: 'Siga esta estrutura: 1. Introdução com ilustração. 2. Contexto do livro e da passagem bíblica. 3. Exegese verso a verso. 4. Aplicação para a vida pessoal. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { structure: 'Siga esta estrutura: 1. Introdução detalhada (dois parágrafos curtos). 2. Contexto histórico e teológico (dois parágrafos curtos). 3. Exegese aprofundada do texto bíblico (dois parágrafos curtos). 4. Aplicações, pessoal e comunitária (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).', max_tokens: 2500 },
            'Entre 50 e 60 min': { structure: 'Siga esta estrutura: 1. Introdução detalhada. 2. Grande Contexto Bíblico-Teológico. 3. Exegese minuciosa com análise de palavras no original. 4. Ilustrações. 5. Apontamentos para Cristo. 6. Aplicações multi-pastorais. 7. Conclusão e Oração.', max_tokens: 3500 },
            'Acima de 1 hora': { structure: 'Siga esta estrutura: 1. Introdução Dramática. 2. Contexto Histórico-Cultural. 3. Discussão teológica. 4. Exegese exaustiva do texto bíblico, com múltiplas análises de palavras no original e curiosidades. 5. Referências Cruzadas. 6. Ilustrações Históricas. 7. Apontamentos para Cristo. 8. Aplicações profundas. 9. Conclusão missional com Apelo e Oração.', max_tokens: 5000 }
        },
        'Textual': {
            'Entre 1 e 10 min': { structure: 'Siga esta estrutura: 1. Uma linha com a Leitura do Texto Bíblico-Base. 2. Uma linha com a ideia central. 3. Uma linha com a Aplicação.', max_tokens: 450 },
            'Entre 10 e 20 min': { structure: 'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução, a explicação do tema principal do texto bíblico e uma conclusão.', max_tokens: 750 },
            'Entre 20 e 30 min': { structure: 'Siga esta estrutura: 1. Introdução (um parágrafo curto). 2. Divisão do texto bíblico em 2 pontos, explicando cada um em um parágrafo curto. 3. Aplicação geral (um parágrafo curto). 4. Conclusão (um parágrafo curto).', max_tokens: 1200 },
            'Entre 30 e 40 min': { structure: 'Siga esta estrutura: 1. Introdução. 2. Divisão do texto bíblico em 3 pontos principais. 3. Desenvolvimento de cada ponto com uma explicação clara. 4. Aplicação para cada ponto. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { structure: 'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Contexto da passagem bíblica (dois parágrafos curtos). 3. Divisão do texto bíblico em 3 pontos, com breve exegese (dois parágrafos curtos por ponto). 4. Aplicação (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).', max_tokens: 2500 },
            'Entre 50 e 60 min': { structure: 'Siga esta estrutura: 1. Introdução. 2. Contexto. 3. Divisão do texto bíblico em pontos lógicos. 4. Desenvolvimento aprofundado de cada ponto. 5. Análise de palavras-chave. 6. Ilustrações. 7. Conclusão e Oração.', max_tokens: 3500 },
            'Acima de 1 hora': { structure: 'Siga esta estrutura: 1. Introdução. 2. Contexto completo. 3. Divisão do texto bíblico em todos os seus pontos naturais. 4. Desenvolvimento exaustivo de cada ponto, com exegese e referências cruzadas. 5. Análise de palavras no original. 6. Múltiplas Aplicações. 7. Curiosidades. 8. Conclusão.', max_tokens: 5000 }
        },
        'Temático': {
            'Entre 1 e 10 min': { structure: 'Siga esta estrutura: 1. Uma linha de Apresentação do Tema. 2. Uma linha de explanação com um versículo bíblico principal. 3. Uma linha de Aplicação.', max_tokens: 450 },
            'Entre 10 e 20 min': { structure: 'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução ao tema, um desenvolvimento com base em 2 textos bíblicos e uma aplicação.', max_tokens: 750 },
            'Entre 20 e 30 min': { structure: 'Siga esta estrutura: 1. Introdução ao tema (um parágrafo curto). 2. Desenvolvimento do tema usando 2 pontos, cada um com um texto bíblico de apoio (um parágrafo curto por ponto). 3. Aplicação (um parágrafo curto). 4. Conclusão (um parágrafo curto).', max_tokens: 1200 },
            'Entre 30 e 40 min': { structure: 'Siga esta estrutura: 1. Introdução ao tema. 2. Primeiro Ponto (com um texto bíblico de apoio). 3. Segundo Ponto (com outro texto bíblico de apoio). 4. Aplicação unificada. 5. Conclusão.', max_tokens: 1900 },
            'Entre 40 e 50 min': { structure: 'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico e uma breve explicação (dois parágrafos curtos por ponto). 3. Aplicações práticas (dois parágrafos curtos). 4. Conclusão (dois parágrafos curtos).', max_tokens: 2500 },
            'Entre 50 e 60 min': { structure: 'Siga esta estrutura: 1. Introdução. 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico, breve exegese e uma ilustração. 3. Aplicações para cada ponto. 4. Conclusão com apelo.', max_tokens: 3500 },
            'Acima de 1 hora': { structure: 'Siga esta estrutura: 1. Introdução. 2. Exploração profunda do tema através de múltiplas passagens bíblicas. 3. Análise teológica e prática. 4. Ilustrações e aplicações robustas. 5. Conclusão e oração.', max_tokens: 5000 }
        }
    };
    
    let config = fallbackConfig;
    if (configs[cleanSermonType] && configs[cleanSermonType][duration]) {
        config = configs[cleanSermonType][duration];
    }
    
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temp = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;

    return {
        structure: config.structure,
        max_tokens: config.max_tokens,
        model: model,
        temperature: temp
    };
}

app.post("/api/next-step", requireLogin, async (req, res) => {
    const { userResponse } = req.body;
    const step = req.body.step || 1;
    console.log(`Usuário [${req.session.user.email}] - Processando etapa ${step}, resposta: ${userResponse}`);

    try {
        const customer = await getCustomerRecordByEmail(req.session.user.email);

        if (step === 4) { // Apenas na etapa final, antes de gerar o sermão
            const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';

            if (customer && customer.status !== 'paid' && customer.status !== 'allowed_manual' && enableGracePeriod) {
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                let sermonsUsed = customer.grace_sermons_used || 0;
                
                if(customer.grace_period_month !== currentMonth){
                    sermonsUsed = 0; // Se o mês mudou, reseta a contagem
                }
                
                await updateGraceSermons(customer.email, sermonsUsed + 1, currentMonth);
            }
        }

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

            const promptConfig = getPromptConfig(sermonType, duration);
            const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanAudience = audience.replace(/^[A-Z]\)\s*/, '').trim();
            
            const promptInstruction = promptConfig.instruction || `Escreva um sermão de ${duration}.`;
            const prompt = `Gere um sermão do tipo ${cleanSermonType} para um público de ${cleanAudience} sobre o tema "${topic}". ${promptInstruction} ${promptConfig.structure}`;
            
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

                if (!data || !data.choices || data.choices.length === 0) {
                    throw new Error("Resposta inválida da OpenAI.");
                }
                
                console.log(`[OpenAI] Sermão para [${req.session.user.email}] gerado com sucesso!`);
                
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
acredito que o código que está faltando no seu é este:


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

app.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, "public", "login.html")); 
});

app.get("/app", requireLogin, async (req, res) => {
    try {
        const customer = await getCustomerRecordByEmail(req.session.user.email);
        if (!customer) {
            return req.session.destroy(() => res.redirect('/'));
        }

        const now = new Date();
        const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
        const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
        
        let hasAccess = false;
        const manualPermission = await getManualPermission(req.session.user.email);

        if (manualPermission === 'allow') {
            hasAccess = true;
        } else if (customer.status === 'paid') {
            if (customer.expires_at) {
                if (now < new Date(customer.expires_at)) {
                    hasAccess = true;
                }
            } else {
                hasAccess = true;
            }
        } else if (enableGracePeriod) {
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            let currentGraceSermonsUsed = customer.grace_sermons_used || 0;
            if(customer.grace_period_month !== currentMonth){
                await updateGraceSermons(customer.email, 0, currentMonth);
                currentGraceSermonsUsed = 0;
            }
            if (currentGraceSermonsUsed < graceSermonsLimit) {
                hasAccess = true;
            }
        }

        if (hasAccess) {
            res.sendFile(path.join(__dirname, "public", "app.html"));
        } else {
            const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
            req.session.destroy(() => {
                res.status(403).send(overdueErrorMessageHTML);
            });
        }
    } catch (error) {
        console.error("Erro na rota /app:", error);
        res.status(500).send("Erro interno ao verificar acesso.");
    }
});
