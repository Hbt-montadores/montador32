<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- MUDANÇA: Título atualizado para 3.2 -->
    <title>Login - Montador de Sermões 3.2</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <!-- MUDANÇA: Texto alternativo do logo atualizado para 3.2 -->
        <img src="https://cdn.glitch.global/db74bd9b-d683-421c-9223-f55b917c9dce/logo.png?v=1734385573934" alt="Logo do Montador de Sermões 3.2" class="logo">
    </header>

    <!-- MUDANÇA: Título principal atualizado para 3.2 -->
    <h1>Montador de Sermões 3.2</h1>

    <div id="login-container">
        <!-- MUDANÇA: Todo o formulário foi reestruturado para e-mail -->
        <form id="login-form" action="/login" method="POST">
            <label for="email" class="input-label">Digite seu e-mail de compra:</label>
            <input
                type="email"
                id="email"
                name="email"
                class="input-field" <!-- A classe de senha grande foi removida para um estilo padrão -->
                placeholder="seu.email@exemplo.com"
                autocomplete="email" <!-- Melhora a usabilidade sugerindo o e-mail -->
                required
            >
            <button type="submit" id="login-button">Entrar</button>
        </form>
        <!-- A mensagem de erro agora é tratada pelo backend com uma página HTML completa -->
        <!-- <div id="error-message" class="error-message" style="display: none;">Senha incorreta. Tente novamente.</div> -->
    </div>

    <!-- MUDANÇA IMPORTANTE: A linha abaixo que chama o 'login.js' foi removida -->
    <!-- Ela foi removida porque o script 'login.js' ainda procura pelo campo de senha e causaria erros. -->
    
</body>
</html>
