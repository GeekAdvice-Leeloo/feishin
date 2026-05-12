import { ipcMain } from 'electron';
import MediaService from 'electron-media-service';

import { getMainWindow } from '/@/main/index';
import { QueueSong } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

const mediaService = new MediaService();

// Track current state for metadata updates
let currentSong: QueueSong | undefined;
let currentPosition = 0; // seconds
let currentDuration = 0; // seconds
let currentStatus: PlayerStatus = PlayerStatus.PAUSED;

const startService = () => {
    try {
        mediaService.startService();
    } catch (err) {
        console.error('[DarwinMediaService] Failed to start service:', err);
    }
};

const stopService = () => {
    try {
        mediaService.stopService();
    } catch (err) {
        console.error('[DarwinMediaService] Failed to stop service:', err);
    }
};

// Push current metadata + position + state to macOS Now Playing
const syncToMacOS = () => {
    if (!currentSong?.id) {
        try {
            mediaService.setMetaData({});
        } catch {
            // Ignore
        }
        return;
    }

    const isRadio = currentSong._serverId === '';

    try {
        const stateMap: Record<PlayerStatus, 'playing' | 'paused' | 'stopped'> = {
            [PlayerStatus.PLAYING]: 'playing',
            [PlayerStatus.PAUSED]: 'paused',
        };

        const metadata: {
            title: string;
            artist: string;
            album: string;
            id: string;
            duration: number;
            currentTime: number;
            state: 'playing' | 'paused' | 'stopped';
        } = {
            title: isRadio ? (currentSong.name || 'Radio') : (currentSong.name || ''),
            artist: isRadio ? (currentSong.artistName || '') : (currentSong.artistName || ''),
            album: isRadio ? (currentSong.album || '') : (currentSong.album || ''),
            id: currentSong.id || '',
            duration: currentDuration ? Math.round(currentDuration * 1000) : 0,
            currentTime: Math.round(currentPosition * 1000),
            state: stateMap[currentStatus] ?? 'paused',
        };

        mediaService.setMetaData(metadata);
    } catch (err) {
        console.error('[DarwinMediaService] Failed to set metadata:', err);
    }
};

// macOS MPRemoteCommandCenter events → renderer IPC
mediaService.on('play', () => {
    getMainWindow()?.webContents.send('renderer-player-play');
});

mediaService.on('pause', () => {
    getMainWindow()?.webContents.send('renderer-player-pause');
});

mediaService.on('toggle', () => {
    getMainWindow()?.webContents.send('renderer-player-play-pause');
});

mediaService.on('next', () => {
    getMainWindow()?.webContents.send('renderer-player-next');
});

mediaService.on('previous', () => {
    getMainWindow()?.webContents.send('renderer-player-previous');
});

mediaService.on('stop', () => {
    getMainWindow()?.webContents.send('renderer-player-stop');
});

// macOS queries position: the native side uses the currentTime we sent in setMetaData
// and tracks elapsed time from there. We just need to make sure currentTime is fresh.
mediaService.on('position', () => {
    // No action needed — the native service uses the last setMetaData's currentTime
    // and system clock to calculate current position. We push position updates
    // via setMetaData whenever position changes.
});

// Renderer → main IPC handlers
ipcMain.on('update-song', (_event, song: QueueSong | undefined, _imageUrl: string | null) => {
    currentSong = song;
    syncToMacOS();
});

ipcMain.on('update-playback', (_event, status: PlayerStatus) => {
    currentStatus = status;
    syncToMacOS();
});

ipcMain.on('update-volume', (_event, _volume: number) => {
    // macOS MPRemoteCommandCenter does not expose a volume control API.
    // Volume is handled by the system Sound preferences, not per-app.
    // No-op on Darwin.
});

ipcMain.on('update-position', (_event, positionSec: number) => {
    currentPosition = positionSec;
    syncToMacOS();
});

ipcMain.on('update-seek', (_event, positionSec: number) => {
    currentPosition = positionSec;
    syncToMacOS();
});

ipcMain.on('update-repeat', () => {
    // Repeat is handled via the Feishin UI, not system controls on Darwin.
    // macOS does not have a standard MPRemoteCommandCenter repeat command.
});

ipcMain.on('update-shuffle', () => {
    // Same as repeat — handled via Feishin UI, not system controls on Darwin.
});

export { startService, stopService };
