// Performance monitoring utilities for web worker usage
import { createSignal } from 'solid-js';

export function usePerformanceMonitor(enabled = false) {
  const [metrics, setMetrics] = createSignal({
    mainThreadTime: 0,
    workerTime: 0,
    jsonParseCount: 0,
    httpRequestCount: 0,
    animationFrameCount: 0,
    dataProcessingCount: 0,
    wsMessageCount: 0
  });

  const startTimer = () => performance.now();
  
  const recordMainThreadTime = (startTime: number) => {
    if (!enabled) return;
    
    const elapsed = performance.now() - startTime;
    setMetrics(prev => ({
      ...prev,
      mainThreadTime: prev.mainThreadTime + elapsed
    }));
  };

  const recordWorkerOperation = (type: 'json' | 'http' | 'animation' | 'data' | 'websocket', time?: number) => {
    if (!enabled) return;
    
    setMetrics(prev => {
      // Estimate reasonable time if not provided
      const estimatedTime = time ?? (() => {
        switch (type) {
          case 'json': return 5; // 5ms average for JSON operations
          case 'http': return 50; // 50ms average for HTTP requests
          case 'data': return 10; // 10ms average for data processing
          case 'animation': return 16; // 16ms per animation frame
          case 'websocket': return 2; // 2ms average for WebSocket messages
          default: return 1;
        }
      })();
      
      const updates = { workerTime: prev.workerTime + estimatedTime };
      
      switch (type) {
        case 'json':
          (updates as any).jsonParseCount = prev.jsonParseCount + 1;
          break;
        case 'http':
          (updates as any).httpRequestCount = prev.httpRequestCount + 1;
          break;
        case 'animation':
          (updates as any).animationFrameCount = prev.animationFrameCount + 1;
          break;
        case 'data':
          (updates as any).dataProcessingCount = prev.dataProcessingCount + 1;
          break;
        case 'websocket':
          (updates as any).wsMessageCount = prev.wsMessageCount + 1;
          break;
      }
      
      return { ...prev, ...updates };
    });
  };

  const reset = () => {
    setMetrics({
      mainThreadTime: 0,
      workerTime: 0,
      jsonParseCount: 0,
      httpRequestCount: 0,
      animationFrameCount: 0,
      dataProcessingCount: 0,
      wsMessageCount: 0
    });
  };

  const getEfficiencyRatio = () => {
    const current = metrics();
    const totalTime = current.mainThreadTime + current.workerTime;
    if (totalTime === 0) return 0;
    return (current.workerTime / totalTime) * 100;
  };

  return {
    metrics,
    startTimer,
    recordMainThreadTime,
    recordWorkerOperation,
    reset,
    getEfficiencyRatio,
    enabled
  };
}