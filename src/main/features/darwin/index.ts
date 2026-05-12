import './dock-menu';
import { startService } from './media-service';

// Initialize the Darwin Media Service (MPNowPlayingInfoCenter + MPRemoteCommandCenter)
startService();
