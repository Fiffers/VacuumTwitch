const {ipcRenderer } = require('electron');


function loadVacuumSettingsPage() {   
    ipcRenderer.send('load-settings-page');
}

function injectInNeedHelpMenuItem() {
    const needHelpBtn = [...document.querySelectorAll('h2')]
    .find(el => el.textContent.trim() === 'Need Help?')?.closest('a');
    
    if (!needHelpBtn || needHelpBtn.dataset.vacuumInjected) return;
    
    needHelpBtn.dataset.vacuumInjected = 'true';
    needHelpBtn.querySelector('h2').textContent = 'Vacuum Settings';
    needHelpBtn.href = '#';

    const helpText = needHelpBtn.querySelector('p');
    if (helpText) {
        helpText.textContent = 'Configure your VacuumTwitch experience';
    }
    
    
    needHelpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loadVacuumSettingsPage();
    });
}

module.exports = () => {
    window.vacuum = {
        getConfig: () => ipcRenderer.sendSync('get-config'),
        setConfig: (newConfig) => ipcRenderer.sendSync('set-config', newConfig)
    };

    window.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver(injectInNeedHelpMenuItem);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        injectInNeedHelpMenuItem();
    });

    window.electron = require('electron');

    const controllerSupport = require('./controller-support');
    window.startControllerSupport = () => {
        controllerSupport()
    };
}

