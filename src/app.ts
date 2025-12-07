import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Log all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log('\n' + '━'.repeat(80));
  console.log(`📥 INCOMING REQUEST`);
  console.log(`⏰ Time:   ${timestamp}`);
  console.log(`📦 Method: ${req.method}`);
  console.log(`🔗 URL:    ${req.url}`);
  console.log(`📍 IP:     ${req.ip}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:   ${JSON.stringify(req.body)}`);
  }
  console.log('━'.repeat(80));
  next();
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Maruthi Real Estate API is running',
    timestamp: new Date().toISOString(),
  });
});

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import propertyRoutes from './routes/property';
import contactRoutes from './routes/contact';
import bannerRoutes from './routes/banner';
import chatRoutes from './routes/chat';
import adminRoutes from './routes/adminRoutes';
import employeeRoutes from './routes/employeeRoutes';
import uploadRoutes from './routes/uploadRoutes';
import personChatRoutes from './routes/personChatRoutes';
import loanRequestRoutes from './routes/loanRequest';

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to Maruthi Real Estate API',
    version: '1.0.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/chat/person', personChatRoutes);
app.use('/api/loan-requests', loanRequestRoutes);

export default app;
