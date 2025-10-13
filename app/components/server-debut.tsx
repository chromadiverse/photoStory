// components/ServerDebugConsole.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Send } from 'lucide-react';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
  data?: any;
}

export function ServerDebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [logId, setLogId] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Send log to server
  const sendLogToServer = async (level: string, message: any, data?: any) => {
    try {
      await fetch('/api/debug-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level,
          message: typeof message === 'string' ? message : JSON.stringify(message),
          data,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to send log to server:', error);
    }
  };

  useEffect(() => {
    // Monitor online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Show debug console on mobile or when debug=true
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isDebugMode = window.location.search.includes('debug=true');
    
    if (isMobile || isDebugMode || process.env.NODE_ENV !== 'production') {
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      const originalInfo = console.info;

      const addLog = (level: LogEntry['level'], message: any, ...args: any[]) => {
        const entry: LogEntry = {
          id: logId,
          timestamp: new Date().toLocaleTimeString(),
          level,
          message: typeof message === 'string' ? message : JSON.stringify(message, null, 2),
          data: args.length > 0 ? args : undefined
        };
        
        setLogs(prev => [...prev.slice(-49), entry]);
        setLogId(prev => prev + 1);
        
        // Send to server (especially for errors)
        if (level === 'error' || isDebugMode) {
          sendLogToServer(level, message, args.length > 0 ? args : undefined);
        }
      };

      console.log = (message: any, ...args: any[]) => {
        originalLog(message, ...args);
        addLog('log', message, ...args);
      };

      console.error = (message: any, ...args: any[]) => {
        originalError(message, ...args);
        addLog('error', message, ...args);
      };

      console.warn = (message: any, ...args: any[]) => {
        originalWarn(message, ...args);
        addLog('warn', message, ...args);
      };

      console.info = (message: any, ...args: any[]) => {
        originalInfo(message, ...args);
        addLog('info', message, ...args);
      };

      // Auto-show console on mobile for errors
      const originalErrorHandler = window.onerror;
      window.onerror = (message: Event | string, source?: string, lineno?: number, colno?: number, error?: Error) => {
        console.error('Global Error:', { message, source, lineno, colno, error });
        if (isMobile) setIsVisible(true);
        if (originalErrorHandler) {
          return originalErrorHandler.call(window, message, source, lineno, colno, error);
        }
        return false;
      };

      // Handle unhandled promise rejections
      const originalRejectionHandler = window.onunhandledrejection;
      window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        console.error('Unhandled Promise Rejection:', event.reason);
        if (isMobile) setIsVisible(true);
        if (originalRejectionHandler) {
          return originalRejectionHandler.call(window, event);
        }
        return false;
      };

      return () => {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        console.info = originalInfo;
        window.onerror = originalErrorHandler;
        window.onunhandledrejection = originalRejectionHandler;
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [logId]);

  const sendAllLogsToServer = async () => {
    try {
      await fetch('/api/debug-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: 'info',
          message: 'BULK LOG DUMP',
          data: {
            allLogs: logs,
            sessionInfo: {
              userAgent: navigator.userAgent,
              url: window.location.href,
              timestamp: new Date().toISOString(),
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight
              }
            }
          },
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      });
      alert('Logs sent to server! Check your server console.');
    } catch (error) {
      console.error('Failed to send bulk logs:', error);
      alert('Failed to send logs to server');
    }
  };

  return (
    <>
      {/* Toggle Button - Always visible on mobile */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-50 bg-red-600 text-white p-3 rounded-full shadow-lg hover:bg-red-700 transition-colors"
        title="Toggle Debug Console"
      >
        {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
        {!isOnline && <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-500 rounded-full"></div>}
      </button>

      {/* Debug Console */}
      {isVisible && (
        <div className="fixed inset-4 bg-black text-green-400 font-mono text-xs rounded-lg shadow-2xl z-40 border border-gray-600 flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-gray-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">Mobile Debug</span>
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={sendAllLogsToServer}
                className="text-blue-400 hover:text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1"
                title="Send all logs to server"
              >
                <Send size={12} />
                Send
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-gray-400 hover:text-white px-2 py-1 rounded text-xs"
                title="Clear logs"
              >
                Clear
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="text-gray-400 hover:text-white p-1"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          
          <div className="p-2 flex-1 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center mt-8">
                No logs yet...
                <br />
                <small>Errors are automatically sent to server</small>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`mb-2 ${
                  log.level === 'error' ? 'text-red-400' :
                  log.level === 'warn' ? 'text-yellow-400' :
                  log.level === 'info' ? 'text-blue-400' :
                  'text-green-400'
                }`}>
                  <div className="flex gap-2">
                    <span className="text-gray-500 text-xs">{log.timestamp}</span>
                    <span className="uppercase text-xs font-bold">{log.level}</span>
                  </div>
                  <div className="ml-2 break-words whitespace-pre-wrap">
                    {log.message}
                    {log.data && (
                      <div className="mt-1 text-gray-300">
                        {JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="p-2 border-t border-gray-600 text-xs text-gray-500 flex-shrink-0">
            Tap "Send" to send all logs to server console
          </div>
        </div>
      )}
    </>
  );
}