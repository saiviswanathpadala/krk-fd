interface TwoFactorResponse {
  Status: string;
  Details: string;
  OTP?: string;
}

class TwoFactorService {
  private apiKey: string;
  private baseUrl = 'https://2factor.in/API/V1';

  constructor() {
    this.apiKey = process.env.TWO_FACTOR_API_KEY!;
    if (!this.apiKey) {
      throw new Error('TWO_FACTOR_API_KEY is required');
    }
  }

  async sendOTP(phone: string): Promise<{ success: boolean; sessionId?: string; message: string }> {
    try {
      const templateName = process.env.TWO_FACTOR_TEMPLATE || 'AUTOGEN';
      let url: string;
      
      if (templateName === 'AUTOGEN') {
        // For AUTOGEN, 2Factor generates the OTP
        url = `${this.baseUrl}/${this.apiKey}/SMS/${phone}/AUTOGEN`;
      } else {
        // For custom templates, we need to generate our own 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        url = `${this.baseUrl}/${this.apiKey}/SMS/${phone}/${otp}/${templateName}`;
      }
      
      console.log(`📱 Sending SMS OTP to: ${phone}`);
      console.log(`🔗 SMS URL: ${url}`);
      
      const response = await fetch(url, { method: 'GET' });
      const data = await response.json() as TwoFactorResponse;
      
      console.log(`📊 2Factor.in SMS response:`, data);

      if (data.Status === 'Success') {
        return {
          success: true,
          sessionId: data.Details,
          message: 'SMS OTP sent successfully'
        };
      } else {
        return {
          success: false,
          message: data.Details || 'Failed to send SMS OTP'
        };
      }
    } catch (error) {
      console.error('❌ 2Factor.in SMS error:', error);
      return {
        success: false,
        message: 'SMS service unavailable'
      };
    }
  }

  async verifyOTP(sessionId: string, otp: string): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.baseUrl}/${this.apiKey}/SMS/VERIFY/${sessionId}/${otp}`;
      
      console.log(`🔗 2Factor.in verify URL: ${url}`);
      
      const response = await fetch(url, { method: 'GET' });
      const data = await response.json() as TwoFactorResponse;
      
      console.log(`📊 2Factor.in API response:`, data);

      if (data.Status === 'Success' && data.Details === 'OTP Matched') {
        return {
          success: true,
          message: 'OTP verified successfully'
        };
      } else {
        const errorMessage = data.Details === 'OTP Expired' ? 'Invalid or expired OTP' : data.Details || 'Invalid OTP';
        return {
          success: false,
          message: errorMessage
        };
      }
    } catch (error) {
      console.error('❌ 2Factor.in verify error:', error);
      return {
        success: false,
        message: 'Verification service unavailable'
      };
    }
  }
}

export const twoFactorService = new TwoFactorService();