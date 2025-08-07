// server.js - Versão 10.2 (Final com Formatação de Data e Limpeza de IDs)

require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const csv = require('csv-parser');

const { 
    pool, 
    getCustomerRecordByEmail, 
    getCustomerRecordByPhone, 
    getAccessControlRule,
    updateAnnualAccess,
    updateMonthlyStatus,
    updateLifetimeAccess,
    revokeAccessByInvoice,
    logSermonActivity, 
    updateGraceSermons,
    registerProspect
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

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
    const accessRule = await getAccessControlRule(customer.email);

    if (accessRule && accessRule.permission === 'block') {
        return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p><a href='/'>Voltar</a>");
    }
    if (accessRule && accessRule.permission === 'allow') {
        req.session.loginAttempts = 0; req.session.user = { email: customer.email, status: 'lifetime' }; return res.redirect('/welcome.html');
    }
    if (customer.annual_expires_at && now < new Date(customer.annual_expires_at)) {
        req.session.loginAttempts = 0; req.session.user = { email: customer.email, status: 'annual_paid' }; return res.redirect('/welcome.html');
    }
    if (customer.monthly_status === 'paid') {
        req.session.loginAttempts = 0; req.session.user = { email: customer.email, status: 'monthly_paid' }; return res.redirect('/welcome.html');
    }
    const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
    const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
    if (enableGracePeriod) {
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let currentGraceSermonsUsed = customer.grace_sermons_used || 0;
        if (customer.grace_period_month !== currentMonth) {
            await updateGraceSermons(customer.email, 0, currentMonth); currentGraceSermonsUsed = 0;
        }
        if (currentGraceSermonsUsed < graceSermonsLimit) {
            req.session.loginAttempts = 0; req.session.user = { email: customer.email, status: 'grace_period' }; return res.redirect('/welcome.html');
        }
    }
    const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
    return res.status(401).send(overdueErrorMessageHTML);
};

app.post("/login", loginLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).send("O campo de e-mail é obrigatório."); }
    const lowerCaseEmail = email.toLowerCase();
    if (ALLOW_ANYONE) { req.session.user = { email: lowerCaseEmail, status: 'admin_test' }; return res.redirect("/welcome.html"); }
    try {
        const customer = await getCustomerRecordByEmail(lowerCaseEmail);
        if (customer) { return await checkAccessAndLogin(req, res, customer); } 
        else {
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
    if (!phone) { return res.status(400).send("O campo de celular é obrigatório."); }
    try {
        const customer = await getCustomerRecordByPhone(phone);
        if (customer) { return await checkAccessAndLogin(req, res, customer); } 
        else {
            const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Celular não localizado</h1><p>Não encontramos um cadastro com este número de celular. Por favor, verifique se o número está correto ou tente acessar com seu e-mail.</p><a href="/" class="back-link">Tentar com e-mail</a></div></body></html>`;
            return res.status(401).send(notFoundErrorMessageHTML);
        }
    } catch (error) {
        console.error("Erro no processo de login por celular:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

app.post("/eduzz/webhook", async (req, res) => {
    const { api_key, product_cod, cus_email, cus_name, cus_cel, event_name, trans_cod, trans_paiddate, trans_paidtime } = req.body;
    if (api_key !== process.env.EDUZZ_API_KEY) { console.warn(`[Webhook-Segurança] API Key inválida recebida.`); return res.status(403).send("API Key inválida."); }
    if (!cus_email || !product_cod || !event_name || !trans_cod) { console.warn("[Webhook-Aviso] Webhook recebido com dados essenciais faltando.", { email: cus_email, prod: product_cod, event: event_name, invoice: trans_cod }); return res.status(400).send("Dados insuficientes no webhook."); }
    
    const lifetime_ids = (process.env.EDUZZ_LIFETIME_PRODUCT_IDS || "").split(',').map(id => id.trim());
    const annual_ids = (process.env.EDUZZ_ANNUAL_PRODUCT_IDS || "").split(',').map(id => id.trim());
    const monthly_ids = (process.env.EDUZZ_MONTHLY_PRODUCT_IDS || "").split(',').map(id => id.trim());
    
    const productCodStr = product_cod.toString();
    let productType = null;
    if (lifetime_ids.includes(productCodStr)) productType = 'lifetime';
    else if (annual_ids.includes(productCodStr)) productType = 'annual';
    else if (monthly_ids.includes(productCodStr)) productType = 'monthly';

    try {
        if (!productType) {
            if (process.env.ENABLE_GRACE_PERIOD === 'true') {
                await registerProspect(cus_email, cus_name, cus_cel);
                console.log(`[Webhook-Info] Cliente [${cus_email}] registrado como 'prospect' do produto [${product_cod}].`);
                return res.status(200).send("Prospect registrado.");
            } else {
                console.log(`[Webhook-Info] Ignorando webhook para produto não mapeado [${product_cod}].`);
                return res.status(200).send("Webhook ignorado.");
            }
        }
        if (event_name === 'invoice_paid') {
            switch (productType) {
                case 'lifetime': await updateLifetimeAccess(cus_email, cus_name, cus_cel, trans_cod, product_cod); console.log(`[Webhook-Sucesso] Acesso VITALÍCIO concedido para [${cus_email}].`); break;
                case 'annual': 
                    // ===== LÓGICA DE FORMATAÇÃO DE DATA ADICIONADA =====
                    let paidAt = `${trans_paiddate || ''} ${trans_paidtime || ''}`.trim();
                    if (paidAt && /^\d{8}\s/.test(paidAt)) { // Verifica se o formato é AAAAMMDD HH:MM:SS
                        const datePart = paidAt.substring(0, 8);
                        const timePart = paidAt.substring(9);
                        paidAt = `${datePart.substring(0, 4)}-${datePart.substring(4, 6)}-${datePart.substring(6, 8)}T${timePart}`;
                    } else {
                        paidAt = paidAt.replace(' ', 'T'); // Tenta o formato AAAA-MM-DD HH:MM:SS
                    }
                    // =======================================================
                    await updateAnnualAccess(cus_email, cus_name, cus_cel, trans_cod, paidAt); 
                    console.log(`[Webhook-Sucesso] Acesso ANUAL concedido/renovado para [${cus_email}].`); 
                    break;
                case 'monthly': await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid'); console.log(`[Webhook-Sucesso] Acesso MENSAL atualizado para 'paid' para [${cus_email}].`); break;
            }
        } 
        else if (productType === 'monthly' && event_name === 'contract_up_to_date') { await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid'); console.log(`[Webhook-Sucesso] Status MENSAL de [${cus_email}] para 'paid'.`); }
        else if (productType === 'monthly' && event_name === 'contract_delayed') { await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'overdue'); console.log(`[Webhook-Sucesso] Status MENSAL de [${cus_email}] para 'overdue'.`); }
        else if (['contract_canceled', 'invoice_refunded', 'invoice_expired'].includes(event_name)) { await revokeAccessByInvoice(trans_cod, productType); console.log(`[Webhook-Sucesso] Acesso da fatura [${trans_cod}] (${productType}) revogado para [${cus_email}].`); }
        else { console.log(`[Webhook-Info] Ignorando evento não mapeado: ${event_name}`); return res.status(200).send("Evento não mapeado."); }
        res.status(200).send("Webhook processado com sucesso.");
    } catch (error) {
        console.error(`[Webhook-Erro] Falha ao processar webhook para [${cus_email}], evento [${event_name}].`, error);
        res.status(500).send("Erro interno ao processar webhook.");
    }
});

const getAdminPanelHeader = (key, activePage) => {
    return `
        <style>
            body { font-family: sans-serif; padding: 20px; } table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; } th { background-color: #f2f2f2; }
            .actions a, .filter-links a { margin-right: 10px; text-decoration: none; }
            .nav-links a { margin-right: 20px; text-decoration: none; color: #1565C0; }
            .nav-links a.active { font-weight: bold; text-decoration: underline; }
            .nav-container { margin-bottom: 20px; } .import-links { margin-top: 10px; }
            .import-links a { font-weight: bold; }
            .filter-links { margin: 15px 0; }
            .filter-links a { padding: 5px 10px; border: 1px solid #1565C0; border-radius: 5px; color: #1565C0; }
            .filter-links a.active { background-color: #1565C0; color: white; }
        </style>
        <h1>Painel de Administração</h1>
        <div class="nav-container">
            <div class="nav-links">
                <a href="/admin/view-data?key=${key}" ${activePage === 'data' ? 'class="active"' : ''}>Clientes</a>
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
    const { key, filter } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    let whereClause = ''; let queryParams = [];
    switch(filter) {
        case 'anual': whereClause = 'WHERE c.annual_expires_at IS NOT NULL'; break;
        case 'mensal': whereClause = 'WHERE c.monthly_status IS NOT NULL'; break;
        case 'vitalicio': whereClause = `WHERE ac.permission = 'allow'`; break;
        case 'bloqueado': whereClause = `WHERE ac.permission = 'block'`; break;
    }
    const baseQuery = `
        SELECT COALESCE(c.email, ac.email) as email, c.name, c.phone, c.monthly_status, c.annual_expires_at,
               ac.permission as lifetime_status, COALESCE(c.updated_at, ac.created_at) as last_activity
        FROM customers c FULL OUTER JOIN access_control ac ON c.email = ac.email
        ${whereClause} ORDER BY last_activity DESC`;
    try {
        const { rows } = await pool.query(baseQuery, queryParams);
        let html = getAdminPanelHeader(key, 'data');
        html += `
            <div class="filter-links">
                <strong>Filtrar por:</strong>
                <a href="?key=${key}" ${!filter ? 'class="active"' : ''}>Todos</a>
                <a href="?key=${key}&filter=anual" ${filter === 'anual' ? 'class="active"' : ''}>Anual</a>
                <a href="?key=${key}&filter=mensal" ${filter === 'mensal' ? 'class="active"' : ''}>Mensal</a>
                <a href="?key=${key}&filter=vitalicio" ${filter === 'vitalicio' ? 'class="active"' : ''}>Vitalício</a>
                <a href="?key=${key}&filter=bloqueado" ${filter === 'bloqueado' ? 'class="active"' : ''}>Bloqueados</a>
            </div>`;
        html += `<h2>Clientes (${rows.length} registros)</h2>
            <table><tr><th>Email</th><th>Nome</th><th>Status Mensal</th><th>Expira em (Anual)</th><th>Status Vitalício</th><th>Ações</th></tr>`;
        rows.forEach(customer => {
            const dataExpiracaoAnual = customer.annual_expires_at ? new Date(customer.annual_expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${customer.email}</td><td>${customer.name || 'N/A'}</td><td>${customer.monthly_status || 'N/A'}</td>
                <td>${dataExpiracaoAnual}</td><td>${customer.lifetime_status || 'N/A'}</td>
                <td class="actions"><a href="/admin/edit-customer?email=${encodeURIComponent(customer.email)}&key=${key}">[Editar]</a></td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) { console.error("Erro ao buscar dados de admin:", error); res.status(500).send("<h1>Erro ao buscar dados</h1>"); }
});

app.get("/admin/edit-customer", async (req, res) => {
    const { key, email } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    if (!email) { return res.status(400).send("E-mail não fornecido."); }
    try {
        const customerResult = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
        const accessRuleResult = await pool.query('SELECT * FROM access_control WHERE email = $1', [email]);
        const customer = customerResult.rows[0] || {}; const accessRule = accessRuleResult.rows[0] || {};
        if (!customer.email && !accessRule.email) { return res.status(404).send("Cliente não encontrado."); }
        const annual_expires_at_value = customer.annual_expires_at ? new Date(new Date(customer.annual_expires_at).getTime() - (3 * 60 * 60 * 1000)).toISOString().slice(0, 16) : "";
        const permission = accessRule.permission;
        res.send(`
            <style>
                body { font-family: sans-serif; max-width: 600px; margin: 40px auto; } form div { margin-bottom: 15px; } 
                label { display: block; margin-bottom: 5px; font-weight: bold; } input, select { width: 100%; padding: 8px; font-size: 1em; box-sizing: border-box; }
                button { padding: 10px 15px; font-size: 1em; cursor: pointer; } .field-group { border: 1px solid #ccc; padding: 15px; border-radius: 5px; margin-top: 20px; }
            </style>
            <h1>Editar Cliente: ${email}</h1>
            <form action="/admin/update-customer" method="POST">
                <input type="hidden" name="key" value="${key}"><input type="hidden" name="email" value="${email}">
                <div class="field-group"><h3>Dados Gerais</h3>
                    <div><label for="name">Nome:</label><input type="text" id="name" name="name" value="${customer.name || ''}"></div>
                    <div><label for="phone">Telefone:</label><input type="text" id="phone" name="phone" value="${customer.phone || ''}"></div>
                </div>
                <div class="field-group"><h3>Acesso Manual / Vitalício</h3>
                    <select id="permission" name="permission">
                        <option value="none" ${!permission ? 'selected' : ''}>Nenhum</option>
                        <option value="allow" ${permission === 'allow' ? 'selected' : ''}>Permitir (Vitalício)</option>
                        <option value="canceled" ${permission === 'canceled' ? 'selected' : ''}>Cancelado (Revogado Manualmente)</option>
                        <option value="block" ${permission === 'block' ? 'selected' : ''}>Bloquear (Impede qualquer acesso)</option>
                    </select>
                </div>
                <div class="field-group"><h3>Acesso Anual</h3>
                    <div><label for="annual_expires_at">Data de Expiração (Deixe em branco para remover):</label>
                    <input type="datetime-local" id="annual_expires_at" name="annual_expires_at" value="${annual_expires_at_value}"></div>
                </div>
                <div class="field-group"><h3>Acesso Mensal</h3>
                    <select id="monthly_status" name="monthly_status">
                        <option value="" ${!customer.monthly_status ? 'selected' : ''}>Nenhum</option>
                        <option value="paid" ${customer.monthly_status === 'paid' ? 'selected' : ''}>paid</option>
                        <option value="overdue" ${customer.monthly_status === 'overdue' ? 'selected' : ''}>overdue</option>
                        <option value="canceled" ${customer.monthly_status === 'canceled' ? 'selected' : ''}>canceled</option>
                    </select>
                </div>
                <button type="submit" style="margin-top: 20px;">Salvar Alterações</button>
            </form>
            <br><a href="/admin/view-data?key=${key}">Voltar para a lista</a>`);
    } catch (error) { console.error("Erro ao carregar formulário de edição:", error); res.status(500).send("Erro interno."); }
});

app.post("/admin/update-customer", async (req, res) => {
    const { key, email, name, phone, permission, annual_expires_at, monthly_status } = req.body;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const expirationDate = annual_expires_at ? new Date(annual_expires_at).toISOString() : null;
        const finalMonthlyStatus = monthly_status || null;
        const customerQuery = `
            INSERT INTO customers (email, name, phone, monthly_status, annual_expires_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, monthly_status = EXCLUDED.monthly_status, 
            annual_expires_at = EXCLUDED.annual_expires_at, updated_at = NOW();`;
        await client.query(customerQuery, [email, name, phone, finalMonthlyStatus, expirationDate]);
        if (permission && permission !== 'none') {
            const reason = `Acesso definido manualmente via painel (${permission})`;
            const accessQuery = `
                INSERT INTO access_control (email, permission, reason) VALUES ($1, $2, $3)
                ON CONFLICT (email) DO UPDATE SET permission = EXCLUDED.permission, reason = EXCLUDED.reason;`;
            await client.query(accessQuery, [email, permission, reason]);
        } else {
            await client.query('DELETE FROM access_control WHERE email = $1', [email]);
        }
        await client.query('COMMIT');
        res.redirect(`/admin/view-data?key=${key}`);
    } catch (error) {
        await client.query('ROLLBACK'); console.error("Erro ao atualizar cliente:", error);
        res.status(500).send("Erro ao atualizar dados do cliente.");
    } finally { client.release(); }
});

app.get("/admin/view-activity", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500');
        let html = getAdminPanelHeader(key, 'activity');
        html += `<h2>Log de Atividades (Últimos ${rows.length} sermões gerados)</h2>
            <table><tr><th>Email</th><th>Tema</th><th>Público</th><th>Tipo</th><th>Duração</th><th>Modelo Usado</th><th>Gerado em (Brasília)</th></tr>`;
        rows.forEach(log => {
            const dataCriacao = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${log.user_email}</td><td>${log.sermon_topic}</td><td>${log.sermon_audience}</td><td>${log.sermon_type}</td><td>${log.sermon_duration}</td><td>${log.model_used}</td><td>${dataCriacao}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) { console.error("Erro ao buscar log de atividades:", error); res.status(500).send("<h1>Erro ao buscar dados</h1>"); }
});

app.get("/admin/import-from-csv", async (req, res) => {
    const { key, plan_type } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    if (!['anual', 'vitalicio', 'mensal'].includes(plan_type)) { return res.status(400).send("<h1>Erro</h1><p>Tipo de plano inválido.</p>"); }

    const CSV_FILE_PATH = path.join(__dirname, 'lista-clientes.csv');
    if (!fs.existsSync(CSV_FILE_PATH)) { return res.status(404).send("<h1>Erro</h1><p>Arquivo 'lista-clientes.csv' não encontrado.</p>"); }

    const clientsToImport = [];
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(`<h1>Iniciando importação para plano: ${plan_type.toUpperCase()}...</h1>`);

    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => { if (row['Cliente / E-mail']) { clientsToImport.push(row); } })
      .on('end', async () => {
        res.write(`<p>Leitura do CSV concluída. ${clientsToImport.length} clientes encontrados.</p><hr>`);
        if (clientsToImport.length === 0) return res.end('<p>Nenhum cliente para importar.</p>');
        const client = await pool.connect();
        try {
            res.write('<p>Iniciando transação...</p><ul>');
            await client.query('BEGIN');
            for (const customerData of clientsToImport) {
                const email = customerData['Cliente / E-mail'].toLowerCase();
                const name = customerData['Cliente / Nome'] || customerData['Cliente / Razão-Social'];
                const phone = customerData['Cliente / Fones'];

                if (plan_type === 'anual') {
                    const paymentDateStr = customerData['Data de Pagamento'];
                    if (!paymentDateStr) continue;

                    const [datePart, timePart] = paymentDateStr.split(' ');
                    const [day, month, year] = datePart.split('/');
                    const paymentDate = new Date(`${year}-${month}-${day}T${timePart || '00:00:00'}`);
                    
                    const expirationDate = new Date(paymentDate);
                    expirationDate.setDate(expirationDate.getDate() + 365);

                    await client.query(
                        `INSERT INTO customers (email, name, phone, annual_expires_at, updated_at) VALUES ($1, $2, $3, $4, NOW())
                         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), annual_expires_at = EXCLUDED.annual_expires_at, updated_at = NOW()`,
                        [email, name, phone, expirationDate.toISOString()]
                    );
                    res.write(`<li>ANUAL: Cliente ${email} atualizado. Vencimento calculado para ${expirationDate.toLocaleDateString('pt-BR')}.</li>`);
                } else if (plan_type === 'vitalicio') {
                    const invoiceId = customerData['Fatura']; if (!invoiceId) continue;
                    await client.query(`INSERT INTO access_control (email, permission, reason, product_id, invoice_id) VALUES ($1, 'allow', 'Importado via CSV - Vitalício', $2, $3) ON CONFLICT (email) DO NOTHING`, [email, customerData['ID do Produto'], invoiceId]);
                    await client.query(`INSERT INTO customers (email, name, phone) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`, [email, name, phone]);
                    res.write(`<li>VITALÍCIO: Cliente ${email} (Fatura: ${invoiceId}) adicionado.</li>`);
                } else if (plan_type === 'mensal') {
                    const statusCsv = customerData['Status']?.toLowerCase(); if (!statusCsv) continue;
                    let status;
                    if (statusCsv.includes('paga') || statusCsv.includes('em dia')) status = 'paid';
                    else if (statusCsv.includes('atrasado') || statusCsv.includes('vencida')) status = 'overdue';
                    else if (statusCsv.includes('cancelada')) status = 'canceled';
                    else continue;
                    await client.query(`INSERT INTO customers (email, name, phone, monthly_status, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), monthly_status = EXCLUDED.monthly_status, updated_at = NOW()`, [email, name, phone, status]);
                    res.write(`<li>MENSAL: Cliente ${email} atualizado com status '${status}'.</li>`);
                }
            }
            await client.query('COMMIT');
            res.end(`</ul><hr><h2>✅ Sucesso!</h2><p>Importação para o plano ${plan_type.toUpperCase()} concluída.</p>`);
        } catch (e) {
            await client.query('ROLLBACK');
            res.end(`</ul><h2>❌ ERRO!</h2><p>Ocorreu um problema. Nenhuma alteração foi salva. Verifique os logs.</p><pre>${e.stack}</pre>`);
            console.error("ERRO DE IMPORTAÇÃO CSV:", e);
        } finally { client.release(); }
      });
});

app.get("/app", requireLogin, async (req, res) => {
    try {
        const customer = await getCustomerRecordByEmail(req.session.user.email);
        if (!customer) { return req.session.destroy(() => res.redirect('/')); }
        const now = new Date(); let hasAccess = false;
        const accessRule = await getAccessControlRule(customer.email);
        if (accessRule && accessRule.permission === 'block') { hasAccess = false; }
        else if (accessRule && accessRule.permission === 'allow') { hasAccess = true; } 
        else if (customer.annual_expires_at && now < new Date(customer.annual_expires_at)) { hasAccess = true; } 
        else if (customer.monthly_status === 'paid') { hasAccess = true; } 
        else {
            if (process.env.ENABLE_GRACE_PERIOD === 'true') {
                const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                let currentGraceSermonsUsed = customer.grace_sermons_used || 0;
                if(customer.grace_period_month !== currentMonth){ await updateGraceSermons(customer.email, 0, currentMonth); currentGraceSermonsUsed = 0; }
                if (currentGraceSermonsUsed < graceSermonsLimit) { hasAccess = true; }
            }
        }
        if (hasAccess) { res.sendFile(path.join(__dirname, "public", "app.html")); } 
        else {
            const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu, clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
            req.session.destroy(() => { res.status(403).send(overdueErrorMessageHTML); });
        }
    } catch (error) { console.error("Erro na rota /app:", error); res.status(500).send("Erro interno ao verificar acesso."); }
});

async function fetchWithTimeout(url, options, timeout = 90000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { reject(new Error("Timeout da requisição.")); }, timeout);
        fetch(url, options)
            .then(response => { clearTimeout(timer); if (!response.ok) { return response.json().then(e => reject(new Error(`HTTP error! Status: ${response.status}. ${JSON.stringify(e)}`))).catch(() => reject(new Error(`HTTP error! Status: ${response.status}.`))); } return response.json(); })
            .then(resolve).catch(reject);
    });
}

function getPromptConfig(sermonType, duration) {
    const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
    const fallbackConfig = { structure: 'Gere um sermão completo com exegese e aplicação prática.', max_tokens: 2000 };
    const configs = {'Expositivo':{'Entre 1 e 10 min':{structure:'Siga esta estrutura: 1. Uma linha objetiva com o Tema. 2. Uma linha objetiva com o contexto do texto bíblico. 3. Uma linha objetiva com a Aplicação Prática.',max_tokens:450},'Entre 10 e 20 min':{structure:'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução, a explicação da ideia central do texto bíblico e uma aplicação.',max_tokens:750},'Entre 20 e 30 min':{structure:'Siga esta estrutura: 1. Introdução (um parágrafo curto). 2. Contexto do texto bíblico (um parágrafo curto). 3. Exegese do bloco textual (um parágrafo curto). 4. Aplicação Prática (um parágrafo curto). 5. Conclusão (um parágrafo curto).',max_tokens:1200},'Entre 30 e 40 min':{structure:'Siga esta estrutura: 1. Introdução com ilustração. 2. Contexto do livro e da passagem bíblica. 3. Exegese verso a verso. 4. Aplicação para a vida pessoal. 5. Conclusão.',max_tokens:1900},'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução detalhada (dois parágrafos curtos). 2. Contexto histórico e teológico (dois parágrafos curtos). 3. Exegese aprofundada do texto bíblico (dois parágrafos curtos). 4. Aplicações, pessoal e comunitária (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).',max_tokens:2500},'Entre 50 e 60 min':{structure:'Siga esta estrutura: 1. Introdução detalhada. 2. Grande Contexto Bíblico-Teológico. 3. Exegese minuciosa com análise de palavras no original. 4. Ilustrações. 5. Apontamentos para Cristo. 6. Aplicações multi-pastorais. 7. Conclusão e Oração.',max_tokens:3500},'Acima de 1 hora':{structure:'Siga esta estrutura: 1. Introdução Dramática. 2. Contexto Histórico-Cultural. 3. Discussão teológica. 4. Exegese exaustiva do texto bíblico, com múltiplas análises de palavras no original e curiosidades. 5. Referências Cruzadas. 6. Ilustrações Históricas. 7. Apontamentos para Cristo. 8. Aplicações profundas. 9. Conclusão missional com Apelo e Oração.',max_tokens:5000}},'Textual':{'Entre 1 e 10 min':{structure:'Siga esta estrutura: 1. Uma linha com a Leitura do Texto Bíblico-Base. 2. Uma linha com a ideia central. 3. Uma linha com a Aplicação.',max_tokens:450},'Entre 10 e 20 min':{structure:'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução, a explicação do tema principal do texto bíblico e uma conclusão.',max_tokens:750},'Entre 20 e 30 min':{structure:'Siga esta estrutura: 1. Introdução (um parágrafo curto). 2. Divisão do texto bíblico em 2 pontos, explicando cada um em um parágrafo curto. 3. Aplicação geral (um parágrafo curto). 4. Conclusão (um parágrafo curto).',max_tokens:1200},'Entre 30 e 40 min':{structure:'Siga esta estrutura: 1. Introdução. 2. Divisão do texto bíblico em 3 pontos principais. 3. Desenvolvimento de cada ponto com uma explicação clara. 4. Aplicação para cada ponto. 5. Conclusão.',max_tokens:1900},'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Contexto da passagem bíblica (dois parágrafos curtos). 3. Divisão do texto bíblico em 3 pontos, com breve exegese (dois parágrafos curtos por ponto). 4. Aplicação (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).',max_tokens:2500},'Entre 50 e 60 min':{structure:'Siga esta estrutura: 1. Introdução. 2. Contexto. 3. Divisão do texto bíblico em pontos lógicos. 4. Desenvolvimento aprofundado de cada ponto. 5. Análise de palavras-chave. 6. Ilustrações. 7. Conclusão e Oração.',max_tokens:3500},'Acima de 1 hora':{structure:'Siga esta estrutura: 1. Introdução. 2. Contexto completo. 3. Divisão do texto bíblico em todos os seus pontos naturais. 4. Desenvolvimento exaustivo de cada ponto, com exegese e referências cruzadas. 5. Análise de palavras no original. 6. Múltiplas Aplicações. 7. Curiosidades. 8. Conclusão.',max_tokens:5000}},'Temático':{'Entre 1 e 10 min':{structure:'Siga esta estrutura: 1. Uma linha de Apresentação do Tema. 2. Uma linha de explanação com um versículo bíblico principal. 3. Uma linha de Aplicação.',max_tokens:450},'Entre 10 e 20 min':{structure:'Siga esta estrutura: Desenvolva um único parágrafo muitíssimo breve e objetivo contendo uma introdução ao tema, um desenvolvimento com base em 2 textos bíblicos e uma aplicação.',max_tokens:750},'Entre 20 e 30 min':{structure:'Siga esta estrutura: 1. Introdução ao tema (um parágrafo curto). 2. Desenvolvimento do tema usando 2 pontos, cada um com um texto bíblico de apoio (um parágrafo curto por ponto). 3. Aplicação (um parágrafo curto). 4. Conclusão (um parágrafo curto).',max_tokens:1200},'Entre 30 e 40 min':{structure:'Siga esta estrutura: 1. Introdução ao tema. 2. Primeiro Ponto (com um texto bíblico de apoio). 3. Segundo Ponto (com outro texto bíblico de apoio). 4. Aplicação unificada. 5. Conclusão.',max_tokens:1900},'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico e uma breve explicação (dois parágrafos curtos por ponto). 3. Aplicações práticas (dois parágrafos curtos). 4. Conclusão (dois parágrafos curtos).',max_tokens:2500},'Entre 50 e 60 min':{structure:'Siga esta estrutura: 1. Introdução. 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico, breve exegese e uma ilustração. 3. Aplicações para cada ponto. 4. Conclusão com apelo.',max_tokens:3500},'Acima de 1 hora':{structure:'Siga esta estrutura: 1. Introdução. 2. Exploração profunda do tema através de múltiplas passagens bíblicas. 3. Análise teológica e prática. 4. Ilustrações e aplicações robustas. 5. Conclusão e oração.',max_tokens:5000}}};
    let config = fallbackConfig;
    if (configs[cleanSermonType] && configs[cleanSermonType][duration]) { config = configs[cleanSermonType][duration]; }
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temp = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
    return { structure: config.structure, max_tokens: config.max_tokens, model: model, temperature: temp };
}

app.post("/api/next-step", requireLogin, async (req, res) => {
    const { userResponse } = req.body; const step = req.body.step || 1;
    console.log(`Usuário [${req.session.user.email}] - Etapa ${step}: ${userResponse}`);
    try {
        if (step === 1) { req.session.sermonData = { topic: userResponse }; return res.json({ question: "Que tipo de público você vai pregar?", options: ["A) Crianças", "B) Adolescentes", "C) Jovens", "D) Mulheres", "E) Homens", "F) Público misto", "G) Não convertido"], step: 2 }); }
        if (step === 2) { req.session.sermonData.audience = userResponse; return res.json({ question: "Que tipo de sermão você vai pregar?", options: ["A) Expositivo", "B) Textual", "C) Temático"], step: 3 }); }
        if (step === 3) { req.session.sermonData.sermonType = userResponse; return res.json({ question: "Quantos minutos deve durar o sermão?", options: ["Entre 1 e 10 min", "Entre 10 e 20 min", "Entre 20 e 30 min", "Entre 30 e 40 min", "Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"], step: 4 }); }
        
        if (step === 4) {
            const customer = await getCustomerRecordByEmail(req.session.user.email);
            const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;

            if (req.session.user.status === 'grace_period') {
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                let sermonsUsed = customer.grace_sermons_used || 0;
                if (customer.grace_period_month !== currentMonth) { sermonsUsed = 0; }

                if (sermonsUsed >= graceSermonsLimit) {
                    return res.status(403).json({
                        error: "Limite de cortesia atingido.",
                        message: `Você já utilizou seus ${graceSermonsLimit} sermões de cortesia. Para continuar, por favor, renove sua assinatura.`,
                        renewal_url: "https://casadopregador.com/pv/montador3anual"
                    });
                }
                
                await updateGraceSermons(customer.email, sermonsUsed + 1, currentMonth);
                console.log(`[Cortesia] Sermão de cortesia Nº${sermonsUsed + 1} de ${graceSermonsLimit} registrado para ${customer.email}.`);
            }

            req.session.sermonData.duration = userResponse;
            const { topic, audience, sermonType, duration } = req.session.sermonData;
            if (!topic || !audience || !sermonType || !duration) { return res.status(400).json({ error: "Faltam informações." }); }
            if (!process.env.OPENAI_API_KEY) { console.error("Erro: Chave OpenAI não configurada."); return res.status(500).json({ error: "Erro interno." }); }
            
            const promptConfig = getPromptConfig(sermonType, duration);
            const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanAudience = audience.replace(/^[A-Z]\)\s*/, '').trim();
            const prompt = `Gere um sermão do tipo ${cleanSermonType} para um público de ${cleanAudience} sobre o tema "${topic}". ${promptConfig.structure}`;
            const { model, temperature, max_tokens } = promptConfig;
            
            console.log(`[OpenAI] Enviando requisição. Modelo: ${model}, Temp: ${temperature}, Max Tokens: ${max_tokens}`);
            try {
                const data = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens, temperature }),
                });
                if (!data || !data.choices || data.choices.length === 0) { throw new Error("Resposta inválida da OpenAI."); }
                console.log(`[OpenAI] Sermão para [${req.session.user.email}] gerado com sucesso.`);
                await logSermonActivity({ user_email: req.session.user.email, sermon_topic: topic, sermon_audience: audience, sermon_type: sermonType, sermon_duration: duration, model_used: model, prompt_instruction: promptConfig.structure });
                delete req.session.sermonData; 
                res.json({ sermon: data.choices[0].message.content });
            } catch (error) { 
                console.error("[Erro ao gerar sermão]:", error); 
                return res.status(500).json({ error: "Erro ao se comunicar com a IA." }); 
            }
        }
    } catch (error) { 
        console.error("[Erro geral /api/next-step]", error); 
        return res.status(500).json({ error: `Erro interno.` }); 
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
