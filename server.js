// server.js - Versão de Diagnóstico (Sessão em Memória)

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session); // Mantemos a importação
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const csv = require('csv-parser');

const { 
    pool, getCustomerRecordByEmail, getCustomerRecordByPhone, getAccessControlRule,
    updateAnnualAccess, updateMonthlyStatus, updateLifetimeAccess, revokeAccessByInvoice,
    logSermonActivity, updateGraceSermons, registerProspect
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

// --- 2. MIDDLEWARES (Segurança, JSON, Sessão) ---

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 15,
	message: '<h1>Muitas tentativas de login</h1><p>Detectamos muitas tentativas a partir do seu IP. Por favor, tente novamente em 15 minutos.</p>',
    standardHeaders: true,
    legacyHeaders: false,
});

// ===================================================================
// ALTERAÇÃO DE DIAGNÓSTICO
// A linha 'store' foi comentada para usar o armazenamento de sessão em memória.
// Isso nos dirá se o problema está na conexão com o banco de dados via connect-pg-simple.
// ===================================================================
app.use(
  session({
    // store: new PgStore({ pool: pool, tableName: 'user_sessions' }), // <-- TEMPORARIAMENTE DESABILITADO
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000, 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    },
  })
);
// ===================================================================

function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ error: "Sessão expirada. Por favor, faça o login novamente." });
    }
    return res.redirect('/'); 
  }
}

// ... todo o resto do seu server.js continua exatamente o mesmo ...
// --- 3. ROTAS PÚBLICAS (Login, Logout, Webhooks) ---

const ALLOW_ANYONE = process.env.ALLOW_ANYONE === "true";

app.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, "public", "login.html")); 
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
        console.error("Erro ao destruir sessão:", err);
        return res.redirect('/app');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

const checkAccessAndLogin = async (req, res, customer) => {
    const now = new Date();
    const accessRule = await getAccessControlRule(customer.email);

    if (accessRule && accessRule.permission === 'block') {
        return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p>");
    }
    if (accessRule && accessRule.permission === 'allow') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'lifetime' };
        return res.redirect('/welcome.html');
    }
    if (customer.annual_expires_at && now < new Date(customer.annual_expires_at)) {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'annual_paid' };
        return res.redirect('/welcome.html');
    }
    if (customer.monthly_status === 'paid') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'monthly_paid' };
        return res.redirect('/welcome.html');
    }
    const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
    const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
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
    const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu. Clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
    return res.status(401).send(overdueErrorMessageHTML);
};

app.post("/login", loginLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).send("O campo de e-mail é obrigatório."); }
    const lowerCaseEmail = email.toLowerCase();
    
    if (ALLOW_ANYONE) {
        req.session.user = { email: lowerCaseEmail, status: 'admin_test' };
        return res.redirect("/welcome.html");
    }

    try {
        const customer = await getCustomerRecordByEmail(lowerCaseEmail);
        if (customer) {
            return await checkAccessAndLogin(req, res, customer);
        } else {
            req.session.loginAttempts = (req.session.loginAttempts || 0) + 1;
            if (req.session.loginAttempts >= 2) {
                const notFoundWithPhoneOptionHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.input-field{width:calc(100% - 34px);padding:15px;margin-bottom:20px;border:2px solid #0D47A1;border-radius:8px;font-size:1.2em;color:#0D47A1}.action-button{background-color:#1565C0;color:#fff;padding:15px;font-size:1.4em;border:none;border-radius:8px;cursor:pointer;width:100%;display:block}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Verifique se digitou o e-mail corretamente ou tente acessar com seu número de celular.</p><form action="/login-by-phone" method="POST"><label for="phone">Celular:</label><input type="tel" id="phone" name="phone" class="input-field" placeholder="Insira aqui o seu celular" required><button type="submit" class="action-button">Entrar com Celular</button></form><a href="/" class="back-link">Tentar com outro e-mail</a></div></body></html>`;
                return res.status(401).send(notFoundWithPhoneOptionHTML);
            } else {
                const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Verifique se você digitou o mesmo e-mail que usou na compra.</p><a href="/" class="back-link">Tentar novamente</a></div></body></html>`;
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
        if (customer) {
            return await checkAccessAndLogin(req, res, customer);
        } else {
            const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Celular não localizado</h1><p>Não encontramos um cadastro com este número de celular. Verifique se o número está correto ou tente acessar com seu e-mail.</p><a href="/" class="back-link">Tentar com e-mail</a></div></body></html>`;
            return res.status(401).send(notFoundErrorMessageHTML);
        }
    } catch (error) {
        console.error("Erro no processo de login por celular:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

app.post("/eduzz/webhook", async (req, res) => {
    const { api_key, product_cod, cus_email, cus_name, cus_cel, event_name, trans_cod, trans_paiddate, trans_paidtime } = req.body;

    if (api_key !== process.env.EDUZZ_API_KEY) {
        console.warn(`[Webhook-Segurança] API Key inválida recebida.`);
        return res.status(403).send("API Key inválida.");
    }
    if (!cus_email || !product_cod || !event_name || !trans_cod) {
        console.warn("[Webhook-Aviso] Webhook com dados essenciais faltando.", { email: cus_email, prod: product_cod, event: event_name });
        return res.status(400).send("Dados insuficientes.");
    }
    
    const lifetime_ids = (process.env.EDUZZ_LIFETIME_PRODUCT_IDS || "").split(',');
    const annual_ids = (process.env.EDUZZ_ANNUAL_PRODUCT_IDS || "").split(',');
    const monthly_ids = (process.env.EDUZZ_MONTHLY_PRODUCT_IDS || "").split(',');
    const productCodStr = product_cod.toString();
    
    let productType = null;
    if (lifetime_ids.includes(productCodStr)) productType = 'lifetime';
    else if (annual_ids.includes(productCodStr)) productType = 'annual';
    else if (monthly_ids.includes(productCodStr)) productType = 'monthly';
    
    try {
        if (!productType) {
            if (process.env.ENABLE_GRACE_PERIOD === 'true') {
                await registerProspect(cus_email, cus_name, cus_cel);
                console.log(`[Webhook-Info] Cliente [${cus_email}] registrado como 'prospect'.`);
                return res.status(200).send("Prospect registrado.");
            } else {
                console.log(`[Webhook-Info] Ignorando produto não mapeado [${product_cod}].`);
                return res.status(200).send("Webhook ignorado (produto não mapeado).");
            }
        }

        if (event_name === 'invoice_paid') {
            switch (productType) {
                case 'lifetime':
                    await updateLifetimeAccess(cus_email, cus_name, cus_cel, trans_cod, product_cod);
                    break;
                case 'annual':
                    const paidAt = `${trans_paiddate} ${trans_paidtime}`;
                    await updateAnnualAccess(cus_email, cus_name, cus_cel, trans_cod, paidAt);
                    break;
                case 'monthly':
                    await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid');
                    break;
            }
        } 
        else if (productType === 'monthly' && ['contract_up_to_date', 'invoice_renewed'].includes(event_name)) {
             await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid');
        }
        else if (productType === 'monthly' && event_name === 'contract_delayed') {
             await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'overdue');
        }
        else if (['contract_canceled', 'invoice_refunded', 'invoice_expired', 'invoice_chargeback'].includes(event_name)) {
            await revokeAccessByInvoice(trans_cod, productType);
            console.log(`[Webhook-Sucesso] Acesso da fatura [${trans_cod}] revogado para [${cus_email}] devido a [${event_name}].`);
        }
        else {
            console.log(`[Webhook-Info] Ignorando evento não mapeado: ${event_name}`);
            return res.status(200).send("Evento não mapeado.");
        }
        
        res.status(200).send("Webhook processado com sucesso.");
    } catch (error) {
        console.error(`[Webhook-Erro] Falha ao processar webhook para [${cus_email}], evento [${event_name}].`, error);
        res.status(500).send("Erro interno ao processar o webhook.");
    }
});


// --- 4. ROTAS DE ADMINISTRAÇÃO ---
// ... (o código do admin panel continua o mesmo) ...


// --- 5. ROTAS PROTEGIDAS (App Principal) ---
// ... (o código das rotas protegidas continua o mesmo) ...

// --- 6. INICIALIZAÇÃO DO SERVIDOR ---
// ... (o código de inicialização continua o mesmo) ...
