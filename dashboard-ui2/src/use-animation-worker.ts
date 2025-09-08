// Hook for managing animation coordination web worker
import { createSignal, onCleanup } from 'solid-js';
import type { 
  AnimationConfig, 
  AnimationWorkerMessage, 
  AnimationWorkerResponse 
} from './animation-worker';
import AnimationWorker from './animation-worker?worker';

type AnimationCallbacks = {
  onFrame?: (progress: number, elapsed: number) => void;
  onComplete?: () => void;
  onStop?: () => void;
};

export function useAnimationWorker() {
  const [frameRate, setFrameRate] = createSignal(60);
  let worker: Worker | null = null;
  let animationId = 0;
  const activeAnimations = new Map<string, AnimationCallbacks>();

  const initWorker = () => {
    if (worker) return worker;
    
    worker = new AnimationWorker();
    
    worker.addEventListener('message', (event: MessageEvent<AnimationWorkerResponse>) => {
      const { type, id } = event.data;
      const callbacks = activeAnimations.get(id);
      
      switch (type) {
        case 'ANIMATION_FRAME': {
          const { progress, elapsed } = event.data;
          callbacks?.onFrame?.(progress, elapsed);
          break;
        }
        
        case 'ANIMATION_COMPLETE': {
          callbacks?.onComplete?.();
          activeAnimations.delete(id);
          break;
        }
        
        case 'ANIMATION_STOPPED': {
          callbacks?.onStop?.();
          activeAnimations.delete(id);
          break;
        }
        
        case 'FRAME_RATE_UPDATED': {
          const { fps } = event.data;
          setFrameRate(fps);
          break;
        }
      }
    });
    
    return worker;
  };

  const animate = (
    config: AnimationConfig,
    callbacks: AnimationCallbacks = {}
  ): { stop: () => void; pause: () => void; resume: () => void; id: string } => {
    const id = String(++animationId);
    const w = initWorker();
    
    activeAnimations.set(id, callbacks);
    
    w.postMessage({
      type: 'START_ANIMATION',
      id,
      config
    } as AnimationWorkerMessage);
    
    return {
      stop: () => {
        w.postMessage({
          type: 'STOP_ANIMATION',
          id
        } as AnimationWorkerMessage);
      },
      pause: () => {
        w.postMessage({
          type: 'PAUSE_ANIMATION',
          id
        } as AnimationWorkerMessage);
      },
      resume: () => {
        w.postMessage({
          type: 'RESUME_ANIMATION',
          id
        } as AnimationWorkerMessage);
      },
      id
    };
  };

  // Convenience methods for common animations
  const fadeIn = (
    element: HTMLElement,
    duration = 300,
    onComplete?: () => void
  ) => {
    element.style.opacity = '0';
    
    return animate(
      { duration, easing: 'ease-out' },
      {
        onFrame: (progress) => {
          element.style.opacity = String(progress);
        },
        onComplete
      }
    );
  };

  const fadeOut = (
    element: HTMLElement,
    duration = 300,
    onComplete?: () => void
  ) => {
    const startOpacity = parseFloat(getComputedStyle(element).opacity) || 1;
    
    return animate(
      { duration, easing: 'ease-in' },
      {
        onFrame: (progress) => {
          element.style.opacity = String(startOpacity * (1 - progress));
        },
        onComplete
      }
    );
  };

  const flash = (
    element: HTMLElement,
    duration = 800,
    className = 'flash',
    onComplete?: () => void
  ) => {
    element.classList.add(className);
    
    return animate(
      { duration, easing: 'ease-out' },
      {
        onComplete: () => {
          element.classList.remove(className);
          onComplete?.();
        }
      }
    );
  };

  const slide = (
    element: HTMLElement,
    from: { x?: number; y?: number },
    to: { x?: number; y?: number },
    duration = 500,
    onComplete?: () => void
  ) => {
    const startX = from.x ?? 0;
    const startY = from.y ?? 0;
    const endX = to.x ?? 0;
    const endY = to.y ?? 0;
    
    element.style.transform = `translate(${startX}px, ${startY}px)`;
    
    return animate(
      { duration, easing: 'ease-out' },
      {
        onFrame: (progress) => {
          const currentX = startX + (endX - startX) * progress;
          const currentY = startY + (endY - startY) * progress;
          element.style.transform = `translate(${currentX}px, ${currentY}px)`;
        },
        onComplete
      }
    );
  };

  const setAnimationFrameRate = (fps: number) => {
    const w = initWorker();
    w.postMessage({
      type: 'SET_FRAME_RATE',
      fps
    } as AnimationWorkerMessage);
  };

  // Cleanup
  onCleanup(() => {
    if (worker) {
      // Stop all active animations
      activeAnimations.forEach((_, id) => {
        worker!.postMessage({
          type: 'STOP_ANIMATION',
          id
        } as AnimationWorkerMessage);
      });
      
      worker.terminate();
      worker = null;
    }
    activeAnimations.clear();
  });

  return {
    animate,
    fadeIn,
    fadeOut,
    flash,
    slide,
    setFrameRate: setAnimationFrameRate,
    currentFrameRate: frameRate
  };
}