document.addEventListener('DOMContentLoaded', () => {
    // Ajustar dinamicamente o tamanho do logo se necessário
    const logo = document.querySelector('.logo');
    const loginContainer = document.getElementById('login-container');

    // Ajusta o tamanho do logo se a tela for muito pequena
    if (window.innerWidth < 400) {
        logo.style.width = '60px';
        logo.style.marginBottom = '5px';
    }

    // Centralizar o login container
    loginContainer.style.marginTop = `${(window.innerHeight - loginContainer.offsetHeight) / 4}px`;

    // Adicionar evento ao formulário de login
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', (event) => {
        const passwordInput = document.getElementById('password').value;

        // Exemplo de validação simples antes do envio
        if (passwordInput.length < 6) {
            event.preventDefault();
            alert('A senha deve ter pelo menos 6 caracteres.');
        }
    });
});
