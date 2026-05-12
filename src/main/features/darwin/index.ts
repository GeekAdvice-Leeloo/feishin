import './dock-menu';
import { startService, stopService } from './media-service';

// Start macOS media service (Now Playing, remote commands)
startService();

// Handle app quit - cleanup media service
process.on('beforeExit', () => {
    stopService();
});
