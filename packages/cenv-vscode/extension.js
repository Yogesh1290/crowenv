// CrowEnv VS Code Extension — full implementation
// Brand: CrowEnv 🐦‍⬛ | Format: .cenv | GitHub: github.com/Yogesh1290/crowenv
// Provides: syntax highlighting, commands, .env security warnings, .gitignore checks

'use strict';

const vscode = require('vscode');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Extension Activation ─────────────────────────────────────────────────────

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('[CrowEnv] Extension activated');

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('crowenv.init', cmdInit),
        vscode.commands.registerCommand('crowenv.generateKey', cmdGenerateKey),
        vscode.commands.registerCommand('crowenv.encrypt', cmdEncrypt),
        vscode.commands.registerCommand('crowenv.decrypt', cmdDecrypt),
        vscode.commands.registerCommand('crowenv.verify', cmdVerify),
    );

    // Watch for .env files being opened → show security warning
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(onDocumentOpened)
    );

    // Check all currently open docs
    vscode.workspace.textDocuments.forEach(onDocumentOpened);

    // Watch for new .env files in workspace
    const watcher = vscode.workspace.createFileSystemWatcher('**/.env');
    watcher.onDidCreate(uri => {
        warnAboutPlainEnv(uri.fsPath);
    });
    context.subscriptions.push(watcher);

    // Status bar item showing .cenv status
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'crowenv.verify';
    statusBar.tooltip = 'CrowEnv: Click to verify .cenv integrity';
    context.subscriptions.push(statusBar);

    updateStatusBar(statusBar);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
}

function runCrowEnv(args, cwd, callback) {
    const cmd = `crowenv ${args}`;
    exec(cmd, { cwd }, (err, stdout, stderr) => {
        callback(err, stdout, stderr);
    });
}

function isCrowEnvInstalled() {
    try {
        execSync('crowenv --help', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function showInstallPrompt() {
    vscode.window.showErrorMessage(
        '❌ CrowEnv CLI not found. Install it first.',
        'Install (npm)',
        'View Docs'
    ).then(choice => {
        if (choice === 'Install (npm)') {
            const terminal = vscode.window.createTerminal('CrowEnv install');
            terminal.show();
            terminal.sendText('npm install -g crowenv');
        } else if (choice === 'View Docs') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/Yogesh1290/crowenv'));
        }
    });
}

function updateStatusBar(bar) {
    const root = getWorkspaceRoot();
    if (!root) {
        bar.hide();
        return;
    }

    const cenvPath = path.join(root, '.cenv');
    if (fs.existsSync(cenvPath)) {
        bar.text = '🐦‍⬛ .cenv';
        bar.backgroundColor = undefined;
        bar.show();
    } else {
        const envPath = path.join(root, '.env');
        if (fs.existsSync(envPath)) {
            bar.text = '$(warning) .env (insecure!)';
            bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            bar.show();
        } else {
            bar.hide();
        }
    }
}

// ─── .env Security Warnings ───────────────────────────────────────────────────

function onDocumentOpened(doc) {
    const config = vscode.workspace.getConfiguration('crowenv');
    if (!config.get('warnOnPlainEnv', true)) return;

    const fileName = path.basename(doc.fileName);
    if (fileName === '.env' || fileName.endsWith('.env')) {
        warnAboutPlainEnv(doc.fileName);
    }
}

function warnAboutPlainEnv(filePath) {
    const root = getWorkspaceRoot();

    // Check if we already have a .cenv
    if (root && fs.existsSync(path.join(root, '.cenv'))) return;

    // Check if .env is in .gitignore
    const config = vscode.workspace.getConfiguration('crowenv');
    if (config.get('autoCheckGitignore', true) && root) {
        const gitignorePath = path.join(root, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            if (!content.split('\n').some(l => l.trim() === '.env')) {
                vscode.window.showWarningMessage(
                    '⚠️ .env is NOT in .gitignore! This is a security risk.',
                    'Fix Now'
                ).then(choice => {
                    if (choice === 'Fix Now') cmdInit();
                });
                return;
            }
        }
    }

    vscode.window.showWarningMessage(
        '🐦‍⬛ Plain .env detected! CrowEnv encrypts it into a .cenv file you can commit safely.',
        'Encrypt Now',
        'Learn More',
        'Dismiss'
    ).then(choice => {
        if (choice === 'Encrypt Now') cmdEncrypt();
        if (choice === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://crowenv.dev'));
        }
    });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdInit() {
    const root = getWorkspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    if (!isCrowEnvInstalled()) { showInstallPrompt(); return; }

    runCrowEnv('init', root, (err, stdout) => {
        if (err) {
            vscode.window.showErrorMessage(`CrowEnv init failed: ${err.message}`);
        } else {
            vscode.window.showInformationMessage('✅ CrowEnv initialized! .gitignore updated.');
        }
    });
}

function cmdGenerateKey() {
    if (!isCrowEnvInstalled()) { showInstallPrompt(); return; }

    const root = getWorkspaceRoot() || process.cwd();
    runCrowEnv('generate-key', root, (err, stdout) => {
        if (err) {
            vscode.window.showErrorMessage(`Failed: ${err.message}`);
            return;
        }
        // Extract the key from output
        const match = stdout.match(/([0-9a-f]{64})/);
        if (match) {
            const key = match[1];
            vscode.env.clipboard.writeText(key).then(() => {
                vscode.window.showInformationMessage(
                    `🔑 Master key generated and copied to clipboard! Store it in your password manager.`,
                    'View in Terminal'
                ).then(choice => {
                    if (choice === 'View in Terminal') {
                        const terminal = vscode.window.createTerminal('CrowEnv');
                        terminal.show();
                        terminal.sendText(`echo "Key: ${key}"`);
                    }
                });
            });
        } else {
            const terminal = vscode.window.createTerminal('CrowEnv generate-key');
            terminal.show();
            terminal.sendText('crowenv generate-key');
        }
    });
}

function cmdEncrypt() {
    const root = getWorkspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    if (!isCrowEnvInstalled()) { showInstallPrompt(); return; }

    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) {
        vscode.window.showErrorMessage('No .env file found in workspace root.');
        return;
    }

    vscode.window.showInputBox({
        prompt: 'Enter your CENV_MASTER_KEY (or set it as an env var and press Enter)',
        password: true,
        placeHolder: 'Leave empty to use CENV_MASTER_KEY environment variable',
    }).then(key => {
        const env = key ? { ...process.env, CENV_MASTER_KEY: key } : process.env;
        const cmd = 'crowenv encrypt';
        exec(cmd, { cwd: root, env }, (err, stdout, stderr) => {
            if (err) {
                vscode.window.showErrorMessage(`❌ Encrypt failed: ${stderr || err.message}`);
            } else {
                vscode.window.showInformationMessage(
                    '✅ .cenv created! Safe to commit. Delete your .env now.',
                    'Delete .env'
                ).then(choice => {
                    if (choice === 'Delete .env') {
                        fs.unlinkSync(envPath);
                        vscode.window.showInformationMessage('🗑️ .env deleted.');
                    }
                });
            }
        });
    });
}

function cmdDecrypt() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('No workspace folder open.'); return; }
    if (!isCrowEnvInstalled()) { showInstallPrompt(); return; }

    // Show in terminal (never expose in UI)
    const terminal = vscode.window.createTerminal('CrowEnv decrypt');
    terminal.show();
    terminal.sendText('crowenv decrypt');
    vscode.window.showWarningMessage('⚠️ Decrypted secrets shown in terminal. Close when done!');
}

function cmdVerify() {
    const root = getWorkspaceRoot();
    if (!root) { vscode.window.showErrorMessage('No workspace folder open.'); return; }
    if (!isCrowEnvInstalled()) { showInstallPrompt(); return; }

    runCrowEnv('verify', root, (err, stdout, stderr) => {
        if (err) {
            vscode.window.showErrorMessage(`❌ Verify failed: ${stderr || err.message}`);
        } else {
            const match = stdout.match(/(\d+) secret/);
            const count = match ? match[1] : '?';
            vscode.window.showInformationMessage(`✅ .cenv verified! ${count} secrets intact. 🐦‍⬛`);
        }
    });
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

function deactivate() { }

module.exports = { activate, deactivate };
