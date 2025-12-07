import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sendOTP, verifyOTP, getMe } from '../controllers/authController';
import { authenticateToken, validateToken } from '../middleware/auth';
import { logout } from '../controllers/employeeProfileController';

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: { message: 'Too many OTP requests, try again later' },
});

router.post('/send-otp', otpLimiter, sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/validate-token', validateToken);
router.get('/me', authenticateToken, getMe);
router.post('/logout', authenticateToken, logout);

export default router;