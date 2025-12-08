interface MSG91SendResponse {
  type: string;
  message?: string;
  request_id?: string;
}

interface MSG91VerifyResponse {
  type: string;
  message?: string;
  request_id?: string;
}

class MSG91Service {
  private authKey: string;
  private templateId: string;
  private senderId: string;
  private baseUrl = 'https://control.msg91.com/api/v5';

  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY!;
    this.templateId = process.env.MSG91_TEMPLATE_ID!;
    this.senderId = process.env.MSG91_SENDER_ID!;
    
    if (!this.authKey || !this.templateId || !this.senderId) {
      throw new Error('MSG91 configuration is required');
    }
  }

  async sendOTP(phone: string): Promise<{ success: boolean; sessionId?: string; message: string }> {
    try {
      // Remove '+' from E.164 format (e.g., +919876543210 -> 919876543210)
      const formattedPhone = phone.replace(/^\+/, '');
      const url = `${this.baseUrl}/otp?otp_expiry=10&template_id=${this.templateId}&mobile=${formattedPhone}&authkey=${this.authKey}&realTimeResponse=1&otp_length=4`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/JSON',
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText) as MSG91SendResponse;
      } catch (parseError) {
        console.error('MSG91 parse error:', parseError);
        return {
          success: false,
          message: 'SMS service error'
        };
      }
      
      if (data.type === 'success') {
        return {
          success: true,
          sessionId: formattedPhone,
          message: 'OTP sent successfully'
        };
      } else {
        console.error('MSG91 send failed:', data.message);
        return {
          success: false,
          message: data.message || 'Failed to send OTP'
        };
      }
    } catch (error) {
      console.error('MSG91 send error:', error);
      return {
        success: false,
        message: 'SMS service unavailable'
      };
    }
  }

  async verifyOTP(sessionId: string, otp: string): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.baseUrl}/otp/verify?otp=${otp}&mobile=${sessionId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'authkey': this.authKey
        }
      });

      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText) as MSG91VerifyResponse;
      } catch (parseError) {
        console.error('MSG91 verify parse error:', parseError);
        return {
          success: false,
          message: 'Verification service error'
        };
      }
      
      if (data.type === 'success') {
        return {
          success: true,
          message: 'OTP verified successfully'
        };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid OTP'
        };
      }
    } catch (error) {
      console.error('MSG91 verify error:', error);
      return {
        success: false,
        message: 'Verification service unavailable'
      };
    }
  }
}

export const msg91Service = new MSG91Service();