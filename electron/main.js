const { app, BrowserWindow, ipcMain, Menu, Tray, shell, dialog, protocol } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Enable live reload for Electron
if (isDev) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

// Keep a global reference of the window object
let mainWindow;
let tray;

// Enable secure context isolation
app.commandLine.appendSwitch('enable-features', 'ElectronSymbolicPartitionKey');

// Register custom protocol for OAuth
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('onlyjobs', process.execPath, [
      path.resolve(process.argv[1])
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('onlyjobs');
}

// Variable to store OAuth data
let oauthData = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    // icon: path.join(__dirname, '..', 'assets', 'icon.png'), // TODO: Add icon
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false // Don't show until ready
  });

  // Load the app
  if (isDev) {
    // Add error handling for development
    mainWindow.loadURL('http://localhost:3000').catch(err => {
      console.error('Failed to load React dev server:', err);
      dialog.showErrorBox('Connection Error', 
        'Could not connect to React dev server at http://localhost:3000\n\n' +
        'Make sure "npm start" is running in another terminal.');
    });
    mainWindow.webContents.openDevTools();
    
    // Log any load failures
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Page failed to load:', errorDescription);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Create system tray
function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    
    // Skip tray if icon doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size < 100) {
      console.log('Tray icon not found or invalid, skipping tray creation');
      return;
    }
    
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Sync Now',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('sync-now');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('OnlyJobs Desktop');
    tray.setContextMenu(contextMenu);
    
    // Show window on tray click (macOS/Windows)
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

// Create app menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Sync Emails',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('sync-now');
            }
          }
        },
        {
          label: 'Import Data',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('import-data');
            }
          }
        },
        {
          label: 'Export Data',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('export-data');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: () => {
            shell.openExternal('https://github.com/AndrewTing89/onlyjobs-desktop');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/AndrewTing89/onlyjobs-desktop/issues');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'About ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Load IPC handlers before app is ready
require('./ipc-handlers');

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();
  createMenu();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle OAuth protocol for AppAuth
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('Received OAuth callback:', url);
  
  // AppAuth-JS will handle this internally via the NodeBasedHandler
  // Just ensure the window is focused
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Export for use in other modules
module.exports = { mainWindow };