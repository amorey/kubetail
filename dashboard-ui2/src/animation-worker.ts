// Web Worker for animation coordination
// Manages animation timing and reduces main thread animation overhead

export type AnimationConfig = {
  duration: number;
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
  delay?: number;
};

export type AnimationWorkerMessage = 
  | { type: 'START_ANIMATION'; id: string; config: AnimationConfig }
  | { type: 'STOP_ANIMATION'; id: string }
  | { type: 'PAUSE_ANIMATION'; id: string }
  | { type: 'RESUME_ANIMATION'; id: string }
  | { type: 'SET_FRAME_RATE'; fps: number };

export type AnimationWorkerResponse = 
  | { type: 'ANIMATION_FRAME'; id: string; progress: number; elapsed: number }
  | { type: 'ANIMATION_COMPLETE'; id: string }
  | { type: 'ANIMATION_STOPPED'; id: string }
  | { type: 'FRAME_RATE_UPDATED'; fps: number };

type ActiveAnimation = {
  id: string;
  config: AnimationConfig;
  startTime: number;
  pausedAt?: number;
  pausedDuration: number;
};

let frameRate = 60; // Default 60fps
let frameInterval = 1000 / frameRate;
let animationTimer: number | null = null;
let activeAnimations = new Map<string, ActiveAnimation>();

const easingFunctions = {
  linear: (t: number) => t,
  ease: (t: number) => t * t * (3.0 - 2.0 * t),
  'ease-in': (t: number) => t * t,
  'ease-out': (t: number) => t * (2.0 - t),
  'ease-in-out': (t: number) => t < 0.5 ? 2.0 * t * t : -1.0 + (4.0 - 2.0 * t) * t
};

const updateAnimations = () => {
  const currentTime = performance.now();
  const completed: string[] = [];
  
  activeAnimations.forEach((animation) => {
    const { id, config, startTime, pausedAt, pausedDuration } = animation;
    
    if (pausedAt !== undefined) {
      return; // Skip paused animations
    }
    
    const adjustedStartTime = startTime + pausedDuration + (config.delay || 0);
    const elapsed = currentTime - adjustedStartTime;
    
    if (elapsed < 0) {
      return; // Animation hasn't started yet due to delay
    }
    
    const progress = Math.min(elapsed / config.duration, 1);
    const easingFn = easingFunctions[config.easing || 'ease'];
    const easedProgress = easingFn(progress);
    
    self.postMessage({
      type: 'ANIMATION_FRAME',
      id,
      progress: easedProgress,
      elapsed
    } as AnimationWorkerResponse);
    
    if (progress >= 1) {
      completed.push(id);
    }
  });
  
  // Clean up completed animations
  completed.forEach(id => {
    activeAnimations.delete(id);
    self.postMessage({
      type: 'ANIMATION_COMPLETE',
      id
    } as AnimationWorkerResponse);
  });
  
  // Continue animation loop if there are active animations
  if (activeAnimations.size > 0) {
    animationTimer = self.setTimeout(updateAnimations, frameInterval);
  } else {
    animationTimer = null;
  }
};

const startAnimation = (id: string, config: AnimationConfig) => {
  // Stop existing animation with same ID
  if (activeAnimations.has(id)) {
    stopAnimation(id);
  }
  
  const animation: ActiveAnimation = {
    id,
    config,
    startTime: performance.now(),
    pausedDuration: 0
  };
  
  activeAnimations.set(id, animation);
  
  // Start animation loop if not already running
  if (animationTimer === null) {
    animationTimer = self.setTimeout(updateAnimations, frameInterval);
  }
};

const stopAnimation = (id: string) => {
  const animation = activeAnimations.get(id);
  if (animation) {
    activeAnimations.delete(id);
    self.postMessage({
      type: 'ANIMATION_STOPPED',
      id
    } as AnimationWorkerResponse);
  }
};

const pauseAnimation = (id: string) => {
  const animation = activeAnimations.get(id);
  if (animation && animation.pausedAt === undefined) {
    animation.pausedAt = performance.now();
  }
};

const resumeAnimation = (id: string) => {
  const animation = activeAnimations.get(id);
  if (animation && animation.pausedAt !== undefined) {
    const pauseDuration = performance.now() - animation.pausedAt;
    animation.pausedDuration += pauseDuration;
    animation.pausedAt = undefined;
  }
};

const setFrameRate = (fps: number) => {
  frameRate = Math.max(1, Math.min(120, fps)); // Clamp between 1-120 fps
  frameInterval = 1000 / frameRate;
  
  self.postMessage({
    type: 'FRAME_RATE_UPDATED',
    fps: frameRate
  } as AnimationWorkerResponse);
};

const processMessage = (event: MessageEvent<AnimationWorkerMessage>) => {
  const { type } = event.data;
  
  switch (type) {
    case 'START_ANIMATION': {
      const { id, config } = event.data;
      startAnimation(id, config);
      break;
    }
    
    case 'STOP_ANIMATION': {
      const { id } = event.data;
      stopAnimation(id);
      break;
    }
    
    case 'PAUSE_ANIMATION': {
      const { id } = event.data;
      pauseAnimation(id);
      break;
    }
    
    case 'RESUME_ANIMATION': {
      const { id } = event.data;
      resumeAnimation(id);
      break;
    }
    
    case 'SET_FRAME_RATE': {
      const { fps } = event.data;
      setFrameRate(fps);
      break;
    }
    
    default:
      // Unknown message type - ignore
      break;
  }
};

self.addEventListener('message', processMessage);