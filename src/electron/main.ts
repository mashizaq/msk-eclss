import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import isDev from 'electron-is-dev';
import path from 'path';
import axios from 'axios';

let mainWindow: BrowserWindow | null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.ts'),
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../frontend/dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers for secure backend communication
ipcMain.handle('fetch-telemetry', async (event, measurement: string, range: string) => {
  try {
    const response = await axios.get(`http://localhost:5000/api/telemetry/${measurement}`, {
      params: { range },
    });
    return response.data;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('set-setpoint', async (event, system: string, parameter: string, value: number) => {
  try {
    const response = await axios.post('http://localhost:5000/api/setpoint', {
      system,
      parameter,
      value,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('get-state', async () => {
  try {
    const response = await axios.get('http://localhost:5000/api/state');
    return response.data;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

// Create application menu
const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

app.on('ready', createMenu);
