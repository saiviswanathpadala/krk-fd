import app from './app';
import { createServer } from 'http';
import { initializeSocket } from './services/socketService';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.SERVER_HOST || '0.0.0.0';
const SERVER_IP = process.env.SERVER_IP || 'localhost';

const server = createServer(app);
initializeSocket(server);

server.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MARUTHI REAL ESTATE API SERVER');
  console.log('='.repeat(60));
  console.log(`📍 Local:    http://localhost:${PORT}/health`);
  console.log(`📱 Mobile:   http://${SERVER_IP}:${PORT}/health`);
  console.log(`🔗 API:      http://${SERVER_IP}:${PORT}/api`);
  console.log(`🔐 Auth:     http://${SERVER_IP}:${PORT}/api/auth`);
  console.log('='.repeat(60));
  console.log('✅ Server is ready to accept requests');
  console.log('📝 Watching for API calls...\n');
});