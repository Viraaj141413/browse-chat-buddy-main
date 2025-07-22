import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Mic, 
  MicOff, 
  Send, 
  Play, 
  Pause, 
  Square, 
  Monitor,
  User,
  Bot,
  Loader2,
  Settings,
  LogOut,
  UserCircle
} from 'lucide-react';
import axios from 'axios';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
}

type BrowserStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

const BrowserPreview = () => {
  const [currentUrl, setCurrentUrl] = useState('about:blank');
  const [status, setStatus] = useState('Connecting...');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const connectWebSocket = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      setStatus('Connecting to browser...');
      const ws = new WebSocket('ws://localhost:3001');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus('Connected');
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
          
          if (data.type === 'status') {
            setStatus(data.status);
          } else if (data.type === 'url') {
            setCurrentUrl(data.url);
            setIsLoading(false);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setStatus('Disconnected');
        wsRef.current = null;
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Failed to connect to browser');
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setError('Failed to connect to browser');
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Function to check browser status
  const checkBrowserStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001');
      const data = await response.json();
      if (!data.browserActive) {
        setError('Browser not active');
      }
    } catch (e) {
      setError('Cannot connect to server');
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(checkBrowserStatus, 5000);
    return () => clearInterval(interval);
  }, [checkBrowserStatus]);

  // Function to send a command to the browser
  const sendCommand = async (command: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:3001/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute command');
      }
      setIsLoading(false);
    } catch (e) {
      setError(e.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-sm font-medium">{status}</span>
          {error && (
            <span className="text-sm text-red-500 ml-2">{error}</span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{currentUrl}</div>
      </div>
      <div className="flex-1 relative">
        {currentUrl !== 'about:blank' && (
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="w-full h-full border-none"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            allow="fullscreen"
          />
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <div className="animate-spin">⌛</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4 bg-red-100 rounded-lg">
              <p className="text-red-600">{error}</p>
              <button
                onClick={connectWebSocket}
                className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Reconnect
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="p-2 border-t">
        <div className="flex gap-2">
          <button
            onClick={() => sendCommand('go to google.com')}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go to Google
          </button>
          <button
            onClick={() => sendCommand('go to youtube.com')}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Go to YouTube
          </button>
        </div>
      </div>
    </div>
  );
};

export const AIInterface = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: 'Hello! I\'m your AI assistant. I can browse the web and perform tasks for you. What would you like me to do?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [geminiPreview, setGeminiPreview] = useState<string | null>(null);
  const [geminiCode, setGeminiCode] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiRaw, setGeminiRaw] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const screenshotRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Get the session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // First, get AI response
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('gemini-chat', {
        body: { 
          message: inputMessage,
          context: 'web browsing assistant'
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (aiError) throw aiError;

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Then start browser automation
      const { data: browserResponse, error: browserError } = await supabase.functions.invoke('browser-automation', {
        body: {
          action: 'start_session',
          task: inputMessage
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (browserError) throw browserError;

      if (browserResponse.success) {
        setSessionId(browserResponse.sessionId);
        setTotalSteps(browserResponse.steps.length);
        setCurrentStep(browserResponse.currentStep);
        setBrowserStatus('running');
        
        // Start polling for screenshots
        startScreenshotPolling(browserResponse.sessionId);
      }

    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Failed to process request: ' + error.message);
      
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: 'ai',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const startScreenshotPolling = (sessionId: string) => {
    const pollScreenshots = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase.functions.invoke('browser-automation', {
          body: {
            action: 'get_screenshot',
            sessionId
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (error) throw error;

        if (data.success) {
          setScreenshotUrl(data.screenshotUrl);
          setCurrentStep(data.currentStep);
          
          if (data.status === 'completed') {
            setBrowserStatus('completed');
            return;
          }
        }
      } catch (error) {
        console.error('Screenshot polling error:', error);
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(pollScreenshots, 3000);
    
    // Clean up after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
    }, 300000);
  };

  const handlePause = async () => {
    if (!sessionId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('browser-automation', {
        body: {
          action: 'pause_session',
          sessionId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      if (data.success) {
        setBrowserStatus('paused');
        toast.success('Browser automation paused');
      }
    } catch (error: any) {
      toast.error('Failed to pause: ' + error.message);
    }
  };

  const handleResume = async () => {
    if (!sessionId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('browser-automation', {
        body: {
          action: 'resume_session',
          sessionId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      if (data.success) {
        setBrowserStatus('running');
        toast.success('Browser automation resumed');
      }
    } catch (error: any) {
      toast.error('Failed to resume: ' + error.message);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('browser-automation', {
        body: {
          action: 'stop_session',
          sessionId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      if (data.success) {
        setBrowserStatus('idle');
        setSessionId(null);
        setScreenshotUrl('');
        setCurrentStep(0);
        setTotalSteps(0);
        toast.success('Browser automation stopped');
      }
    } catch (error: any) {
      toast.error('Failed to stop: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleGeminiBrowser = async () => {
    setGeminiPreview(null);
    setGeminiCode(null);
    setGeminiError(null);
    setGeminiRaw(null);
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:3001/gemini', { prompt: inputMessage });
      setGeminiPreview(response.data.screenshot);
      setGeminiCode(response.data.code);
      setGeminiRaw(response.data.gemini);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'ai',
        content: response.data.result || 'Task completed.',
        timestamp: new Date()
      }]);
    } catch (err: any) {
      setGeminiError(err.response?.data?.error || err.message);
      setGeminiRaw(err.response?.data?.gemini);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'ai',
        content: 'Failed to process Gemini request: ' + (err.response?.data?.error || err.message),
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-background via-background/95 to-primary/5 flex flex-col">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/70 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">AI Browser Assistant</h1>
              <p className="text-sm text-muted-foreground">Live web browsing powered by AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={browserStatus === 'running' ? 'default' : browserStatus === 'paused' ? 'secondary' : 'outline'}>
              {browserStatus === 'running' && <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />}
              {browserStatus.charAt(0).toUpperCase() + browserStatus.slice(1)}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Avatar className="w-6 h-6 mr-2">
                    <AvatarFallback>
                      {user?.email?.charAt(0).toUpperCase() || <UserCircle className="w-4 h-4" />}
                    </AvatarFallback>
                  </Avatar>
                  {user?.email?.split('@')[0]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Chat Panel */}
        <div className="w-1/2 border-r border-border flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[85%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className={
                        message.type === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary text-secondary-foreground'
                      }>
                        {message.type === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <Card className={`${
                      message.type === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}>
                      <CardContent className="p-3">
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-3 max-w-[85%]">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <Card className="bg-muted">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">AI is thinking...</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Tell me what you want me to do..."
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsRecording(!isRecording)}
                className={isRecording ? 'bg-red-500 text-white hover:bg-red-600' : ''}
                disabled={isLoading}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button 
                onClick={handleSendMessage} 
                size="icon"
                disabled={isLoading || !inputMessage.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
              <Button onClick={handleGeminiBrowser} disabled={isLoading || !inputMessage.trim()}>
                Run in AI Browser
              </Button>
            </div>
          </div>
        </div>

        {/* Browser Preview Panel */}
        <div className="w-1/2 flex flex-col">
          <BrowserPreview />
        </div>
      </div>
      {geminiPreview && (
        <div style={{ marginTop: 16 }}>
          <img src={geminiPreview} alt="Gemini Browser Preview" style={{ width: '100%', borderRadius: 8, border: '1px solid #ccc' }} />
          {geminiCode && <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 8, fontSize: 12 }}>{geminiCode}</pre>}
        </div>
      )}
      {geminiError && (
        <div style={{ color: 'red', marginTop: 8 }}>
          <strong>Error:</strong> {geminiError}
          {geminiRaw && <details><summary>Gemini Raw Response</summary><pre style={{ fontSize: 10 }}>{JSON.stringify(geminiRaw, null, 2)}</pre></details>}
        </div>
      )}
    </div>
  );
};