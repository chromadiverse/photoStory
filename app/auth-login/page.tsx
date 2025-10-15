// app/auth-login/page.tsx (PWA)
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../lib/supabase/client'; 
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from '../components/ui/button';

interface DebugInfo {
  error?: string;
  environment?: {
    NEXT_PUBLIC_ALUMNI_API_URL?: string;
    NODE_ENV?: string;
    timestamp: string;
  };
  tokenInfo?: {
    token: string;
    length: number;
  };
  authResult?: {
    success: boolean;
    error?: any;
  };
  sessionVerified?: boolean;
}

function AuthLoginContent() {
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
      setMessage('Invalid link - no authentication token provided');
      setDebugInfo({ error: 'No token in URL parameters' });
      return;
    }

    console.log('🚀 Auth login initialized with token');
    handleAuthLogin(token);
  }, [token]);

  const handleAuthLogin = async (token: string) => {
    try {
      console.log('🔍 Starting auth login with token');
      
      const envInfo = {
        NEXT_PUBLIC_ALUMNI_API_URL: process.env.NEXT_PUBLIC_ALUMNI_API_URL,
        NODE_ENV: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      };
      console.log('🌍 Environment info:', envInfo);
      setDebugInfo(prev => ({ ...prev, environment: envInfo }));
      
      const supabase = createClient();

      // Build API URL
      const baseUrl = process.env.NEXT_PUBLIC_ALUMNI_API_URL;
      if (!baseUrl) {
        throw new Error('NEXT_PUBLIC_ALUMNI_API_URL environment variable is not set');
      }

      const apiUrl = `${baseUrl}/api/validate-auth-link-token`;
      console.log('🌐 API URL:', apiUrl);
      
      setDebugInfo(prev => ({ 
        ...prev, 
        tokenInfo: { token: token.substring(0, 10) + '...', length: token.length }
      }));
      
      // Make API request to validate token
      let response: Response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ token }),
        });
      } catch (fetchError: any) {
        console.error('🚫 Fetch failed:', fetchError);
        throw new Error(`Network request failed: ${fetchError.message}`);
      }

      console.log('📡 API Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Failed to validate authentication link' };
        }
        
        throw new Error(errorData.error || 'Failed to validate authentication link');
      }

      const responseData = await response.json();
      console.log('✅ API Response received');

      // Set session with tokens from response
      if (responseData.session && responseData.session.access_token) {
        console.log('🔐 Setting session with tokens...');

        const { data: authData, error: authError } = await supabase.auth.setSession({
          access_token: responseData.session.access_token,
          refresh_token: responseData.session.refresh_token
        });

        console.log('📊 Auth result:', { success: !authError });
        setDebugInfo(prev => ({ 
          ...prev, 
          authResult: { success: !authError, error: authError }
        }));

        if (authError) {
          console.error('❌ Auth error:', authError);
          throw authError;
        }

        // Verify session was set
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('🔍 Session verified:', !!currentSession);
        setDebugInfo(prev => ({ ...prev, sessionVerified: !!currentSession }));

        if (!currentSession) {
          throw new Error('Session was not set properly');
        }

      } else {
        throw new Error('Invalid response format from authentication server');
      }

      setStatus('success');
      setMessage('Login successful! Redirecting to your app...');
      console.log('✅ Auth login completed successfully');

      // Redirect to home page after success
      setTimeout(() => {
        console.log('🔄 Redirecting to home...');
        router.push('/');
      }, 1500);

    } catch (error: any) {
      console.error('💥 Auth Login error:', error);
      
      setDebugInfo(prev => ({ 
        ...prev, 
        error: error.message 
      }));
      
      if (error.message.includes('expired') || error.message.includes('Invalid or expired')) {
        setStatus('expired');
        setMessage('This login link has expired. Please generate a new one from the main app.');
      } else if (error.message.includes('NEXT_PUBLIC_ALUMNI_API_URL')) {
        setStatus('error');
        setMessage('Configuration error: Main app URL not configured');
      } else if (error.message.includes('Network request failed')) {
        setStatus('network-error');
        setMessage('Cannot connect to main app. Please check your connection.');
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
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'loading':
        return 'Logging you in...';
      case 'success':
        return 'Login Successful!';
      case 'expired':
        return 'Link Expired';
      case 'network-error':
        return 'Connection Problem';
      case 'error':
        return 'Login Failed';
    }
  };

  const retryLogin = () => {
    if (token) {
      setStatus('loading');
      setMessage('');
      setDebugInfo({});
      handleAuthLogin(token);
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
              
              {process.env.NODE_ENV !== 'production' && (
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
    </div>
  );
}

export default function AuthLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            </div>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>
              Please wait while we process your login
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <AuthLoginContent />
    </Suspense>
  );
}