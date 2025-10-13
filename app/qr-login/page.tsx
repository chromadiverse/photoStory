// app/qr-login/page.tsx - FIXED: Removed blocking health check
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../lib/supabase/client'; 
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from '../components/ui/button';
import { ServerDebugConsole } from '../components/server-debut'; 

interface DebugInfo {
  error?: string;
  environment?: {
    NEXT_PUBLIC_ALUMNI_API_URL?: string;
    NODE_ENV?: string;
    userAgent: string;
    currentUrl: string;
    timestamp: string;
  };
  configError?: string;
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: { token: string };
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    ok: boolean;
  };
  errorResponse?: any;
  rawErrorText?: string;
  successResponse?: any;
  sessionError?: string;
  responseData?: any;
  authResult?: {
    authData: any;
    authError: any;
  };
  verifiedSession?: boolean;
  sessionVerificationError?: string;
  finalError?: {
    message: string;
    name: string;
    stack?: string;
    timestamp: string;
    cause?: any;
  };
}

// Component that uses useSearchParams - must be wrapped in Suspense
function QRLoginContent() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired' | 'network-error'>('loading');
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      console.error('❌ No token provided in URL');
      setStatus('error');
      setMessage('Invalid QR code - no token provided');
      setDebugInfo({ error: 'No token in URL parameters' });
      return;
    }

    console.log('🚀 QR Login initialized with token:', token);
    handleQRLogin(token);
  }, [token]);

  const handleQRLogin = async (token: string) => {
    try {
      console.log('🔍 Starting QR login with token:', token);
      
      // Log environment info
      const envInfo = {
        NEXT_PUBLIC_ALUMNI_API_URL: process.env.NEXT_PUBLIC_ALUMNI_API_URL,
        NODE_ENV: process.env.NODE_ENV,
        userAgent: navigator.userAgent,
        currentUrl: window.location.href,
        timestamp: new Date().toISOString()
      };
      console.log('🌍 Environment info:', envInfo);
      setDebugInfo(prev => ({ ...prev, environment: envInfo }));
      
      const supabase = createClient();

      // Build API URL with fallback
      const baseUrl = process.env.NEXT_PUBLIC_ALUMNI_API_URL;
      if (!baseUrl) {
        const error = 'NEXT_PUBLIC_ALUMNI_API_URL environment variable is not set';
        console.error('❌', error);
        setDebugInfo(prev => ({ ...prev, configError: error }));
        throw new Error(error);
      }

      const apiUrl = `${baseUrl}/api/validate-qr-token`;
      console.log('🌐 API URL constructed:', apiUrl);
      
      // Log request details
      const requestDetails = {
        url: apiUrl,
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: { token }
      };
      console.log('📤 Making API request:', requestDetails);
      setDebugInfo(prev => ({ ...prev, request: requestDetails }));
      
      // Make the actual API request with better error handling
      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit', // Don't send cookies for cross-origin
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ token }),
        });
      } catch (fetchError: any) {
        console.error('🚫 Fetch failed:', fetchError);
        setDebugInfo(prev => ({ 
          ...prev, 
          finalError: {
            message: fetchError.message,
            name: fetchError.name,
            stack: fetchError.stack,
            timestamp: new Date().toISOString(),
            cause: fetchError.cause
          }
        }));
        throw new Error(`Network request failed: ${fetchError.message}. Please check if the main app is accessible.`);
      }

      // Log response details
      const responseInfo = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      };
      console.log('📡 API Response info:', responseInfo);
      setDebugInfo(prev => ({ ...prev, response: responseInfo }));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error response text:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.log('📄 Parsed error data:', errorData);
        } catch (parseError) {
          console.error('❌ Failed to parse error response:', parseError);
          errorData = { error: errorText || 'Failed to validate QR code', rawError: errorText };
        }
        
        setDebugInfo(prev => ({ ...prev, errorResponse: errorData, rawErrorText: errorText }));
        throw new Error(errorData.error || errorData.message || 'Failed to validate QR code');
      }

      const responseData = await response.json();
      console.log('✅ API Response data:', responseData);
      setDebugInfo(prev => ({ ...prev, successResponse: responseData }));

      // Check for new response format with session tokens
      if (responseData.session && responseData.session.access_token) {
        console.log('🔐 Setting session with tokens from response...');

        // Use the session tokens directly from the API response
        const { data: authData, error: authError } = await supabase.auth.setSession({
          access_token: responseData.session.access_token,
          refresh_token: responseData.session.refresh_token
        });

        console.log('📊 Auth result:', { authData, authError });
        setDebugInfo(prev => ({ ...prev, authResult: { authData, authError } }));

        if (authError) {
          console.error('❌ Auth error:', authError);
          throw authError;
        }

        // Verify the session was set correctly
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('🔍 Current session after auth:', currentSession);
        setDebugInfo(prev => ({ ...prev, verifiedSession: !!currentSession }));

        if (!currentSession) {
          const error = 'Session was not set properly';
          console.error('❌', error);
          setDebugInfo(prev => ({ ...prev, sessionVerificationError: error }));
          throw new Error(error);
        }

      } else if (responseData.auth_method === 'client_side_required' && responseData.user) {
        console.log('🔄 Using client-side authentication fallback...');
        
        // Fallback: Use OTP-less signin with the user's email
        const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
          email: responseData.user.email,
          options: {
            shouldCreateUser: false, // User already exists
            data: {
              qr_login: true,
              qr_login_timestamp: new Date().toISOString()
            }
          }
        });

        if (authError) {
          console.error('❌ Client-side auth error:', authError);
          // Try alternative approach: sign in anonymously then link account
          console.log('🔄 Trying alternative client-side approach...');
          
          try {
            // Alternative: Create a temporary session and redirect to complete auth
            setStatus('success');
            setMessage('Authentication validated! Redirecting to complete login...');
            
            // Store user info temporarily and redirect to login page with special flag
            sessionStorage.setItem('qr_login_user', JSON.stringify(responseData.user));
            
            setTimeout(() => {
              router.push(`/login?qr_verified=true&email=${encodeURIComponent(responseData.user.email)}`);
            }, 2000);
            
            return; // Exit early since we're redirecting
          } catch (altError: any) {
            console.error('❌ Alternative approach failed:', altError);
            throw new Error('Failed to complete authentication. Please try manual login.');
          }
        }

        console.log('📊 Client-side auth result:', { authData, authError });
        setDebugInfo(prev => ({ ...prev, authResult: { authData, authError } }));

        // For OTP signin, we don't get an immediate session, so we handle it differently
        if (authData && !authError) {
          setStatus('success');
          setMessage('Verification email sent! Please check your email to complete login.');
          return; // Don't redirect immediately for OTP flow
        }

      } else {
        const error = 'Invalid response format from authentication server';
        console.error('❌', error, 'Response:', responseData);
        setDebugInfo(prev => ({ ...prev, sessionError: error, responseData }));
        throw new Error(error);
      }

      setStatus('success');
      setMessage('Login successful! Redirecting...');
      console.log('✅ QR login completed successfully');

      // Redirect after a short delay to show success message
      setTimeout(() => {
        console.log('🔄 Redirecting to dashboard...');
        router.push('/');
      }, 2000);

    } catch (error: any) {
      console.error('💥 QR Login error:', error);
      
      const errorInfo = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        cause: error.cause
      };
      console.error('💥 Error details:', errorInfo);
      setDebugInfo(prev => ({ ...prev, finalError: errorInfo }));
      
      if (error.message.includes('expired')) {
        setStatus('expired');
        setMessage('QR code has expired. Please generate a new one.');
      } else if (error.message.includes('NEXT_PUBLIC_ALUMNI_API_URL')) {
        setStatus('error');
        setMessage('Configuration error: Alumni app URL not configured');
      } else if (error.message.includes('Network request failed') || error.message.includes('Load failed') || error.name === 'TypeError') {
        setStatus('network-error');
        setMessage(`Cannot connect to main app. This might be a CORS configuration issue.`);
      } else {
        setStatus('error');
        setMessage(error.message || 'Authentication failed');
      }
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-12 w-12 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-600" />;
      case 'network-error':
        return <AlertTriangle className="h-12 w-12 text-orange-600" />;
      case 'error':
      case 'expired':
        return <XCircle className="h-12 w-12 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'loading':
        return 'Logging you in...';
      case 'success':
        return 'Login Successful!';
      case 'expired':
        return 'QR Code Expired';
      case 'network-error':
        return 'Connection Problem';
      case 'error':
        return 'Login Failed';
      default:
        return '';
    }
  };

  const retryLogin = () => {
    if (token) {
      setStatus('loading');
      setMessage('');
      setDebugInfo({});
      handleQRLogin(token);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle>{getStatusTitle()}</CardTitle>
          <CardDescription>
            {message || 'Please wait while we authenticate you...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {(status === 'error' || status === 'expired' || status === 'network-error') && (
            <div className="space-y-3">
              {status === 'network-error' && (
                <Button 
                  onClick={retryLogin}
                  className="w-full"
                  variant="default"
                >
                  Retry Connection
                </Button>
              )}
              
              <Button 
                onClick={() => router.push('/login')}
                className="w-full"
                variant={status === 'network-error' ? 'outline' : 'default'}
              >
                Go to Login
              </Button>
              
              {/* Show debug info button in development or when requested */}
              {(process.env.NODE_ENV !== 'production' || window.location?.search.includes('debug=true')) && (
                <details className="text-left text-xs bg-gray-100 p-2 rounded">
                  <summary className="cursor-pointer font-semibold">Debug Info</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words">
                    {JSON.stringify(debugInfo, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Server Debug Console - automatically shows on mobile */}
      <ServerDebugConsole />
    </div>
  );
}

// Main export with Suspense boundary
export default function QRLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            </div>
            <CardTitle>Loading QR Code...</CardTitle>
            <CardDescription>
              Please wait while we process your QR code
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <QRLoginContent />
    </Suspense>
  );
}