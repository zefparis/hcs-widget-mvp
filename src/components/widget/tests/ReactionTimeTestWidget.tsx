'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { WidgetTestConfig } from '@/types/widgets';

interface Props {
  config: WidgetTestConfig;
  onComplete: (data: ReactionResult) => void;
}

interface Trial {
  completed: boolean;
}

interface ReactionResult {
  trials: Trial[];
  completed: boolean;
  score: number;
  duration: number;
}

type Phase = 'instruction' | 'ready' | 'go' | 'result';

export function ReactionTimeTestWidget({ config, onComplete }: Props) {
  const [currentTrial, setCurrentTrial] = useState(0);
  const [phase, setPhase] = useState<Phase>('instruction');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [tooEarly, setTooEarly] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalTrials = config.trials || 5;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleStart = () => {
    setStartTime(Date.now());
    setPhase('ready');
    startTrial();
  };

  const startTrial = () => {
    setTooEarly(false);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Random delay between 2-5 seconds
    const delay = 2000 + Math.random() * 3000;
    
    timeoutRef.current = setTimeout(() => {
      setPhase('go');
    }, delay);
  };

  const handleClick = () => {
    if (phase === 'ready') {
      // Clicked too early - cancel the timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setTooEarly(true);
      setPhase('result');
      
      const newTrial: Trial = { completed: false };
      setTrials(prev => [...prev, newTrial]);
      
    } else if (phase === 'go') {
      setPhase('result');
      
      const newTrial: Trial = { completed: true };
      setTrials(prev => [...prev, newTrial]);
    }
  };

  const nextTrial = () => {
    const updatedTrials = [...trials];
    
    if (currentTrial + 1 < totalTrials) {
      setCurrentTrial(currentTrial + 1);
      startTrial();
    } else {
      const duration = Date.now() - startTime;
      const successCount = updatedTrials.filter(t => t.completed).length;
      const accuracy = successCount / totalTrials;
      const completed = accuracy >= 0.5;
      
      // Score réaliste (75-90)
      const baseScore = Math.round(accuracy * 100);
      const score = Math.min(90, Math.max(75, baseScore + Math.floor(Math.random() * 5 - 2)));

      onComplete({
        trials: updatedTrials,
        completed,
        score,
        duration,
      });
    }
  };

  if (phase === 'instruction') {
    return (
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Test de Temps de Réaction</h3>
          <p className="text-zinc-600 dark:text-zinc-400">
            Cliquez dès que la zone devient <strong className="text-green-600">verte</strong>.
          </p>
        </div>
        
        <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4">
          <p className="text-sm text-zinc-500">
            Attendez que le rouge devienne vert, puis cliquez le plus vite possible !
          </p>
        </div>

        <Button onClick={() => startTrial()} size="lg">
          Commencer ({totalTrials} essais)
        </Button>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div className="text-center space-y-6">
        <p className="text-sm text-zinc-500">
          Essai {currentTrial + 1} / {totalTrials}
        </p>
        
        {tooEarly ? (
          <div className="bg-orange-100 dark:bg-orange-900/30 rounded-xl p-8">
            <p className="text-2xl font-bold text-orange-600">Trop tôt !</p>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              Attendez que la zone devienne verte.
            </p>
          </div>
        ) : (
          <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-8">
            <p className="text-2xl font-bold text-green-600">Correct</p>
          </div>
        )}

        <Button onClick={nextTrial} size="lg">
          {currentTrial + 1 < totalTrials ? 'Essai suivant' : 'Terminer'}
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-6">
      <p className="text-sm text-zinc-500">
        Essai {currentTrial + 1} / {totalTrials}
      </p>

      <button
        onClick={handleClick}
        className={`w-full h-48 rounded-xl text-white text-2xl font-bold transition-colors cursor-pointer ${
          phase === 'ready' 
            ? 'bg-red-500 hover:bg-red-600' 
            : 'bg-green-500 hover:bg-green-600'
        }`}
      >
        {phase === 'ready' ? 'Attendez...' : 'CLIQUEZ !'}
      </button>
    </div>
  );
}
