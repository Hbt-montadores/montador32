// public/pwa-installer.js - Versão Final com Captura Única

let deferredPrompt;
let hasBeenCaptured = false; // Variável de controle

function showInstallButtonIfExists() {
    if (window.deferredPrompt) {
        const installButtonOnAppPage = document.getElementById('install-button');
        if (installButtonOnAppPage) {
            installButtonOnAppPage.style.display = 'block';
            installButtonOnAppPage.addEventListener('click', () => {
                if (window.deferredPrompt) {
                    window.deferredPrompt.prompt();
                }
            });
        }
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    if (hasBeenCaptured) {
        return; // Ignora se já foi capturado
    }
    hasBeenCaptured = true;

    console.log('[pwa-installer] Evento "beforeinstallprompt" capturado (única vez).');
    e.preventDefault();
    
    deferredPrompt = e;
    window.deferredPrompt = e;
    
    showInstallButtonIfExists();
    
    console.log('[pwa-installer] Disparando evento "pwa-installable".');
    window.dispatchEvent(new CustomEvent('pwa-installable'));
});

window.addEventListener('load', showInstallButtonIfExists);
