const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Rota de login
router.get('/', (req, res) => {
    req.session.destroy();
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

router.post('/login', (req, res) => {
    const { password } = req.body;
    const passwordsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../passwords.json')));
    const currentPassword = passwordsData.passwords[passwordsData.currentPasswordIndex];

    if (password === currentPassword) {
        req.session.authenticated = true;
        res.redirect('/app');
    } else {
        res.status(401).send('<h1>Senha incorreta. Tente novamente.</h1><a href="/">Voltar</a>');
    }
});

module.exports = router;
